use crate::models::{
    BackupInfo, ConfigValidation, HistoryRecord, ImageInfo, LinkReplacement, OSSConfig,
    OSSConnectionTest, ObjectInfo, PaginatedResult, ScanResult, UploadProgress, UploadResult,
    ValidationResult, ReplacementResult, BatchReplacementResult, RollbackResult,
};
use crate::services::history_service::{HistoryQuery, OperationType, HistoryStatistics, FileOperation};
use crate::services::{ConfigService, FileService, ImageService, OSSService, HistoryService};
use crate::utils::error::AppError;
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
    image_ids: Vec<String>,
    config: OSSConfig,
) -> Result<Vec<UploadResult>, String> {
    // Rate limiting
    UPLOAD_RATE_LIMITER
        .check_rate_limit("upload_images")
        .map_err(|e| e.to_string())?;

    // Validate input parameters
    validate_image_ids(&image_ids).map_err(|e| e.to_string())?;
    validate_oss_config_params(&config).map_err(|e| e.to_string())?;

    let _oss_service = OSSService::new(config).map_err(|e| e.to_string())?;
    // TODO: Implement actual upload logic in later tasks
    Ok(vec![])
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

    // TODO: Implement in upload task
    Ok(None)
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

    // TODO: Implement in upload task
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

    // TODO: Implement in upload task
    Ok(())
}

// ============================================================================
// OSS Configuration Commands
// ============================================================================

#[tauri::command]
pub async fn save_oss_config(config: OSSConfig) -> Result<(), String> {
    // Rate limiting
    CONFIG_RATE_LIMITER
        .check_rate_limit("save_config")
        .map_err(|e| e.to_string())?;

    // Validate input parameters
    validate_oss_config_params(&config).map_err(|e| e.to_string())?;

    let config_service = ConfigService::new().map_err(|e| e.to_string())?;
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
    // Validate input parameters
    validate_oss_config_params(&config).map_err(|e| e.to_string())?;

    let oss_service = OSSService::new(config).map_err(|e| e.to_string())?;
    oss_service
        .test_connection()
        .await
        .map_err(|e| e.to_string())
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

    let oss_service = OSSService::new(config).map_err(|e| e.to_string())?;
    oss_service
        .list_objects(&prefix)
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
    let service_backups = history_service.get_backups().await.map_err(|e| e.to_string())?;
    
    // Convert service backups to model backups
    let mut backups: Vec<BackupInfo> = service_backups.into_iter().map(|b| BackupInfo {
        id: b.id,
        original_path: b.original_path,
        backup_path: b.backup_path,
        timestamp: b.timestamp,
        size: b.size,
        checksum: b.checksum,
    }).collect();
    
    // Filter by file path if provided
    if let Some(path) = file_path {
        backups.retain(|b| b.original_path == path);
    }
    
    Ok(backups)
}

#[tauri::command]
pub async fn replace_markdown_links_with_result(replacements: Vec<LinkReplacement>) -> Result<BatchReplacementResult, String> {
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
pub async fn replace_single_file_links(file_path: String, replacements: Vec<LinkReplacement>) -> Result<ReplacementResult, String> {
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
pub async fn rollback_file_changes(backup_infos: Vec<BackupInfo>) -> Result<RollbackResult, String> {
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
            return Err(format!("Backup file not found: {}", backup_info.backup_path));
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
    
    let service_records = history_service.get_history_records(Some(query)).await.map_err(|e| e.to_string())?;
    let all_records = history_service.get_history_records(None).await.map_err(|e| e.to_string())?;
    let total = all_records.len();
    
    // Convert service records to model records
    let records: Vec<HistoryRecord> = service_records.into_iter().map(|r| HistoryRecord {
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
    }).collect();
    
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
    history_service.clear_history(None).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn export_history() -> Result<String, String> {
    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    let records = history_service.get_history_records(None).await.map_err(|e| e.to_string())?;
    let backups = history_service.get_backups().await.map_err(|e| e.to_string())?;
    let operations = history_service.get_file_operations(None).await.map_err(|e| e.to_string())?;
    
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
    
    history_service.add_history_record(record).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_history_statistics() -> Result<HistoryStatistics, String> {
    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service.get_statistics().await.map_err(|e| e.to_string())
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
    history_service.delete_backup(&backup_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cleanup_old_backups(older_than_days: u32) -> Result<usize, String> {
    if older_than_days == 0 {
        return Err("Days must be greater than 0".to_string());
    }
    
    if older_than_days > 3650 { // 10 years max
        return Err("Days cannot exceed 3650".to_string());
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service.cleanup_old_backups(older_than_days).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cleanup_old_history(older_than_days: u32) -> Result<usize, String> {
    if older_than_days == 0 {
        return Err("Days must be greater than 0".to_string());
    }
    
    if older_than_days > 3650 { // 10 years max
        return Err("Days cannot exceed 3650".to_string());
    }

    let history_service = HistoryService::new().map_err(|e| e.to_string())?;
    history_service.clear_history(Some(older_than_days)).await.map_err(|e| e.to_string())
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
    history_service.get_file_operations(validated_limit).await.map_err(|e| e.to_string())
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
// Progress Monitoring Commands
// ============================================================================

#[tauri::command]
pub async fn get_all_upload_progress() -> Result<Vec<UploadProgress>, String> {
    PROGRESS_NOTIFIER.get_all_progress()
}

#[tauri::command]
pub async fn clear_upload_progress() -> Result<(), String> {
    PROGRESS_NOTIFIER.clear_all()
}

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
