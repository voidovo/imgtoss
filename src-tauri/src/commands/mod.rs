use crate::models::{
    BackupInfo, BatchReplacementResult, ConfigValidation, ErrorSeverity, HealthError, HealthStatus,
    HistoryRecord, ImageInfo, LinkReplacement, NotificationConfig, OSSConfig, OSSConnectionTest,
    ObjectInfo, PaginatedResult, ProgressNotification, ReplacementResult, RollbackResult,
    ScanResult, SystemHealth, UploadProgress, UploadResult, UploadTaskInfo, UploadTaskManager,
    UploadTaskStatus, ValidationResult, SaveOptions,
};
use crate::services::history_service::{
    FileOperation, HistoryQuery, HistoryStatistics, OperationType,
};
use crate::services::{ConfigService, FileService, HistoryService, ImageService, OSSService};
use crate::utils::error::AppError;
use std::collections::HashMap;
use std::path::Path;

pub mod progress;
mod debug_tencent_cos;

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
pub async fn upload_images(
    image_paths: Vec<String>,
    config: OSSConfig,
) -> Result<Vec<UploadResult>, String> {
    // Rate limiting
    UPLOAD_RATE_LIMITER
        .check_rate_limit("upload_images")
        .map_err(|e| e.to_string())?;

    // Validate input parameters
    if image_paths.is_empty() {
        return Err("Image paths cannot be empty".to_string());
    }

    if image_paths.len() > 50 {
        return Err("Too many images selected (max 50)".to_string());
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

    validate_oss_config_params(&config).map_err(|e| e.to_string())?;

    let oss_service = OSSService::new(config).map_err(|e| e.to_string())?;
    let image_service = ImageService::new();

    let mut results = Vec::new();

    for image_path in image_paths {
        let image_id = uuid::Uuid::new_v4().to_string();

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
                results.push(UploadResult {
                    image_id: image_id.clone(),
                    success: true,
                    uploaded_url: Some(url.clone()),
                    error: None,
                });

                // Store in history with checksum
                if let Ok(history_service) = HistoryService::new() {
                    let mut metadata = std::collections::HashMap::new();
                    metadata.insert("checksum".to_string(), checksum);
                    metadata.insert("uploaded_url".to_string(), url);
                    metadata.insert("image_id".to_string(), image_id.clone());

                    let history_record = crate::services::history_service::HistoryRecord {
                        id: uuid::Uuid::new_v4().to_string(),
                        timestamp: chrono::Utc::now(),
                        operation: crate::services::history_service::OperationType::Upload,
                        files: vec![image_path.clone()],
                        image_count: 1,
                        success: true,
                        backup_path: None,
                        duration: None,
                        total_size: Some(
                            std::fs::metadata(&image_path).map(|m| m.len()).unwrap_or(0),
                        ),
                        error_message: None,
                        metadata,
                    };

                    let _ = history_service.add_history_record(history_record).await;
                }

                // Remove progress tracking for completed upload
                let _ = PROGRESS_NOTIFIER.remove_progress(&image_id);
            }
            Err(e) => {
                results.push(UploadResult {
                    image_id: image_id.clone(),
                    success: false,
                    uploaded_url: None,
                    error: Some(e.to_string()),
                });

                // Store failed upload in history
                if let Ok(history_service) = HistoryService::new() {
                    let mut metadata = std::collections::HashMap::new();
                    metadata.insert("image_id".to_string(), image_id.clone());

                    let history_record = crate::services::history_service::HistoryRecord {
                        id: uuid::Uuid::new_v4().to_string(),
                        timestamp: chrono::Utc::now(),
                        operation: crate::services::history_service::OperationType::Upload,
                        files: vec![image_path.clone()],
                        image_count: 1,
                        success: false,
                        backup_path: None,
                        duration: None,
                        total_size: Some(
                            std::fs::metadata(&image_path).map(|m| m.len()).unwrap_or(0),
                        ),
                        error_message: Some(e.to_string()),
                        metadata,
                    };

                    let _ = history_service.add_history_record(history_record).await;
                }

                // Remove progress tracking for failed upload
                let _ = PROGRESS_NOTIFIER.remove_progress(&image_id);
            }
        }
    }

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

    // Calculate checksum first
    let checksum = image_service.calculate_checksum(image_path).await?;

    // Read image file
    let image_data = fs::read(image_path)
        .map_err(|e| AppError::FileSystem(format!("Failed to read image file: {}", e)))?;

    // Generate object key based on file name and timestamp
    let file_name = Path::new(image_path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::FileSystem("Invalid file name".to_string()))?;

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let key = format!("images/{}_{}", timestamp, file_name);

    // Upload to OSS
    let url = oss_service
        .upload_image(&key, &image_data, progress_callback)
        .await?;

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
                        // Store in history with checksum
                        if let Ok(history_service) = HistoryService::new() {
                            let mut metadata = std::collections::HashMap::new();
                            metadata.insert("checksum".to_string(), checksum);
                            metadata.insert("uploaded_url".to_string(), url.clone());
                            metadata.insert("image_id".to_string(), image_id_clone.clone());

                            let history_record = crate::services::history_service::HistoryRecord {
                                id: uuid::Uuid::new_v4().to_string(),
                                timestamp: chrono::Utc::now(),
                                operation: crate::services::history_service::OperationType::Upload,
                                files: vec![image_path_clone.clone()],
                                image_count: 1,
                                success: true,
                                backup_path: None,
                                duration: None,
                                total_size: Some(
                                    std::fs::metadata(&image_path_clone)
                                        .map(|m| m.len())
                                        .unwrap_or(0),
                                ),
                                error_message: None,
                                metadata,
                            };

                            let _ = history_service.add_history_record(history_record).await;
                        }

                        UploadResult {
                            image_id: image_id_clone.clone(),
                            success: true,
                            uploaded_url: Some(url),
                            error: None,
                        }
                    }
                    Err(e) => {
                        // Store failed upload in history
                        if let Ok(history_service) = HistoryService::new() {
                            let mut metadata = std::collections::HashMap::new();
                            metadata.insert("image_id".to_string(), image_id_clone.clone());

                            let history_record = crate::services::history_service::HistoryRecord {
                                id: uuid::Uuid::new_v4().to_string(),
                                timestamp: chrono::Utc::now(),
                                operation: crate::services::history_service::OperationType::Upload,
                                files: vec![image_path_clone.clone()],
                                image_count: 1,
                                success: false,
                                backup_path: None,
                                duration: None,
                                total_size: Some(
                                    std::fs::metadata(&image_path_clone)
                                        .map(|m| m.len())
                                        .unwrap_or(0),
                                ),
                                error_message: Some(e.to_string()),
                                metadata,
                            };

                            let _ = history_service.add_history_record(history_record).await;
                        }

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

// ============================================================================
// OSS Configuration Commands
// ============================================================================

#[tauri::command]
pub async fn save_oss_config(config: OSSConfig, options: Option<SaveOptions>) -> Result<(), String> {
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
    println!("   Access Key ID: {}***", &config.access_key_id[..config.access_key_id.len().min(8)]);
    
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
        },
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
        },
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
// File Operations Commands
// ============================================================================

#[tauri::command]
pub async fn replace_markdown_links(replacements: Vec<LinkReplacement>) -> Result<(), String> {
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
    let _result = file_service
        .replace_image_links_batch(replacements)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn create_backup(file_path: String) -> Result<BackupInfo, String> {
    // Validate input parameters
    if file_path.is_empty() {
        return Err("File path cannot be empty".to_string());
    }

    // Security check: prevent path traversal
    if file_path.contains("..") || file_path.contains("~") {
        return Err("Invalid file path detected".to_string());
    }

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    if !path.is_file() {
        return Err(format!("Path is not a file: {}", file_path));
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    let service_backup = history_service
        .create_backup(&file_path)
        .await
        .map_err(|e| e.to_string())?;

    // Convert service backup to model backup
    Ok(BackupInfo {
        id: service_backup.id,
        original_path: service_backup.original_path,
        backup_path: service_backup.backup_path,
        timestamp: service_backup.timestamp,
        size: service_backup.size,
        checksum: service_backup.checksum,
    })
}

#[tauri::command]
pub async fn restore_from_backup(backup_id: String) -> Result<(), String> {
    // Validate input parameters
    if backup_id.is_empty() {
        return Err("Backup ID cannot be empty".to_string());
    }

    // Basic UUID format validation
    if backup_id.len() != 36 || backup_id.chars().filter(|&c| c == '-').count() != 4 {
        return Err("Invalid backup ID format".to_string());
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .restore_from_backup(&backup_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn list_backups(file_path: Option<String>) -> Result<Vec<BackupInfo>, String> {
    // Validate input parameters if provided
    if let Some(ref path) = file_path {
        if path.is_empty() {
            return Err("File path cannot be empty".to_string());
        }

        // Security check: prevent path traversal
        if path.contains("..") || path.contains("~") {
            return Err("Invalid file path detected".to_string());
        }
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    let service_backups = history_service
        .get_backups()
        .await
        .map_err(|e| e.to_string())?;

    // Convert service backups to model backups
    let mut backups: Vec<BackupInfo> = service_backups
        .into_iter()
        .map(|b| BackupInfo {
            id: b.id,
            original_path: b.original_path,
            backup_path: b.backup_path,
            timestamp: b.timestamp,
            size: b.size,
            checksum: b.checksum,
        })
        .collect();

    // Filter by file path if provided
    if let Some(path) = file_path {
        backups.retain(|b| b.original_path == path);
    }

    Ok(backups)
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

#[tauri::command]
pub async fn rollback_file_changes(
    backup_infos: Vec<BackupInfo>,
) -> Result<RollbackResult, String> {
    // Validate input parameters
    if backup_infos.is_empty() {
        return Err("Backup infos cannot be empty".to_string());
    }

    if backup_infos.len() > 50 {
        return Err("Too many backups to rollback (max 50)".to_string());
    }

    // Validate each backup info
    for backup_info in &backup_infos {
        if backup_info.backup_path.is_empty() {
            return Err("Backup path cannot be empty".to_string());
        }

        if backup_info.original_path.is_empty() {
            return Err("Original path cannot be empty".to_string());
        }

        // Security check: prevent path traversal
        if backup_info.backup_path.contains("..") || backup_info.backup_path.contains("~") {
            return Err("Invalid backup path detected".to_string());
        }

        if backup_info.original_path.contains("..") || backup_info.original_path.contains("~") {
            return Err("Invalid original path detected".to_string());
        }

        let backup_path = Path::new(&backup_info.backup_path);
        if !backup_path.exists() {
            return Err(format!(
                "Backup file not found: {}",
                backup_info.backup_path
            ));
        }
    }

    let file_service = FileService::new().map_err(|e| e.to_string())?;
    file_service
        .rollback_replacements(backup_infos)
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
) -> Result<PaginatedResult<HistoryRecord>, String> {
    // Validate pagination parameters
    let (validated_page, validated_page_size) =
        validate_pagination(page, page_size).map_err(|e| e.to_string())?;

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;

    let offset = (validated_page - 1) * validated_page_size;
    let query = HistoryQuery {
        operation_type: None,
        start_date: None,
        end_date: None,
        success_only: None,
        limit: Some(validated_page_size),
        offset: Some(offset),
    };

    let service_records = history_service
        .get_history_records(Some(query))
        .await
        .map_err(|e| e.to_string())?;
    let all_records = history_service
        .get_history_records(None)
        .await
        .map_err(|e| e.to_string())?;
    let total = all_records.len();

    // Convert service records to model records
    let records: Vec<HistoryRecord> = service_records
        .into_iter()
        .map(|r| HistoryRecord {
            id: r.id,
            timestamp: r.timestamp,
            operation: match r.operation {
                OperationType::Upload => "upload".to_string(),
                OperationType::Replace => "replace".to_string(),
                OperationType::Restore => "restore".to_string(),
                OperationType::Backup => "backup".to_string(),
                OperationType::Scan => "scan".to_string(),
            },
            files: r.files,
            image_count: r.image_count,
            success: r.success,
            backup_path: r.backup_path,
            duration: r.duration,
            total_size: r.total_size,
            error_message: r.error_message,
            metadata: r.metadata,
        })
        .collect();

    Ok(PaginatedResult {
        items: records,
        total,
        page: validated_page,
        page_size: validated_page_size,
        has_more: offset + validated_page_size < total,
    })
}

#[tauri::command]
pub async fn search_history(
    search_term: Option<String>,
    operation_type: Option<String>,
    success_only: Option<bool>,
    start_date: Option<String>,
    end_date: Option<String>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<PaginatedResult<HistoryRecord>, String> {
    // Validate pagination parameters
    let (validated_page, validated_page_size) =
        validate_pagination(page, page_size).map_err(|e| e.to_string())?;

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;

    // Parse operation type
    let parsed_operation_type = if let Some(op) = operation_type {
        match op.as_str() {
            "upload" => Some(OperationType::Upload),
            "replace" => Some(OperationType::Replace),
            "restore" => Some(OperationType::Restore),
            "backup" => Some(OperationType::Backup),
            "scan" => Some(OperationType::Scan),
            _ => return Err("Invalid operation type".to_string()),
        }
    } else {
        None
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
        operation_type: parsed_operation_type.clone(),
        start_date: parsed_start_date,
        end_date: parsed_end_date,
        success_only,
        limit: Some(validated_page_size),
        offset: Some(offset),
    };

    let mut service_records = history_service
        .get_history_records(Some(query))
        .await
        .map_err(|e| e.to_string())?;

    // Apply text search filter if provided
    if let Some(ref term) = search_term {
        let term_lower = term.to_lowercase();
        service_records.retain(|record| {
            // Search in files, operation, and error message
            record
                .files
                .iter()
                .any(|file| file.to_lowercase().contains(&term_lower))
                || format!("{:?}", record.operation)
                    .to_lowercase()
                    .contains(&term_lower)
                || record
                    .error_message
                    .as_ref()
                    .map_or(false, |msg| msg.to_lowercase().contains(&term_lower))
        });
    }

    // Get total count for pagination (need to apply same filters)
    let mut all_records = history_service
        .get_history_records(None)
        .await
        .map_err(|e| e.to_string())?;

    // Apply same filters to get accurate total count
    if let Some(ref op_type) = parsed_operation_type {
        all_records
            .retain(|r| std::mem::discriminant(&r.operation) == std::mem::discriminant(&op_type));
    }
    if let Some(start) = parsed_start_date {
        all_records.retain(|r| r.timestamp >= start);
    }
    if let Some(end) = parsed_end_date {
        all_records.retain(|r| r.timestamp <= end);
    }
    if let Some(success_filter) = success_only {
        if success_filter {
            all_records.retain(|r| r.success);
        }
    }
    if let Some(ref term) = search_term {
        let term_lower = term.to_lowercase();
        all_records.retain(|record| {
            record
                .files
                .iter()
                .any(|file| file.to_lowercase().contains(&term_lower))
                || format!("{:?}", record.operation)
                    .to_lowercase()
                    .contains(&term_lower)
                || record
                    .error_message
                    .as_ref()
                    .map_or(false, |msg| msg.to_lowercase().contains(&term_lower))
        });
    }

    let total = all_records.len();

    // Convert service records to model records
    let records: Vec<HistoryRecord> = service_records
        .into_iter()
        .map(|r| HistoryRecord {
            id: r.id,
            timestamp: r.timestamp,
            operation: match r.operation {
                OperationType::Upload => "upload".to_string(),
                OperationType::Replace => "replace".to_string(),
                OperationType::Restore => "restore".to_string(),
                OperationType::Backup => "backup".to_string(),
                OperationType::Scan => "scan".to_string(),
            },
            files: r.files,
            image_count: r.image_count,
            success: r.success,
            backup_path: r.backup_path,
            duration: r.duration,
            total_size: r.total_size,
            error_message: r.error_message,
            metadata: r.metadata,
        })
        .collect();

    Ok(PaginatedResult {
        items: records,
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
        .clear_history(None)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn export_history() -> Result<String, String> {
    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    let records = history_service
        .get_history_records(None)
        .await
        .map_err(|e| e.to_string())?;
    let backups = history_service
        .get_backups()
        .await
        .map_err(|e| e.to_string())?;
    let operations = history_service
        .get_file_operations(None)
        .await
        .map_err(|e| e.to_string())?;

    let export_data = serde_json::json!({
        "records": records,
        "backups": backups,
        "operations": operations,
        "export_date": chrono::Utc::now().to_rfc3339(),
        "version": "1.0"
    });

    serde_json::to_string_pretty(&export_data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_history_record(
    operation: String,
    files: Vec<String>,
    image_count: u32,
    success: bool,
    backup_path: Option<String>,
    duration: Option<u64>,
    total_size: Option<u64>,
    error_message: Option<String>,
) -> Result<String, String> {
    // Validate input parameters
    if operation.is_empty() {
        return Err("Operation cannot be empty".to_string());
    }

    if files.is_empty() {
        return Err("Files cannot be empty".to_string());
    }

    let operation_type = match operation.as_str() {
        "upload" => OperationType::Upload,
        "replace" => OperationType::Replace,
        "restore" => OperationType::Restore,
        "backup" => OperationType::Backup,
        "scan" => OperationType::Scan,
        _ => return Err("Invalid operation type".to_string()),
    };

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    let record = crate::services::history_service::HistoryRecord {
        id: String::new(), // Will be generated by the service
        timestamp: chrono::Utc::now(),
        operation: operation_type,
        files,
        image_count,
        success,
        backup_path,
        duration,
        total_size,
        error_message,
        metadata: std::collections::HashMap::new(),
    };

    history_service
        .add_history_record(record)
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

#[tauri::command]
pub async fn delete_backup(backup_id: String) -> Result<bool, String> {
    // Validate input parameters
    if backup_id.is_empty() {
        return Err("Backup ID cannot be empty".to_string());
    }

    // Basic UUID format validation
    if backup_id.len() != 36 || backup_id.chars().filter(|&c| c == '-').count() != 4 {
        return Err("Invalid backup ID format".to_string());
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .delete_backup(&backup_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cleanup_old_backups(older_than_days: u32) -> Result<usize, String> {
    if older_than_days == 0 {
        return Err("Days must be greater than 0".to_string());
    }

    if older_than_days > 3650 {
        // 10 years max
        return Err("Days cannot exceed 3650".to_string());
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .cleanup_old_backups(older_than_days)
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
        .clear_history(Some(older_than_days))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_file_operations(limit: Option<usize>) -> Result<Vec<FileOperation>, String> {
    let validated_limit = if let Some(l) = limit {
        if l > 1000 {
            return Err("Limit cannot exceed 1000".to_string());
        }
        Some(l)
    } else {
        None
    };

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service
        .get_file_operations(validated_limit)
        .await
        .map_err(|e| e.to_string())
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
    pub existing_record: Option<HistoryRecord>,
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
            // Convert service record to model record
            let model_record = HistoryRecord {
                id: service_record.id,
                timestamp: service_record.timestamp,
                operation: match service_record.operation {
                    crate::services::history_service::OperationType::Upload => "upload".to_string(),
                    crate::services::history_service::OperationType::Replace => {
                        "replace".to_string()
                    }
                    crate::services::history_service::OperationType::Restore => {
                        "restore".to_string()
                    }
                    crate::services::history_service::OperationType::Backup => "backup".to_string(),
                    crate::services::history_service::OperationType::Scan => "scan".to_string(),
                },
                files: service_record.files,
                image_count: service_record.image_count,
                success: service_record.success,
                backup_path: service_record.backup_path,
                duration: service_record.duration,
                total_size: service_record.total_size,
                error_message: service_record.error_message,
                metadata: service_record.metadata,
            };

            // Extract URL from metadata if available
            let existing_url = model_record.metadata.get("uploaded_url").cloned();

            Ok(DuplicateCheckResult {
                checksum,
                is_duplicate: true,
                existing_record: Some(model_record),
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
                // Convert service record to model record
                let model_record = HistoryRecord {
                    id: service_record.id,
                    timestamp: service_record.timestamp,
                    operation: match service_record.operation {
                        crate::services::history_service::OperationType::Upload => {
                            "upload".to_string()
                        }
                        crate::services::history_service::OperationType::Replace => {
                            "replace".to_string()
                        }
                        crate::services::history_service::OperationType::Restore => {
                            "restore".to_string()
                        }
                        crate::services::history_service::OperationType::Backup => {
                            "backup".to_string()
                        }
                        crate::services::history_service::OperationType::Scan => "scan".to_string(),
                    },
                    files: service_record.files,
                    image_count: service_record.image_count,
                    success: service_record.success,
                    backup_path: service_record.backup_path,
                    duration: service_record.duration,
                    total_size: service_record.total_size,
                    error_message: service_record.error_message,
                    metadata: service_record.metadata,
                };

                // Extract URL from metadata if available
                let existing_url = model_record.metadata.get("uploaded_url").cloned();

                results.push(DuplicateCheckResult {
                    checksum,
                    is_duplicate: true,
                    existing_record: Some(model_record),
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
            let existing_url = record
                .metadata
                .get("uploaded_url")
                .ok_or_else(|| "No URL found in record metadata".to_string())?;

            let file_size = record.total_size.unwrap_or(0);
            let original_path = record
                .files
                .first()
                .unwrap_or(&"Unknown".to_string())
                .clone();

            Ok(Some(DuplicateInfo {
                checksum,
                original_path,
                existing_url: existing_url.clone(),
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

// ============================================================================
// Debug Commands
// ============================================================================

#[tauri::command]
pub async fn debug_tencent_cos_connection(config: OSSConfig) -> Result<String, String> {
    println!("🚀 启动腾讯云 COS 连接调试...");
    
    match debug_tencent_cos::debug_tencent_cos_connection(&config).await {
        Ok(_) => {
            let success_msg = "✅ 腾讯云 COS 连接调试完成，所有测试通过";
            println!("{}", success_msg);
            Ok(success_msg.to_string())
        }
        Err(e) => {
            let error_msg = format!("❌ 腾讯云 COS 连接调试失败: {}", e);
            println!("{}", error_msg);
            Err(error_msg)
        }
    }
}