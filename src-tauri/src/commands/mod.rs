use crate::models::{
    BatchReplacementResult, ConfigCollection, ConfigItem, ConfigValidation, ErrorSeverity,
    FileOperation, HealthError, HealthStatus, ImageInfo, LinkReplacement, NotificationConfig,
    OSSConfig, OSSConnectionTest, ObjectInfo, PaginatedResult, ProgressNotification,
    ReplacementResult, SaveOptions, ScanResult, SystemHealth, UploadHistoryRecord, UploadMode,
    UploadProgress, UploadResult, UploadTaskInfo, UploadTaskManager, UploadTaskStatus,
    ValidationResult,
};
use crate::services::history_service::{HistoryQuery, HistoryStatistics};
use crate::services::{ConfigService, FileService, HistoryService, ImageService, OSSService};
use crate::utils::error::AppError;
use crate::{log_debug, log_error, log_info};
use std::collections::HashMap;
use std::path::Path;

pub mod progress;

use progress::PROGRESS_NOTIFIER;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[cfg(test)]
mod tests;

// ============================================================================
// Rate Limiting
// ============================================================================

struct RateLimiter {
    requests: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
    max_requests: usize,
    window: Duration,
}

impl RateLimiter {
    fn new(max_requests: usize, window: Duration) -> Self {
        Self {
            requests: Arc::new(Mutex::new(HashMap::new())),
            max_requests,
            window,
        }
    }

    fn check_rate_limit(&self, key: &str) -> Result<(), AppError> {
        let now = Instant::now();
        let mut requests = self
            .requests
            .lock()
            .map_err(|e| AppError::Security(e.to_string()))?;

        let entry = requests.entry(key.to_string()).or_insert_with(Vec::new);

        // Remove old requests outside the window
        entry.retain(|&time| now.duration_since(time) < self.window);

        // Check if we're over the limit
        if entry.len() >= self.max_requests {
            return Err(AppError::Security("Rate limit exceeded".to_string()));
        }

        // Add current request
        entry.push(now);

        Ok(())
    }
}

lazy_static::lazy_static! {
    static ref UPLOAD_RATE_LIMITER: RateLimiter = RateLimiter::new(10, Duration::from_secs(60));
    static ref CONFIG_RATE_LIMITER: RateLimiter = RateLimiter::new(5, Duration::from_secs(60));
    static ref SCAN_RATE_LIMITER: RateLimiter = RateLimiter::new(20, Duration::from_secs(60));
}

// ============================================================================
// Parameter Validation Functions
// ============================================================================

/// Validates file paths for security and existence
pub fn validate_file_paths(paths: &[String]) -> Result<(), AppError> {
    if paths.is_empty() {
        return Err(AppError::Validation(
            "File paths cannot be empty".to_string(),
        ));
    }

    if paths.len() > 100 {
        return Err(AppError::Validation(
            "Too many files selected (max 100)".to_string(),
        ));
    }

    for path in paths {
        if path.is_empty() {
            return Err(AppError::Validation(
                "File path cannot be empty".to_string(),
            ));
        }

        // Security check: prevent path traversal attacks
        if path.contains("..") || path.contains("~") {
            return Err(AppError::Security("Invalid file path detected".to_string()));
        }

        let path_obj = Path::new(path);
        if !path_obj.exists() {
            return Err(AppError::FileSystem(format!("File not found: {}", path)));
        }

        // Check if it's actually a file
        if !path_obj.is_file() {
            return Err(AppError::Validation(format!(
                "Path is not a file: {}",
                path
            )));
        }

        // Check file extension for markdown files
        if let Some(ext) = path_obj.extension() {
            let ext_str = ext.to_string_lossy().to_lowercase();
            if !["md", "markdown"].contains(&ext_str.as_str()) {
                return Err(AppError::Validation(format!(
                    "File is not a markdown file: {}",
                    path
                )));
            }
        } else {
            return Err(AppError::Validation(format!(
                "File has no extension: {}",
                path
            )));
        }
    }

    Ok(())
}

/// Validates image IDs
#[allow(dead_code)]
pub fn validate_image_ids(image_ids: &[String]) -> Result<(), AppError> {
    if image_ids.is_empty() {
        return Err(AppError::Validation(
            "Image IDs cannot be empty".to_string(),
        ));
    }

    if image_ids.len() > 50 {
        return Err(AppError::Validation(
            "Too many images selected (max 50)".to_string(),
        ));
    }

    for id in image_ids {
        if id.is_empty() {
            return Err(AppError::Validation("Image ID cannot be empty".to_string()));
        }

        // Basic UUID format validation
        if id.len() != 36 || id.chars().filter(|&c| c == '-').count() != 4 {
            return Err(AppError::Validation(format!(
                "Invalid image ID format: {}",
                id
            )));
        }
    }

    Ok(())
}

/// Validates OSS configuration
pub fn validate_oss_config_params(config: &OSSConfig) -> Result<(), AppError> {
    if config.endpoint.is_empty() {
        return Err(AppError::Validation(
            "OSS endpoint cannot be empty".to_string(),
        ));
    }

    if config.access_key_id.is_empty() {
        return Err(AppError::Validation(
            "Access key ID cannot be empty".to_string(),
        ));
    }

    if config.access_key_secret.is_empty() {
        return Err(AppError::Validation(
            "Access key secret cannot be empty".to_string(),
        ));
    }

    if config.bucket.is_empty() {
        return Err(AppError::Validation(
            "Bucket name cannot be empty".to_string(),
        ));
    }

    if config.region.is_empty() {
        return Err(AppError::Validation("Region cannot be empty".to_string()));
    }

    // Validate compression quality
    if config.compression_quality > 100 {
        return Err(AppError::Validation(
            "Compression quality must be between 0-100".to_string(),
        ));
    }

    // Validate endpoint URL format
    if !config.endpoint.starts_with("http://") && !config.endpoint.starts_with("https://") {
        return Err(AppError::Validation(
            "Endpoint must be a valid URL".to_string(),
        ));
    }

    Ok(())
}

/// Validates pagination parameters
pub fn validate_pagination(
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<(usize, usize), AppError> {
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(20);

    if page == 0 {
        return Err(AppError::Validation(
            "Page number must be greater than 0".to_string(),
        ));
    }

    if page_size == 0 || page_size > 100 {
        return Err(AppError::Validation(
            "Page size must be between 1-100".to_string(),
        ));
    }

    Ok((page, page_size))
}

/// Validates UUID format
pub fn validate_uuid(uuid: &str) -> Result<(), AppError> {
    if uuid.is_empty() {
        return Err(AppError::Validation("UUID cannot be empty".to_string()));
    }

    // Basic UUID format validation (8-4-4-4-12)
    if uuid.len() != 36 {
        return Err(AppError::Validation("Invalid UUID format".to_string()));
    }

    let parts: Vec<&str> = uuid.split('-').collect();
    if parts.len() != 5 {
        return Err(AppError::Validation("Invalid UUID format".to_string()));
    }

    if parts[0].len() != 8
        || parts[1].len() != 4
        || parts[2].len() != 4
        || parts[3].len() != 4
        || parts[4].len() != 12
    {
        return Err(AppError::Validation("Invalid UUID format".to_string()));
    }

    // Check if all characters are hexadecimal
    for part in parts {
        if !part.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(AppError::Validation("Invalid UUID format".to_string()));
        }
    }

    Ok(())
}

// ============================================================================
// File and Scan Commands
// ============================================================================

#[tauri::command]
pub async fn scan_markdown_files(file_paths: Vec<String>) -> Result<Vec<ScanResult>, String> {
    // Rate limiting
    SCAN_RATE_LIMITER
        .check_rate_limit("scan_files")
        .map_err(|e| e.to_string())?;

    // Validate input parameters
    validate_file_paths(&file_paths).map_err(|e| e.to_string())?;

    let file_service = FileService::new().map_err(|e| e.to_string())?;
    file_service
        .scan_markdown_files(file_paths)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_image_info(image_path: String) -> Result<ImageInfo, String> {
    // Validate input parameters
    if image_path.is_empty() {
        return Err("Image path cannot be empty".to_string());
    }

    // Security check: prevent path traversal
    if image_path.contains("..") || image_path.contains("~") {
        return Err("Invalid image path detected".to_string());
    }

    let path = Path::new(&image_path);
    if !path.exists() {
        return Err(format!("Image file not found: {}", image_path));
    }

    if !path.is_file() {
        return Err(format!("Path is not a file: {}", image_path));
    }

    let image_service = ImageService::new();
    image_service
        .get_image_info(&image_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_thumbnail(image_path: String, size: u32) -> Result<Vec<u8>, String> {
    // Validate input parameters
    if image_path.is_empty() {
        return Err("Image path cannot be empty".to_string());
    }

    if size == 0 || size > 1024 {
        return Err("Thumbnail size must be between 1-1024 pixels".to_string());
    }

    // Security check: prevent path traversal
    if image_path.contains("..") || image_path.contains("~") {
        return Err("Invalid image path detected".to_string());
    }

    let path = Path::new(&image_path);
    if !path.exists() {
        return Err(format!("Image file not found: {}", image_path));
    }

    let image_service = ImageService::new();
    image_service
        .generate_thumbnail(&image_path, size)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Upload Commands
// ============================================================================

#[tauri::command]
pub async fn upload_images_with_ids(
    image_data: Vec<(String, String)>, // (file_id, image_path) pairs
    config: OSSConfig,
) -> Result<Vec<UploadResult>, String> {
    log_info!(
        operation = "upload_images_with_ids_command",
        image_count = image_data.len(),
        provider = ?config.provider,
        "Starting upload images with IDs command"
    );

    // Rate limiting
    UPLOAD_RATE_LIMITER
        .check_rate_limit("upload_images")
        .map_err(|e| {
            log_error!(
                operation = "upload_images_with_ids_command",
                error = %e,
                "Rate limit exceeded"
            );
            e.to_string()
        })?;

    // Validate input parameters
    if image_data.is_empty() {
        log_error!(
            operation = "upload_images_with_ids_command",
            error = "Image data cannot be empty",
            "Empty image data provided"
        );
        return Err("Image data cannot be empty".to_string());
    }

    for (file_id, image_path) in &image_data {
        // Validate file ID format (should be UUID)
        if file_id.is_empty()
            || file_id.len() != 36
            || file_id.chars().filter(|&c| c == '-').count() != 4
        {
            log_error!(
                operation = "upload_images_with_ids_command",
                file_id = %file_id,
                error = "Invalid file ID format",
                "File ID must be a valid UUID"
            );
            return Err(format!("Invalid file ID format: {}", file_id));
        }

        log_debug!(
            operation = "upload_images_with_ids_command",
            path_index = 0,
            path = %image_path,
            file_id = %file_id,
            "Validating image path and file ID"
        );

        // Basic path validation (sync version like in original upload_images)
        if image_path.is_empty() {
            log_error!(
                operation = "upload_images_with_ids_command",
                image_path = %image_path,
                file_id = %file_id,
                error = "Image path cannot be empty",
                "Path validation failed"
            );
            return Err("Image path cannot be empty".to_string());
        }

        // Security check: prevent path traversal
        if image_path.contains("..") || image_path.contains("~") {
            log_error!(
                operation = "upload_images_with_ids_command",
                image_path = %image_path,
                file_id = %file_id,
                error = "Invalid image path detected",
                "Security validation failed"
            );
            return Err("Invalid image path detected".to_string());
        }

        let path_obj = Path::new(image_path);
        if !path_obj.exists() {
            log_error!(
                operation = "upload_images_with_ids_command",
                image_path = %image_path,
                file_id = %file_id,
                error = "Image file not found",
                "File validation failed"
            );
            return Err(format!("Image file not found: {}", image_path));
        }

        if !path_obj.is_file() {
            log_error!(
                operation = "upload_images_with_ids_command",
                image_path = %image_path,
                file_id = %file_id,
                error = "Path is not a file",
                "File validation failed"
            );
            return Err(format!("Path is not a file: {}", image_path));
        }
    }

    // Validate OSS configuration (like in original upload_images)
    validate_oss_config_params(&config).map_err(|e| {
        log_error!(
            operation = "upload_images_with_ids_command",
            error = %e,
            "OSS configuration validation failed"
        );
        e.to_string()
    })?;

    log_info!(
        operation = "upload_images_with_ids_command",
        provider = ?config.provider,
        bucket = %config.bucket,
        endpoint = %config.endpoint,
        region = %config.region,
        path_template = %config.path_template,
        cdn_domain = ?config.cdn_domain,
        compression_enabled = config.compression_enabled,
        compression_quality = config.compression_quality,
        access_key_id_prefix = %config.access_key_id.chars().take(8).collect::<String>(),
        "OSS configuration loaded"
    );

    let oss_service = OSSService::new(config).map_err(|e| {
        log_error!(
            operation = "upload_images_with_ids_command",
            error = %e,
            "Failed to create OSS service"
        );
        e.to_string()
    })?;

    log_debug!(
        operation = "upload_images_with_ids_command",
        "OSS service created successfully"
    );

    let image_service = ImageService::new();

    let mut results = Vec::new();

    for (file_id, image_path) in image_data {
        log_debug!(
            operation = "upload_images_with_ids_command",
            image_path = %image_path,
            file_id = %file_id,
            "Processing image for upload"
        );

        // Generate progress callback using the provided file_id
        let progress_callback = {
            let file_id_clone = file_id.clone();
            move |progress: UploadProgress| {
                let _ = PROGRESS_NOTIFIER.update_progress(file_id_clone.clone(), progress);
            }
        };

        match upload_single_image(
            &oss_service,
            &image_service,
            &image_path,
            &file_id, // Use provided file_id instead of generating new UUID
            Some(Box::new(progress_callback)),
        )
        .await
        {
            Ok((url, checksum)) => {
                log_info!(
                    operation = "upload_images_with_ids_command",
                    image_path = %image_path,
                    file_id = %file_id,
                    uploaded_url = %url,
                    checksum = %checksum,
                    "Image uploaded successfully"
                );

                results.push(UploadResult {
                    image_id: file_id.clone(),
                    success: true,
                    uploaded_url: Some(url.clone()),
                    error: None,
                });

                // Store in upload history
                if let Ok(history_service) = HistoryService::new() {
                    let image_name = std::path::Path::new(&image_path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let history_record = UploadHistoryRecord {
                        id: uuid::Uuid::new_v4().to_string(),
                        timestamp: chrono::Utc::now(),
                        image_name,
                        uploaded_url: url,
                        upload_mode: UploadMode::ImageUpload,
                        source_file: None,
                        file_size: std::fs::metadata(&image_path).map(|m| m.len()).unwrap_or(0),
                        checksum,
                    };

                    let _ = history_service.add_upload_record(history_record).await;
                }

                // Send final completion progress before cleanup
                let final_progress = crate::models::UploadProgress {
                    image_id: file_id.clone(),
                    progress: 100.0,
                    bytes_uploaded: std::fs::metadata(&image_path).map(|m| m.len()).unwrap_or(0),
                    total_bytes: std::fs::metadata(&image_path).map(|m| m.len()).unwrap_or(0),
                    speed: None,
                };
                let _ = PROGRESS_NOTIFIER.update_progress(file_id.clone(), final_progress);

                // Small delay to ensure frontend receives the completion event
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                // Remove progress tracking for completed upload
                let _ = PROGRESS_NOTIFIER.remove_progress(&file_id);
            }
            Err(e) => {
                log_error!(
                    operation = "upload_images_with_ids_command",
                    image_path = %image_path,
                    file_id = %file_id,
                    error = %e,
                    "Image upload failed"
                );

                results.push(UploadResult {
                    image_id: file_id.clone(),
                    success: false,
                    uploaded_url: None,
                    error: Some(e.to_string()),
                });

                // Note: We only record successful uploads in the new design
                // Failed uploads are not stored in history

                // Send final progress for failed upload (progress remains as is, but ensure UI gets final state)
                if let Ok(Some(mut progress)) = PROGRESS_NOTIFIER.get_progress(&file_id) {
                    // Mark as completed with error (UI can distinguish by checking results)
                    progress.progress = 100.0;
                    let _ = PROGRESS_NOTIFIER.update_progress(file_id.clone(), progress);

                    // Small delay to ensure frontend receives the completion event
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }

                // Remove progress tracking for failed upload
                let _ = PROGRESS_NOTIFIER.remove_progress(&file_id);
            }
        }
    }

    log_info!(
        operation = "upload_images_with_ids_command",
        total_images = results.len(),
        successful_uploads = results.iter().filter(|r| r.success).count(),
        failed_uploads = results.iter().filter(|r| !r.success).count(),
        "Upload images with IDs command completed"
    );

    Ok(results)
}

#[tauri::command]
pub async fn upload_images(
    image_paths: Vec<String>,
    config: OSSConfig,
) -> Result<Vec<UploadResult>, String> {
    // Rate limiting
    UPLOAD_RATE_LIMITER
        .check_rate_limit("upload_images")
        .map_err(|e| {
            log_error!(
                operation = "upload_images_command",
                error = %e,
                "Rate limit exceeded"
            );
            e.to_string()
        })?;

    // Validate input parameters
    if image_paths.is_empty() {
        log_error!(
            operation = "upload_images_command",
            error = "Image paths cannot be empty",
            "Validation failed"
        );
        return Err("Image paths cannot be empty".to_string());
    }

    if image_paths.len() > 50 {
        log_error!(
            operation = "upload_images_command",
            image_count = image_paths.len(),
            error = "Too many images selected (max 50)",
            "Validation failed"
        );
        return Err("Too many images selected (max 50)".to_string());
    }

    // Validate each image path
    for (index, path) in image_paths.iter().enumerate() {
        log_debug!(
            operation = "upload_images_command",
            path_index = index,
            path = %path,
            "Validating image path"
        );

        if path.is_empty() {
            log_error!(
                operation = "upload_images_command",
                path_index = index,
                error = "Image path cannot be empty",
                "Path validation failed"
            );
            return Err("Image path cannot be empty".to_string());
        }

        // Security check: prevent path traversal
        if path.contains("..") || path.contains("~") {
            log_error!(
                operation = "upload_images_command",
                path_index = index,
                path = %path,
                error = "Invalid image path detected",
                "Security validation failed"
            );
            return Err("Invalid image path detected".to_string());
        }

        let path_obj = Path::new(path);
        if !path_obj.exists() {
            log_error!(
                operation = "upload_images_command",
                path_index = index,
                path = %path,
                error = "Image file not found",
                "File validation failed"
            );
            return Err(format!("Image file not found: {}", path));
        }

        if !path_obj.is_file() {
            log_error!(
                operation = "upload_images_command",
                path_index = index,
                path = %path,
                error = "Path is not a file",
                "File validation failed"
            );
            return Err(format!("Path is not a file: {}", path));
        }
    }

    // Log OSS configuration details (without sensitive data)
    log_info!(
        operation = "upload_images_command",
        provider = ?config.provider,
        bucket = %config.bucket,
        endpoint = %config.endpoint,
        region = %config.region,
        path_template = %config.path_template,
        cdn_domain = ?config.cdn_domain,
        compression_enabled = config.compression_enabled,
        compression_quality = config.compression_quality,
        access_key_id_prefix = %config.access_key_id.chars().take(8).collect::<String>(),
        "OSS configuration loaded"
    );

    validate_oss_config_params(&config).map_err(|e| {
        log_error!(
            operation = "upload_images_command",
            error = %e,
            "OSS configuration validation failed"
        );
        e.to_string()
    })?;

    log_debug!(
        operation = "upload_images_command",
        "Creating OSS service with validated configuration"
    );

    let oss_service = OSSService::new(config).map_err(|e| {
        log_error!(
            operation = "upload_images_command",
            error = %e,
            "Failed to create OSS service"
        );
        e.to_string()
    })?;

    log_debug!(
        operation = "upload_images_command",
        "OSS service created successfully"
    );

    let image_service = ImageService::new();

    let mut results = Vec::new();

    for image_path in image_paths {
        let image_id = uuid::Uuid::new_v4().to_string();

        log_debug!(
            operation = "upload_images_command",
            image_path = %image_path,
            image_id = %image_id,
            "Processing image for upload"
        );

        // Generate progress callback
        let progress_callback = {
            let image_id_clone = image_id.clone();
            move |progress: UploadProgress| {
                let _ = PROGRESS_NOTIFIER.update_progress(image_id_clone.clone(), progress);
            }
        };

        match upload_single_image(
            &oss_service,
            &image_service,
            &image_path,
            &image_id,
            Some(Box::new(progress_callback)),
        )
        .await
        {
            Ok((url, checksum)) => {
                log_info!(
                    operation = "upload_images_command",
                    image_path = %image_path,
                    image_id = %image_id,
                    uploaded_url = %url,
                    checksum = %checksum,
                    "Image uploaded successfully"
                );

                results.push(UploadResult {
                    image_id: image_id.clone(),
                    success: true,
                    uploaded_url: Some(url.clone()),
                    error: None,
                });

                // Store in upload history
                if let Ok(history_service) = HistoryService::new() {
                    let image_name = std::path::Path::new(&image_path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();

                    let history_record = UploadHistoryRecord {
                        id: uuid::Uuid::new_v4().to_string(),
                        timestamp: chrono::Utc::now(),
                        image_name,
                        uploaded_url: url,
                        upload_mode: UploadMode::ImageUpload,
                        source_file: None,
                        file_size: std::fs::metadata(&image_path).map(|m| m.len()).unwrap_or(0),
                        checksum,
                    };

                    let _ = history_service.add_upload_record(history_record).await;
                }

                // Send final completion progress before cleanup
                let final_progress = crate::models::UploadProgress {
                    image_id: image_id.clone(),
                    progress: 100.0,
                    bytes_uploaded: std::fs::metadata(&image_path).map(|m| m.len()).unwrap_or(0),
                    total_bytes: std::fs::metadata(&image_path).map(|m| m.len()).unwrap_or(0),
                    speed: None,
                };
                let _ = PROGRESS_NOTIFIER.update_progress(image_id.clone(), final_progress);

                // Small delay to ensure frontend receives the completion event
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                // Remove progress tracking for completed upload
                let _ = PROGRESS_NOTIFIER.remove_progress(&image_id);
            }
            Err(e) => {
                log_error!(
                    operation = "upload_images_command",
                    image_path = %image_path,
                    image_id = %image_id,
                    error = %e,
                    "Image upload failed"
                );

                results.push(UploadResult {
                    image_id: image_id.clone(),
                    success: false,
                    uploaded_url: None,
                    error: Some(e.to_string()),
                });

                // Note: We only record successful uploads in the new design
                // Failed uploads are not stored in history

                // Send final progress for failed upload (progress remains as is, but ensure UI gets final state)
                if let Ok(Some(mut progress)) = PROGRESS_NOTIFIER.get_progress(&image_id) {
                    // Mark as completed with error (UI can distinguish by checking results)
                    progress.progress = 100.0;
                    let _ = PROGRESS_NOTIFIER.update_progress(image_id.clone(), progress);

                    // Small delay to ensure frontend receives the completion event
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }

                // Remove progress tracking for failed upload
                let _ = PROGRESS_NOTIFIER.remove_progress(&image_id);
            }
        }
    }

    log_info!(
        operation = "upload_images_command",
        total_images = results.len(),
        successful_uploads = results.iter().filter(|r| r.success).count(),
        failed_uploads = results.iter().filter(|r| !r.success).count(),
        "Upload images command completed"
    );

    Ok(results)
}

/// Helper function to upload a single image
async fn upload_single_image(
    oss_service: &OSSService,
    image_service: &ImageService,
    image_path: &str,
    _image_id: &str,
    progress_callback: Option<Box<dyn Fn(UploadProgress) + Send + Sync>>,
) -> Result<(String, String), AppError> {
    use std::fs;
    use std::path::Path;

    log_info!(
        operation = "upload_single_image",
        image_path = %image_path,
        "Starting single image upload process"
    );

    // Calculate checksum first
    log_debug!(
        operation = "upload_single_image",
        image_path = %image_path,
        "Calculating image checksum"
    );
    let checksum = image_service.calculate_checksum(image_path).await?;
    log_debug!(
        checksum = %checksum,
        "Image checksum calculated"
    );

    // Read image file
    log_debug!(
        operation = "upload_single_image",
        image_path = %image_path,
        "Reading image file data"
    );
    let image_data = fs::read(image_path).map_err(|e| {
        log_error!(
            operation = "upload_single_image",
            image_path = %image_path,
            error = %e,
            "Failed to read image file"
        );
        AppError::FileSystem(format!("Failed to read image file: {}", e))
    })?;

    log_debug!(
        image_size = image_data.len(),
        "Image file read successfully"
    );

    // Generate object key based on file name and timestamp
    let file_name = Path::new(image_path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            log_error!(
                operation = "upload_single_image",
                image_path = %image_path,
                "Invalid file name - cannot extract filename from path"
            );
            AppError::FileSystem("Invalid file name".to_string())
        })?;

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let key = format!("images/{}_{}", timestamp, file_name);

    log_info!(
        operation = "upload_single_image",
        image_path = %image_path,
        object_key = %key,
        file_size = image_data.len(),
        checksum = %checksum,
        "Preparing to upload to OSS"
    );

    // Upload to OSS
    let url = oss_service
        .upload_image(&key, &image_data, progress_callback)
        .await
        .map_err(|e| {
            log_error!(
                operation = "upload_single_image",
                image_path = %image_path,
                object_key = %key,
                error = %e,
                "OSS upload failed"
            );
            e
        })?;

    log_info!(
        operation = "upload_single_image",
        image_path = %image_path,
        object_key = %key,
        uploaded_url = %url,
        "Image uploaded successfully"
    );

    Ok((url, checksum))
}

#[tauri::command]
pub async fn get_upload_progress(task_id: String) -> Result<Option<UploadProgress>, String> {
    // Validate input parameters
    if task_id.is_empty() {
        return Err("Task ID cannot be empty".to_string());
    }

    // Basic UUID format validation
    if task_id.len() != 36 || task_id.chars().filter(|&c| c == '-').count() != 4 {
        return Err("Invalid task ID format".to_string());
    }

    PROGRESS_NOTIFIER
        .get_progress(&task_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_upload(task_id: String) -> Result<(), String> {
    // Validate input parameters
    if task_id.is_empty() {
        return Err("Task ID cannot be empty".to_string());
    }

    // Basic UUID format validation
    if task_id.len() != 36 || task_id.chars().filter(|&c| c == '-').count() != 4 {
        return Err("Invalid task ID format".to_string());
    }

    // Remove progress tracking for cancelled upload
    PROGRESS_NOTIFIER
        .remove_progress(&task_id)
        .map_err(|e| e.to_string())?;

    // TODO: Implement actual upload cancellation logic
    Ok(())
}

#[tauri::command]
pub async fn retry_upload(task_id: String) -> Result<(), String> {
    // Validate input parameters
    if task_id.is_empty() {
        return Err("Task ID cannot be empty".to_string());
    }

    // Basic UUID format validation
    if task_id.len() != 36 || task_id.chars().filter(|&c| c == '-').count() != 4 {
        return Err("Invalid task ID format".to_string());
    }

    // Reset progress for retry
    let progress = UploadProgress {
        image_id: task_id.clone(),
        progress: 0.0,
        bytes_uploaded: 0,
        total_bytes: 0,
        speed: None,
    };

    PROGRESS_NOTIFIER
        .update_progress(task_id, progress)
        .map_err(|e| e.to_string())?;

    // TODO: Implement actual upload retry logic
    Ok(())
}

#[tauri::command]
pub async fn upload_images_batch(
    image_paths: Vec<String>,
    config: OSSConfig,
    batch_size: Option<usize>,
) -> Result<Vec<UploadResult>, String> {
    // Rate limiting
    UPLOAD_RATE_LIMITER
        .check_rate_limit("upload_images_batch")
        .map_err(|e| e.to_string())?;

    // Validate input parameters
    if image_paths.is_empty() {
        return Err("Image paths cannot be empty".to_string());
    }

    if image_paths.len() > 100 {
        return Err("Too many images selected (max 100)".to_string());
    }

    let batch_size = batch_size.unwrap_or(5).min(10); // Max 10 concurrent uploads

    // Validate each image path
    for path in &image_paths {
        if path.is_empty() {
            return Err("Image path cannot be empty".to_string());
        }

        // Security check: prevent path traversal
        if path.contains("..") || path.contains("~") {
            return Err("Invalid image path detected".to_string());
        }

        let path_obj = Path::new(path);
        if !path_obj.exists() {
            return Err(format!("Image file not found: {}", path));
        }

        if !path_obj.is_file() {
            return Err(format!("Path is not a file: {}", path));
        }
    }

    validate_oss_config_params(&config).map_err(|e| e.to_string())?;

    let mut results = Vec::new();

    // Process images in batches
    for batch in image_paths.chunks(batch_size) {
        let mut batch_tasks = Vec::new();

        for image_path in batch {
            let image_id = uuid::Uuid::new_v4().to_string();
            let config_clone = config.clone();
            let image_path_clone = image_path.clone();
            let image_id_clone = image_id.clone();

            let task = tokio::spawn(async move {
                // Create services inside the task to avoid lifetime issues
                let oss_service = match OSSService::new(config_clone) {
                    Ok(service) => service,
                    Err(e) => {
                        return UploadResult {
                            image_id: image_id_clone,
                            success: false,
                            uploaded_url: None,
                            error: Some(e.to_string()),
                        };
                    }
                };
                let image_service = ImageService::new();

                // Create progress callback
                let progress_callback = {
                    let image_id_for_callback = image_id_clone.clone();
                    move |progress: UploadProgress| {
                        let _ = PROGRESS_NOTIFIER
                            .update_progress(image_id_for_callback.clone(), progress);
                    }
                };

                let result = upload_single_image(
                    &oss_service,
                    &image_service,
                    &image_path_clone,
                    &image_id_clone,
                    Some(Box::new(progress_callback)),
                )
                .await;

                let upload_result = match result {
                    Ok((url, checksum)) => {
                        // Store in upload history
                        if let Ok(history_service) = HistoryService::new() {
                            let image_name = std::path::Path::new(&image_path_clone)
                                .file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("unknown")
                                .to_string();

                            let history_record = UploadHistoryRecord {
                                id: uuid::Uuid::new_v4().to_string(),
                                timestamp: chrono::Utc::now(),
                                image_name,
                                uploaded_url: url.clone(),
                                upload_mode: UploadMode::ImageUpload,
                                source_file: None,
                                file_size: std::fs::metadata(&image_path_clone)
                                    .map(|m| m.len())
                                    .unwrap_or(0),
                                checksum,
                            };

                            let _ = history_service.add_upload_record(history_record).await;
                        }

                        UploadResult {
                            image_id: image_id_clone.clone(),
                            success: true,
                            uploaded_url: Some(url),
                            error: None,
                        }
                    }
                    Err(e) => {
                        // Note: We only record successful uploads in the new design
                        // Failed uploads are not stored in history

                        UploadResult {
                            image_id: image_id_clone.clone(),
                            success: false,
                            uploaded_url: None,
                            error: Some(e.to_string()),
                        }
                    }
                };

                // Remove progress tracking
                let _ = PROGRESS_NOTIFIER.remove_progress(&image_id_clone);

                upload_result
            });

            batch_tasks.push(task);
        }

        // Wait for batch to complete
        for task in batch_tasks {
            match task.await {
                Ok(result) => results.push(result),
                Err(e) => {
                    results.push(UploadResult {
                        image_id: "unknown".to_string(),
                        success: false,
                        uploaded_url: None,
                        error: Some(format!("Task join error: {}", e)),
                    });
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_all_upload_progress() -> Result<Vec<UploadProgress>, String> {
    PROGRESS_NOTIFIER
        .get_all_progress()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_upload_progress() -> Result<(), String> {
    PROGRESS_NOTIFIER.clear_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_uuid() -> Result<String, String> {
    Ok(uuid::Uuid::new_v4().to_string())
}

// ============================================================================
// OSS Configuration Commands
// ============================================================================

#[tauri::command]
pub async fn save_oss_config(
    config: OSSConfig,
    options: Option<SaveOptions>,
) -> Result<(), String> {
    // Rate limiting
    CONFIG_RATE_LIMITER
        .check_rate_limit("save_config")
        .map_err(|e| e.to_string())?;

    // Validate input parameters
    validate_oss_config_params(&config).map_err(|e| e.to_string())?;

    let config_service = ConfigService::new().map_err(|e| e.to_string())?;

    // Clear cache if force revalidation is requested
    if let Some(opts) = &options {
        if opts.force_revalidate {
            println!("🔄 Force revalidation requested, clearing cache for configuration");
            config_service.clear_config_cache(&config);
        }
    }

    config_service
        .save_config(&config)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_oss_config() -> Result<Option<OSSConfig>, String> {
    let config_service = ConfigService::new().map_err(|e| e.to_string())?;

    config_service
        .load_config()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_oss_connection(config: OSSConfig) -> Result<OSSConnectionTest, String> {
    println!("🔍 Starting OSS connection test...");
    println!("📋 Config details:");
    println!("   Provider: {:?}", config.provider);
    println!("   Endpoint: {}", config.endpoint);
    println!("   Bucket: {}", config.bucket);
    println!("   Region: {}", config.region);
    println!(
        "   Access Key ID: {}***",
        &config.access_key_id[..config.access_key_id.len().min(8)]
    );

    // Validate input parameters
    println!("✅ Validating configuration parameters...");
    if let Err(e) = validate_oss_config_params(&config) {
        println!("❌ Configuration validation failed: {}", e);
        return Err(e.to_string());
    }
    println!("✅ Configuration validation passed");

    println!("🔧 Creating OSS service...");
    let oss_service = match OSSService::new(config.clone()) {
        Ok(service) => {
            println!("✅ OSS service created successfully");
            service
        }
        Err(e) => {
            println!("❌ Failed to create OSS service: {}", e);
            return Err(e.to_string());
        }
    };

    println!("🌐 Testing connection...");
    match oss_service.test_connection().await {
        Ok(result) => {
            println!("✅ Connection test completed");
            println!("📊 Test result:");
            println!("   Success: {}", result.success);
            if let Some(latency) = result.latency {
                println!("   Latency: {}ms", latency);
            }
            if let Some(ref error) = result.error {
                println!("   Error: {}", error);
            }
            Ok(result)
        }
        Err(e) => {
            println!("❌ Connection test failed with error: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn validate_oss_config(config: OSSConfig) -> Result<ConfigValidation, String> {
    // Basic parameter validation first
    validate_oss_config_params(&config).map_err(|e| e.to_string())?;

    let config_service = ConfigService::new().map_err(|e| e.to_string())?;
    config_service
        .validate_config(&config)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_cached_connection_status(
    config: OSSConfig,
) -> Result<Option<OSSConnectionTest>, String> {
    // Basic parameter validation first
    validate_oss_config_params(&config).map_err(|e| e.to_string())?;

    let config_service = ConfigService::new().map_err(|e| e.to_string())?;
    Ok(config_service.get_cached_connection_status(&config).await)
}

#[tauri::command]
pub async fn clear_connection_cache() -> Result<(), String> {
    let config_service = ConfigService::new().map_err(|e| e.to_string())?;
    config_service.clear_all_cache();
    Ok(())
}

#[tauri::command]
pub async fn list_oss_objects(
    config: OSSConfig,
    prefix: String,
) -> Result<Vec<ObjectInfo>, String> {
    // Validate input parameters
    validate_oss_config_params(&config).map_err(|e| e.to_string())?;

    // Validate prefix (allow empty for root listing)
    if prefix.len() > 1000 {
        return Err("Prefix too long (max 1000 characters)".to_string());
    }

    // For now, return an empty list since list_objects is not implemented in our simplified interface
    // TODO: Implement list_objects when needed
    Ok(vec![])
}

#[tauri::command]
pub async fn export_oss_config() -> Result<String, String> {
    let config_service = ConfigService::new().map_err(|e| e.to_string())?;

    let config = config_service
        .load_config()
        .await
        .map_err(|e| e.to_string())?;

    match config {
        Some(config) => {
            let export_data = serde_json::json!({
                "version": "1.0",
                "export_date": chrono::Utc::now().to_rfc3339(),
                "config": config
            });
            serde_json::to_string_pretty(&export_data).map_err(|e| e.to_string())
        }
        None => Err("No configuration found to export".to_string()),
    }
}

#[tauri::command]
pub async fn import_oss_config(config_json: String) -> Result<(), String> {
    // Rate limiting
    CONFIG_RATE_LIMITER
        .check_rate_limit("import_config")
        .map_err(|e| e.to_string())?;

    // Parse the imported JSON
    let import_data: serde_json::Value =
        serde_json::from_str(&config_json).map_err(|e| format!("Invalid JSON format: {}", e))?;

    // Extract the config from the import data
    let config: OSSConfig = if let Some(config_value) = import_data.get("config") {
        serde_json::from_value(config_value.clone())
            .map_err(|e| format!("Invalid configuration format: {}", e))?
    } else {
        // Try to parse the entire JSON as a config (for backward compatibility)
        serde_json::from_str(&config_json)
            .map_err(|e| format!("Invalid configuration format: {}", e))?
    };

    // Validate the imported config
    validate_oss_config_params(&config).map_err(|e| e.to_string())?;

    // Save the imported config
    let config_service = ConfigService::new().map_err(|e| e.to_string())?;

    config_service
        .save_config(&config)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Multi-Config Management Commands
// ============================================================================

#[tauri::command]
pub async fn get_all_configs() -> Result<ConfigCollection, String> {
    let config_service = ConfigService::new().map_err(|e| e.to_string())?;
    config_service
        .load_all_configs()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_config_item(item: ConfigItem) -> Result<(), String> {
    // Rate limiting
    CONFIG_RATE_LIMITER
        .check_rate_limit("save_config_item")
        .map_err(|e| e.to_string())?;

    // Validate the config within the item
    validate_oss_config_params(&item.config).map_err(|e| e.to_string())?;

    let config_service = ConfigService::new().map_err(|e| e.to_string())?;
    config_service
        .save_config_item(item)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_active_config(config_id: String) -> Result<(), String> {
    // Validate UUID format
    validate_uuid(&config_id).map_err(|e| e.to_string())?;

    let config_service = ConfigService::new().map_err(|e| e.to_string())?;
    config_service
        .set_active_config(config_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_config_item(config_id: String) -> Result<(), String> {
    // Rate limiting
    CONFIG_RATE_LIMITER
        .check_rate_limit("delete_config")
        .map_err(|e| e.to_string())?;

    // Validate UUID format
    validate_uuid(&config_id).map_err(|e| e.to_string())?;

    let config_service = ConfigService::new().map_err(|e| e.to_string())?;
    config_service
        .delete_config_item(config_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_active_config() -> Result<Option<ConfigItem>, String> {
    let config_service = ConfigService::new().map_err(|e| e.to_string())?;
    config_service
        .get_active_config()
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// File Operations Commands
// ============================================================================

#[tauri::command]
pub async fn replace_markdown_links(replacements: Vec<LinkReplacement>) -> Result<(), String> {
    log_info!(
        operation = "replace_markdown_links_command",
        replacement_count = replacements.len(),
        "Received request to replace markdown links"
    );

    // Validate input parameters
    if replacements.is_empty() {
        log_error!(
            operation = "replace_markdown_links_command",
            error = "Replacements cannot be empty",
            "Validation failed"
        );
        return Err("Replacements cannot be empty".to_string());
    }

    if replacements.len() > 1000 {
        log_error!(
            operation = "replace_markdown_links_command",
            replacement_count = replacements.len(),
            error = "Too many replacements (max 1000)",
            "Validation failed"
        );
        return Err("Too many replacements (max 1000)".to_string());
    }

    // Validate each replacement
    for (index, replacement) in replacements.iter().enumerate() {
        log_debug!(
            operation = "validate_replacement",
            replacement_index = index,
            file_path = %replacement.file_path,
            old_link = %replacement.old_link,
            new_link = %replacement.new_link,
            line = replacement.line,
            column = replacement.column,
            "Validating replacement"
        );
        if replacement.file_path.is_empty() {
            log_error!(
                operation = "replace_markdown_links_command",
                replacement_index = index,
                error = "File path cannot be empty in replacement",
                "Validation failed"
            );
            return Err("File path cannot be empty in replacement".to_string());
        }

        if replacement.old_link.is_empty() {
            log_error!(
                operation = "replace_markdown_links_command",
                replacement_index = index,
                error = "Old link cannot be empty in replacement",
                "Validation failed"
            );
            return Err("Old link cannot be empty in replacement".to_string());
        }

        if replacement.new_link.is_empty() {
            log_error!(
                operation = "replace_markdown_links_command",
                replacement_index = index,
                error = "New link cannot be empty in replacement",
                "Validation failed"
            );
            return Err("New link cannot be empty in replacement".to_string());
        }

        // Security check: prevent path traversal
        if replacement.file_path.contains("..") || replacement.file_path.contains("~") {
            log_error!(
                operation = "replace_markdown_links_command",
                replacement_index = index,
                file_path = %replacement.file_path,
                error = "Invalid file path detected in replacement",
                "Security validation failed"
            );
            return Err("Invalid file path detected in replacement".to_string());
        }

        let path = Path::new(&replacement.file_path);
        if !path.exists() {
            log_error!(
                operation = "replace_markdown_links_command",
                replacement_index = index,
                file_path = %replacement.file_path,
                error = "File not found",
                "File validation failed"
            );
            return Err(format!("File not found: {}", replacement.file_path));
        }
    }

    log_info!(
        operation = "replace_markdown_links_command",
        replacement_count = replacements.len(),
        "All replacements validated successfully, proceeding with file service"
    );

    let file_service = FileService::new().map_err(|e| {
        log_error!(
            operation = "replace_markdown_links_command",
            error = %e,
            "Failed to create FileService"
        );
        e.to_string()
    })?;

    let result = file_service
        .replace_image_links_batch(replacements)
        .await
        .map_err(|e| {
            log_error!(
                operation = "replace_markdown_links_command",
                error = %e,
                "FileService batch replacement failed"
            );
            e.to_string()
        })?;

    log_info!(
        operation = "replace_markdown_links_command",
        successful_replacements = result.total_successful_replacements,
        failed_replacements = result.total_failed_replacements,
        total_files = result.total_files,
        "Link replacement completed"
    );

    Ok(())
}

#[tauri::command]
pub async fn replace_markdown_links_with_result(
    replacements: Vec<LinkReplacement>,
) -> Result<BatchReplacementResult, String> {
    // Validate input parameters
    if replacements.is_empty() {
        return Err("Replacements cannot be empty".to_string());
    }

    if replacements.len() > 1000 {
        return Err("Too many replacements (max 1000)".to_string());
    }

    // Validate each replacement
    for replacement in &replacements {
        if replacement.file_path.is_empty() {
            return Err("File path cannot be empty in replacement".to_string());
        }

        if replacement.old_link.is_empty() {
            return Err("Old link cannot be empty in replacement".to_string());
        }

        if replacement.new_link.is_empty() {
            return Err("New link cannot be empty in replacement".to_string());
        }

        // Security check: prevent path traversal
        if replacement.file_path.contains("..") || replacement.file_path.contains("~") {
            return Err("Invalid file path detected in replacement".to_string());
        }

        let path = Path::new(&replacement.file_path);
        if !path.exists() {
            return Err(format!("File not found: {}", replacement.file_path));
        }
    }

    let file_service = FileService::new().map_err(|e| e.to_string())?;
    file_service
        .replace_image_links_batch(replacements)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn replace_single_file_links(
    file_path: String,
    replacements: Vec<LinkReplacement>,
) -> Result<ReplacementResult, String> {
    // Validate input parameters
    if file_path.is_empty() {
        return Err("File path cannot be empty".to_string());
    }

    if replacements.is_empty() {
        return Err("Replacements cannot be empty".to_string());
    }

    if replacements.len() > 100 {
        return Err("Too many replacements for single file (max 100)".to_string());
    }

    // Security check: prevent path traversal
    if file_path.contains("..") || file_path.contains("~") {
        return Err("Invalid file path detected".to_string());
    }

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    // Validate each replacement
    for replacement in &replacements {
        if replacement.file_path != file_path {
            return Err("All replacements must be for the same file".to_string());
        }

        if replacement.old_link.is_empty() {
            return Err("Old link cannot be empty in replacement".to_string());
        }

        if replacement.new_link.is_empty() {
            return Err("New link cannot be empty in replacement".to_string());
        }
    }

    let file_service = FileService::new().map_err(|e| e.to_string())?;
    file_service
        .replace_image_links(&file_path, replacements)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// History Commands
// ============================================================================

#[tauri::command]
pub async fn get_upload_history(
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<PaginatedResult<UploadHistoryRecord>, String> {
    // Validate pagination parameters
    let (validated_page, validated_page_size) =
        validate_pagination(page, page_size).map_err(|e| e.to_string())?;

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;

    let offset = (validated_page - 1) * validated_page_size;
    let query = HistoryQuery {
        upload_mode: None, // 返回所有上传模式
        start_date: None,
        end_date: None,
        limit: Some(validated_page_size),
        offset: Some(offset),
    };

    let service_records = history_service
        .get_upload_records(Some(query))
        .await
        .map_err(|e| e.to_string())?;
    let all_records = history_service
        .get_upload_records(None)
        .await
        .map_err(|e| e.to_string())?;
    let total = all_records.len();

    // 直接返回服务记录，不需要转换
    Ok(PaginatedResult {
        items: service_records,
        total,
        page: validated_page,
        page_size: validated_page_size,
        has_more: offset + validated_page_size < total,
    })
}

#[tauri::command]
pub async fn search_history(
    search_term: Option<String>,
    upload_mode: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<PaginatedResult<UploadHistoryRecord>, String> {
    // Validate pagination parameters
    let (validated_page, validated_page_size) =
        validate_pagination(page, page_size).map_err(|e| e.to_string())?;

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;

    // Parse upload mode
    let parsed_upload_mode = if let Some(mode) = upload_mode {
        match mode.as_str() {
            "ImageUpload" => Some(UploadMode::ImageUpload),
            "ArticleUpload" => Some(UploadMode::ArticleUpload),
            _ => return Err("Invalid upload mode".to_string()),
        }
    } else {
        None // 返回所有模式
    };

    // Parse dates
    let parsed_start_date = if let Some(date_str) = start_date {
        Some(
            chrono::DateTime::parse_from_rfc3339(&date_str)
                .map_err(|e| format!("Invalid start date format: {}", e))?
                .with_timezone(&chrono::Utc),
        )
    } else {
        None
    };

    let parsed_end_date = if let Some(date_str) = end_date {
        Some(
            chrono::DateTime::parse_from_rfc3339(&date_str)
                .map_err(|e| format!("Invalid end date format: {}", e))?
                .with_timezone(&chrono::Utc),
        )
    } else {
        None
    };

    let offset = (validated_page - 1) * validated_page_size;
    let query = HistoryQuery {
        upload_mode: parsed_upload_mode,
        start_date: parsed_start_date,
        end_date: parsed_end_date,
        limit: Some(validated_page_size),
        offset: Some(offset),
    };

    let mut service_records = history_service
        .get_upload_records(Some(query))
        .await
        .map_err(|e| e.to_string())?;

    // Apply search term filter if provided
    if let Some(term) = search_term {
        let term_lower = term.to_lowercase();
        service_records.retain(|record| {
            record.image_name.to_lowercase().contains(&term_lower)
                || record.uploaded_url.to_lowercase().contains(&term_lower)
                || record
                    .source_file
                    .as_ref()
                    .is_some_and(|f| f.to_lowercase().contains(&term_lower))
        });
    }

    let total = service_records.len();

    Ok(PaginatedResult {
        items: service_records,
        total,
        page: validated_page,
        page_size: validated_page_size,
        has_more: offset + validated_page_size < total,
    })
}

#[tauri::command]
pub async fn clear_history() -> Result<(), String> {
    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .clear_upload_history(None, None)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn export_history() -> Result<String, String> {
    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    let records = history_service
        .get_upload_records(None)
        .await
        .map_err(|e| e.to_string())?;

    let export_data = serde_json::json!({
        "records": records,
        "export_date": chrono::Utc::now().to_rfc3339(),
        "version": "1.0"
    });

    serde_json::to_string_pretty(&export_data).map_err(|e| e.to_string())
}

// 上传历史记录命令
#[tauri::command]
pub async fn add_upload_history_record(
    image_name: String,
    uploaded_url: String,
    upload_mode: String,
    source_file: Option<String>,
    file_size: u64,
    checksum: String,
) -> Result<String, String> {
    // 参数验证
    if image_name.is_empty() {
        return Err("Image name cannot be empty".to_string());
    }

    if uploaded_url.is_empty() {
        return Err("Uploaded URL cannot be empty".to_string());
    }

    if checksum.is_empty() {
        return Err("Checksum cannot be empty".to_string());
    }

    // 验证上传模式
    let upload_mode_enum = match upload_mode.as_str() {
        "ImageUpload" => UploadMode::ImageUpload,
        "ArticleUpload" => UploadMode::ArticleUpload,
        _ => return Err("Invalid upload mode".to_string()),
    };

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    let record = UploadHistoryRecord {
        id: String::new(), // 服务将生成ID
        timestamp: chrono::Utc::now(),
        image_name,
        uploaded_url,
        upload_mode: upload_mode_enum,
        source_file,
        file_size,
        checksum,
    };

    history_service
        .add_upload_record(record)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_history_statistics() -> Result<HistoryStatistics, String> {
    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .get_statistics()
        .await
        .map_err(|e| e.to_string())
}

// 批量添加上传历史记录
#[tauri::command]
pub async fn add_batch_upload_history_records(
    records: Vec<UploadHistoryRecord>,
) -> Result<Vec<String>, String> {
    if records.is_empty() {
        return Err("Records cannot be empty".to_string());
    }

    // 验证每条记录
    for record in &records {
        if record.image_name.is_empty() {
            return Err("Image name cannot be empty".to_string());
        }
        if record.uploaded_url.is_empty() {
            return Err("Uploaded URL cannot be empty".to_string());
        }
        if record.checksum.is_empty() {
            return Err("Checksum cannot be empty".to_string());
        }
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .add_batch_upload_records(records)
        .await
        .map_err(|e| e.to_string())
}

// 获取上传历史记录
#[tauri::command]
pub async fn get_upload_history_records(
    upload_mode: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<UploadHistoryRecord>, String> {
    let history_service = HistoryService::new().map_err(|e| e.to_string())?;

    let upload_mode_enum = if let Some(mode) = upload_mode {
        match mode.as_str() {
            "ImageUpload" => Some(UploadMode::ImageUpload),
            "ArticleUpload" => Some(UploadMode::ArticleUpload),
            _ => return Err("Invalid upload mode".to_string()),
        }
    } else {
        None
    };

    let start_date_parsed = if let Some(date_str) = start_date {
        Some(
            chrono::DateTime::parse_from_rfc3339(&date_str)
                .map_err(|_| "Invalid start date format")?
                .with_timezone(&chrono::Utc),
        )
    } else {
        None
    };

    let end_date_parsed = if let Some(date_str) = end_date {
        Some(
            chrono::DateTime::parse_from_rfc3339(&date_str)
                .map_err(|_| "Invalid end date format")?
                .with_timezone(&chrono::Utc),
        )
    } else {
        None
    };

    let query = HistoryQuery {
        upload_mode: upload_mode_enum,
        start_date: start_date_parsed,
        end_date: end_date_parsed,
        limit,
        offset,
    };

    history_service
        .get_upload_records(Some(query))
        .await
        .map_err(|e| e.to_string())
}

// 根据checksum查找重复记录
#[tauri::command]
pub async fn find_duplicate_by_checksum(
    checksum: String,
) -> Result<Option<UploadHistoryRecord>, String> {
    if checksum.is_empty() {
        return Err("Checksum cannot be empty".to_string());
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .find_duplicate_by_checksum(&checksum)
        .await
        .map_err(|e| e.to_string())
}

// 删除上传历史记录
#[tauri::command]
pub async fn delete_upload_history_record(id: String) -> Result<bool, String> {
    if id.is_empty() {
        return Err("ID cannot be empty".to_string());
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .delete_upload_record(&id)
        .await
        .map_err(|e| e.to_string())
}

// 清空上传历史记录
#[tauri::command]
pub async fn clear_upload_history(
    upload_mode: Option<String>,
    older_than_days: Option<u32>,
) -> Result<usize, String> {
    let upload_mode_enum = if let Some(mode) = upload_mode {
        match mode.as_str() {
            "ImageUpload" => Some(UploadMode::ImageUpload),
            "ArticleUpload" => Some(UploadMode::ArticleUpload),
            _ => return Err("Invalid upload mode".to_string()),
        }
    } else {
        None
    };

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .clear_upload_history(upload_mode_enum, older_than_days)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_image_history(
    upload_mode: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<UploadHistoryRecord>, String> {
    // 验证限制
    if let Some(limit_val) = limit {
        if limit_val == 0 || limit_val > 1000 {
            return Err("Limit must be between 1 and 1000".to_string());
        }
    }

    // 解析上传模式
    let upload_mode_enum = if let Some(mode) = upload_mode {
        match mode.as_str() {
            "ImageUpload" => Some(UploadMode::ImageUpload),
            "ArticleUpload" => Some(UploadMode::ArticleUpload),
            _ => return Err("Invalid upload mode".to_string()),
        }
    } else {
        None
    };

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;

    let query = HistoryQuery {
        upload_mode: upload_mode_enum,
        start_date: None,
        end_date: None,
        limit,
        offset: None,
    };

    history_service
        .get_upload_records(Some(query))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_image_history_record(id: String) -> Result<bool, String> {
    if id.is_empty() {
        return Err("Record ID cannot be empty".to_string());
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .delete_upload_record(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_image_history(
    upload_mode: Option<String>,
    older_than_days: Option<u32>,
) -> Result<usize, String> {
    // 解析上传模式
    let upload_mode_enum = if let Some(mode) = upload_mode {
        match mode.as_str() {
            "ImageUpload" => Some(UploadMode::ImageUpload),
            "ArticleUpload" => Some(UploadMode::ArticleUpload),
            _ => return Err("Invalid upload mode".to_string()),
        }
    } else {
        None
    };

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .clear_upload_history(upload_mode_enum, older_than_days)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cleanup_old_history(older_than_days: u32) -> Result<usize, String> {
    if older_than_days == 0 {
        return Err("Days must be greater than 0".to_string());
    }

    if older_than_days > 3650 {
        // 10 years max
        return Err("Days cannot exceed 3650".to_string());
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .clear_upload_history(None, Some(older_than_days))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_file_operations(_limit: Option<usize>) -> Result<Vec<FileOperation>, String> {
    // 在简化的设计中，我们不再跟踪文件操作
    // 返回空列表
    Ok(vec![])
}

// ============================================================================
// Utility Commands
// ============================================================================

#[tauri::command]
pub async fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub async fn validate_file_path(path: String) -> Result<bool, String> {
    // Validate input parameters
    if path.is_empty() {
        return Err("File path cannot be empty".to_string());
    }

    // Security check: prevent path traversal
    if path.contains("..") || path.contains("~") {
        return Err("Invalid file path detected".to_string());
    }

    Ok(std::path::Path::new(&path).exists())
}

#[tauri::command]
pub async fn get_file_size(path: String) -> Result<u64, String> {
    // Validate input parameters
    if path.is_empty() {
        return Err("File path cannot be empty".to_string());
    }

    // Security check: prevent path traversal
    if path.contains("..") || path.contains("~") {
        return Err("Invalid file path detected".to_string());
    }

    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return Err(format!("File not found: {}", path));
    }

    if !path_obj.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }

    std::fs::metadata(&path)
        .map(|metadata| metadata.len())
        .map_err(|e| e.to_string())
}

// ============================================================================
// Progress Monitoring Commands (moved to earlier in file)
// ============================================================================

#[allow(dead_code)]
#[tauri::command]
pub async fn remove_upload_progress(task_id: String) -> Result<(), String> {
    // Validate input parameters
    if task_id.is_empty() {
        return Err("Task ID cannot be empty".to_string());
    }

    // Basic UUID format validation
    if task_id.len() != 36 || task_id.chars().filter(|&c| c == '-').count() != 4 {
        return Err("Invalid task ID format".to_string());
    }

    PROGRESS_NOTIFIER.remove_progress(&task_id)
}

// ============================================================================
// Security and Health Check Commands
// ============================================================================

#[tauri::command]
pub async fn health_check() -> Result<HashMap<String, String>, String> {
    let mut health = HashMap::new();

    health.insert("status".to_string(), "ok".to_string());
    health.insert("version".to_string(), env!("CARGO_PKG_VERSION").to_string());
    health.insert("timestamp".to_string(), chrono::Utc::now().to_rfc3339());

    // Check if services can be initialized
    match FileService::new() {
        Ok(_) => health.insert("file_service".to_string(), "ok".to_string()),
        Err(e) => health.insert("file_service".to_string(), format!("error: {}", e)),
    };

    match ConfigService::new() {
        Ok(_) => health.insert("config_service".to_string(), "ok".to_string()),
        Err(e) => health.insert("config_service".to_string(), format!("error: {}", e)),
    };

    let _image_service = ImageService::new();
    health.insert("image_service".to_string(), "ok".to_string());

    Ok(health)
}

#[tauri::command]
pub async fn validate_system_permissions() -> Result<ValidationResult, String> {
    let mut errors = Vec::new();

    // Check if we can create temporary files
    match tempfile::NamedTempFile::new() {
        Ok(_) => {}
        Err(e) => errors.push(format!("Cannot create temporary files: {}", e)),
    }

    // Check if we can access the config directory
    if let Some(config_dir) = dirs::config_dir() {
        let app_config_dir = config_dir.join("imgtoss");
        if let Err(e) = std::fs::create_dir_all(&app_config_dir) {
            errors.push(format!("Cannot access config directory: {}", e));
        }
    } else {
        errors.push("Cannot determine config directory".to_string());
    }

    Ok(ValidationResult {
        valid: errors.is_empty(),
        errors,
    })
}

// ============================================================================
// Duplicate Detection Commands
// ============================================================================

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DuplicateCheckResult {
    pub checksum: String,
    pub is_duplicate: bool,
    pub existing_record: Option<UploadHistoryRecord>,
    pub existing_url: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DuplicateInfo {
    pub checksum: String,
    pub original_path: String,
    pub existing_url: String,
    pub upload_date: String,
    pub file_size: u64,
}

#[tauri::command]
pub async fn calculate_image_checksum(image_path: String) -> Result<String, String> {
    // Validate input parameters
    if image_path.is_empty() {
        return Err("Image path cannot be empty".to_string());
    }

    // Security check: prevent path traversal
    if image_path.contains("..") || image_path.contains("~") {
        return Err("Invalid image path detected".to_string());
    }

    let path = Path::new(&image_path);
    if !path.exists() {
        return Err(format!("Image file not found: {}", image_path));
    }

    if !path.is_file() {
        return Err(format!("Path is not a file: {}", image_path));
    }

    let image_service = ImageService::new();
    image_service
        .calculate_checksum(&image_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_duplicate_by_checksum(checksum: String) -> Result<DuplicateCheckResult, String> {
    // Validate input parameters
    if checksum.is_empty() {
        return Err("Checksum cannot be empty".to_string());
    }

    // Basic checksum format validation (SHA256 should be 64 hex characters)
    if checksum.len() != 64 || !checksum.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid checksum format".to_string());
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;

    match history_service
        .find_duplicate_by_checksum(&checksum)
        .await
        .map_err(|e| e.to_string())?
    {
        Some(service_record) => {
            // 直接使用 UploadHistoryRecord，不需要转换
            let existing_url = Some(service_record.uploaded_url.clone());

            Ok(DuplicateCheckResult {
                checksum,
                is_duplicate: true,
                existing_record: Some(service_record),
                existing_url,
            })
        }
        None => Ok(DuplicateCheckResult {
            checksum,
            is_duplicate: false,
            existing_record: None,
            existing_url: None,
        }),
    }
}

#[tauri::command]
pub async fn check_duplicates_batch(
    image_paths: Vec<String>,
) -> Result<Vec<DuplicateCheckResult>, String> {
    // Validate input parameters
    if image_paths.is_empty() {
        return Err("Image paths cannot be empty".to_string());
    }

    if image_paths.len() > 100 {
        return Err("Too many images to check (max 100)".to_string());
    }

    // Validate each image path
    for path in &image_paths {
        if path.is_empty() {
            return Err("Image path cannot be empty".to_string());
        }

        // Security check: prevent path traversal
        if path.contains("..") || path.contains("~") {
            return Err("Invalid image path detected".to_string());
        }

        let path_obj = Path::new(path);
        if !path_obj.exists() {
            return Err(format!("Image file not found: {}", path));
        }

        if !path_obj.is_file() {
            return Err(format!("Path is not a file: {}", path));
        }
    }

    let image_service = ImageService::new();
    let history_service = HistoryService::new().map_err(|e| e.to_string())?;

    let mut results = Vec::new();

    for image_path in image_paths {
        // Calculate checksum
        let checksum = image_service
            .calculate_checksum(&image_path)
            .await
            .map_err(|e| e.to_string())?;

        // Check for duplicate
        match history_service
            .find_duplicate_by_checksum(&checksum)
            .await
            .map_err(|e| e.to_string())?
        {
            Some(service_record) => {
                // 直接使用 UploadHistoryRecord，不需要转换
                let existing_url = Some(service_record.uploaded_url.clone());

                results.push(DuplicateCheckResult {
                    checksum,
                    is_duplicate: true,
                    existing_record: Some(service_record),
                    existing_url,
                });
            }
            None => {
                results.push(DuplicateCheckResult {
                    checksum,
                    is_duplicate: false,
                    existing_record: None,
                    existing_url: None,
                });
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_duplicate_info(checksum: String) -> Result<Option<DuplicateInfo>, String> {
    // Validate input parameters
    if checksum.is_empty() {
        return Err("Checksum cannot be empty".to_string());
    }

    // Basic checksum format validation (SHA256 should be 64 hex characters)
    if checksum.len() != 64 || !checksum.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid checksum format".to_string());
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;

    match history_service
        .find_duplicate_by_checksum(&checksum)
        .await
        .map_err(|e| e.to_string())?
    {
        Some(record) => {
            let existing_url = record.uploaded_url.clone();
            let file_size = record.file_size;
            let original_path = record.image_name.clone();

            Ok(Some(DuplicateInfo {
                checksum,
                original_path,
                existing_url,
                upload_date: record.timestamp.to_rfc3339(),
                file_size,
            }))
        }
        None => Ok(None),
    }
}
// ============================================================================
// System Health and Monitoring Commands
// ============================================================================

#[tauri::command]
pub async fn get_system_health() -> Result<SystemHealth, String> {
    let _start_time = std::time::Instant::now();

    // Get system information
    let uptime = get_system_uptime().unwrap_or(0);
    let memory_usage = get_memory_usage().unwrap_or(0);
    let disk_space = get_available_disk_space().unwrap_or(0);

    // Get active upload count
    let active_uploads = PROGRESS_NOTIFIER
        .get_all_progress()
        .map_err(|e| e.to_string())?
        .len() as u32;

    // Determine health status
    let mut errors = Vec::new();
    let mut status = HealthStatus::Healthy;

    // Check memory usage (warn if > 1GB, critical if > 2GB)
    if memory_usage > 2_000_000_000 {
        status = HealthStatus::Critical;
        errors.push(HealthError {
            component: "Memory".to_string(),
            message: format!(
                "High memory usage: {:.1} GB",
                memory_usage as f64 / 1_000_000_000.0
            ),
            severity: ErrorSeverity::Critical,
            timestamp: chrono::Utc::now(),
        });
    } else if memory_usage > 1_000_000_000 {
        if matches!(status, HealthStatus::Healthy) {
            status = HealthStatus::Warning;
        }
        errors.push(HealthError {
            component: "Memory".to_string(),
            message: format!(
                "Elevated memory usage: {:.1} GB",
                memory_usage as f64 / 1_000_000_000.0
            ),
            severity: ErrorSeverity::Medium,
            timestamp: chrono::Utc::now(),
        });
    }

    // Check disk space (warn if < 1GB, critical if < 100MB)
    if disk_space < 100_000_000 {
        status = HealthStatus::Critical;
        errors.push(HealthError {
            component: "Storage".to_string(),
            message: format!(
                "Very low disk space: {:.1} MB",
                disk_space as f64 / 1_000_000.0
            ),
            severity: ErrorSeverity::Critical,
            timestamp: chrono::Utc::now(),
        });
    } else if disk_space < 1_000_000_000 {
        if matches!(status, HealthStatus::Healthy) {
            status = HealthStatus::Warning;
        }
        errors.push(HealthError {
            component: "Storage".to_string(),
            message: format!(
                "Low disk space: {:.1} GB",
                disk_space as f64 / 1_000_000_000.0
            ),
            severity: ErrorSeverity::Medium,
            timestamp: chrono::Utc::now(),
        });
    }

    // Check for too many active uploads
    if active_uploads > 20 {
        if matches!(status, HealthStatus::Healthy) {
            status = HealthStatus::Warning;
        }
        errors.push(HealthError {
            component: "Uploads".to_string(),
            message: format!("High number of active uploads: {}", active_uploads),
            severity: ErrorSeverity::Medium,
            timestamp: chrono::Utc::now(),
        });
    }

    Ok(SystemHealth {
        status,
        uptime,
        memory_usage,
        disk_space,
        active_uploads,
        last_check: chrono::Utc::now(),
        errors,
    })
}

#[tauri::command]
pub async fn get_notification_config() -> Result<NotificationConfig, String> {
    // For now, return default config. In a real implementation, this would be loaded from storage
    Ok(NotificationConfig::default())
}

#[tauri::command]
pub async fn update_notification_config(config: NotificationConfig) -> Result<(), String> {
    // Validate config
    if config.dismiss_timeout > 60000 {
        return Err("Dismiss timeout cannot exceed 60 seconds".to_string());
    }

    // TODO: Save config to storage
    // For now, just validate and return success
    Ok(())
}

#[tauri::command]
pub async fn send_notification(notification: ProgressNotification) -> Result<(), String> {
    // Validate notification
    if notification.title.is_empty() {
        return Err("Notification title cannot be empty".to_string());
    }

    if notification.message.is_empty() {
        return Err("Notification message cannot be empty".to_string());
    }

    // TODO: In a real implementation, this would emit the notification to the frontend
    // For now, just validate and return success
    Ok(())
}

// ============================================================================
// Enhanced Upload Task Management Commands
// ============================================================================

#[tauri::command]
pub async fn cancel_upload_task(task_id: String) -> Result<(), String> {
    // Validate input parameters
    if task_id.is_empty() {
        return Err("Task ID cannot be empty".to_string());
    }

    // Basic UUID format validation
    if task_id.len() != 36 || task_id.chars().filter(|&c| c == '-').count() != 4 {
        return Err("Invalid task ID format".to_string());
    }

    // Remove progress tracking for cancelled upload
    PROGRESS_NOTIFIER
        .remove_progress(&task_id)
        .map_err(|e| e.to_string())?;

    // TODO: Implement actual upload cancellation logic with cancellation tokens
    // This would involve:
    // 1. Setting a cancellation flag for the upload task
    // 2. Interrupting the upload operation
    // 3. Cleaning up any partial uploads

    Ok(())
}

#[tauri::command]
pub async fn retry_upload_task(task_id: String, max_retries: Option<u32>) -> Result<(), String> {
    // Validate input parameters
    if task_id.is_empty() {
        return Err("Task ID cannot be empty".to_string());
    }

    // Basic UUID format validation
    if task_id.len() != 36 || task_id.chars().filter(|&c| c == '-').count() != 4 {
        return Err("Invalid task ID format".to_string());
    }

    let max_retries = max_retries.unwrap_or(3);
    if max_retries > 10 {
        return Err("Maximum retries cannot exceed 10".to_string());
    }

    // Reset progress for retry
    let progress = UploadProgress {
        image_id: task_id.clone(),
        progress: 0.0,
        bytes_uploaded: 0,
        total_bytes: 0,
        speed: None,
    };

    PROGRESS_NOTIFIER
        .update_progress(task_id, progress)
        .map_err(|e| e.to_string())?;

    // TODO: Implement actual upload retry logic
    // This would involve:
    // 1. Incrementing retry count
    // 2. Checking if max retries exceeded
    // 3. Re-queuing the upload task
    // 4. Implementing exponential backoff for retries

    Ok(())
}

#[tauri::command]
pub async fn get_upload_task_status(task_id: String) -> Result<Option<UploadTaskInfo>, String> {
    // Validate input parameters
    if task_id.is_empty() {
        return Err("Task ID cannot be empty".to_string());
    }

    // Basic UUID format validation
    if task_id.len() != 36 || task_id.chars().filter(|&c| c == '-').count() != 4 {
        return Err("Invalid task ID format".to_string());
    }

    // Get progress from the notifier
    let progress = PROGRESS_NOTIFIER
        .get_progress(&task_id)
        .map_err(|e| e.to_string())?;

    match progress {
        Some(progress) => {
            // Create a basic task info from progress
            let task_info = UploadTaskInfo {
                id: task_id,
                image_path: "Unknown".to_string(), // Would be stored in a real task manager
                status: if progress.progress >= 100.0 {
                    UploadTaskStatus::Completed
                } else if progress.progress > 0.0 {
                    UploadTaskStatus::Uploading
                } else {
                    UploadTaskStatus::Queued
                },
                progress,
                start_time: chrono::Utc::now(), // Would be stored in a real task manager
                end_time: None,
                retry_count: 0,
                max_retries: 3,
                error: None,
                cancellation_token: None,
            };
            Ok(Some(task_info))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn get_all_upload_tasks() -> Result<UploadTaskManager, String> {
    let all_progress = PROGRESS_NOTIFIER
        .get_all_progress()
        .map_err(|e| e.to_string())?;

    let mut active_tasks = std::collections::HashMap::new();

    for progress in all_progress {
        let task_info = UploadTaskInfo {
            id: progress.image_id.clone(),
            image_path: "Unknown".to_string(), // Would be stored in a real task manager
            status: if progress.progress >= 100.0 {
                UploadTaskStatus::Completed
            } else if progress.progress > 0.0 {
                UploadTaskStatus::Uploading
            } else {
                UploadTaskStatus::Queued
            },
            progress,
            start_time: chrono::Utc::now(), // Would be stored in a real task manager
            end_time: None,
            retry_count: 0,
            max_retries: 3,
            error: None,
            cancellation_token: None,
        };
        active_tasks.insert(task_info.id.clone(), task_info);
    }

    Ok(UploadTaskManager {
        active_tasks,
        completed_tasks: Vec::new(), // Would be populated from persistent storage
        failed_tasks: Vec::new(),    // Would be populated from persistent storage
        cancelled_tasks: Vec::new(), // Would be populated from persistent storage
    })
}

// ============================================================================
// System Utility Functions
// ============================================================================

fn get_system_uptime() -> Result<u64, String> {
    // Simple uptime calculation - in a real implementation, this would use system APIs
    // For now, return a placeholder value
    Ok(3600) // 1 hour
}

fn get_memory_usage() -> Result<u64, String> {
    // Get current process memory usage
    // In a real implementation, this would use system APIs like sysinfo crate
    // For now, return a placeholder value
    Ok(500_000_000) // 500MB
}

fn get_available_disk_space() -> Result<u64, String> {
    // Get available disk space for the current directory
    // In a real implementation, this would use system APIs
    // For now, return a placeholder value
    Ok(10_000_000_000) // 10GB
}
