use serde::{Deserialize, Serialize};
use std::time::SystemTime;

#[cfg(test)]
mod tests;

// ============================================================================
// File and Scan Related Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub file_path: String,
    pub images: Vec<ImageReference>,
    pub status: ScanStatus,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScanStatus {
    Success,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageReference {
    pub id: String,
    pub original_path: String,
    pub absolute_path: String,
    pub exists: bool,
    pub size: u64,
    pub last_modified: SystemTime,
    pub markdown_line: usize,
    pub markdown_column: usize,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size: u64,
    pub color_space: Option<String>,
}

// ============================================================================
// Upload Related Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadTask {
    pub id: String,
    pub image_id: String,
    pub status: UploadStatus,
    pub progress: f32,
    pub uploaded_url: Option<String>,
    pub error: Option<String>,
    pub start_time: Option<SystemTime>,
    pub end_time: Option<SystemTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UploadStatus {
    Pending,
    Uploading,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadResult {
    pub image_id: String,
    pub success: bool,
    pub uploaded_url: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadProgress {
    pub image_id: String,
    pub progress: f32,
    pub bytes_uploaded: u64,
    pub total_bytes: u64,
    pub speed: Option<u64>, // bytes per second
}

// ============================================================================
// OSS Configuration Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OSSConfig {
    pub provider: OSSProvider,
    pub endpoint: String,
    pub access_key_id: String,
    pub access_key_secret: String,
    pub bucket: String,
    pub region: String,
    pub path_template: String,
    pub cdn_domain: Option<String>,
    pub compression_enabled: bool,
    pub compression_quality: u8,
}

// New: Configuration item for multi-config support
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigItem {
    pub id: String,
    pub name: String,
    pub config: OSSConfig,
    pub is_active: bool,
    pub created_at: String,  // ISO 8601 string instead of SystemTime
    pub updated_at: String,  // ISO 8601 string instead of SystemTime
}

// New: Collection of configurations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigCollection {
    pub configs: Vec<ConfigItem>,
    pub active_config_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OSSProvider {
    Aliyun,
    Tencent,
    AWS,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OSSConnectionTest {
    pub success: bool,
    pub error: Option<String>,
    pub latency: Option<u64>, // milliseconds
    pub bucket_exists: Option<bool>, // Whether the specified bucket exists
    pub available_buckets: Option<Vec<String>>, // List of available buckets (if accessible)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectInfo {
    pub key: String,
    pub size: u64,
    pub last_modified: SystemTime,
    pub etag: String,
    pub url: String,
}

// ============================================================================
// File Operations Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkReplacement {
    pub file_path: String,
    pub line: usize,
    pub column: usize,
    pub old_link: String,
    pub new_link: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub id: String,
    pub original_path: String,
    pub backup_path: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub size: u64,
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOperation {
    pub operation_type: FileOperationType,
    pub file_path: String,
    pub timestamp: SystemTime,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FileOperationType {
    Backup,
    Replace,
    Restore,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplacementResult {
    pub file_path: String,
    pub backup_info: BackupInfo,
    pub total_replacements: usize,
    pub successful_replacements: usize,
    pub failed_replacements: Vec<ReplacementError>,
    pub duration: SystemTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplacementError {
    pub replacement: LinkReplacement,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchReplacementResult {
    pub results: Vec<ReplacementResult>,
    pub total_files: usize,
    pub total_successful_replacements: usize,
    pub total_failed_replacements: usize,
    pub duration: std::time::Duration,
    pub timestamp: SystemTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackResult {
    pub total_files: usize,
    pub successful_rollbacks: usize,
    pub failed_rollbacks: Vec<RollbackError>,
    pub duration: std::time::Duration,
    pub timestamp: SystemTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollbackError {
    pub backup_info: BackupInfo,
    pub error: String,
}

// ============================================================================
// History and State Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryRecord {
    pub id: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub operation: String,
    pub files: Vec<String>,
    pub image_count: u32,
    pub success: bool,
    pub backup_path: Option<String>,
    pub duration: Option<u64>, // milliseconds
    pub total_size: Option<u64>, // bytes
    pub error_message: Option<String>,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageHistoryRecord {
    pub id: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub image_name: String,
    pub original_path: String,
    pub uploaded_url: Option<String>,
    pub upload_mode: UploadMode,
    pub source_file: Option<String>, // 对于文章上传模式，记录来源Markdown文件
    pub success: bool,
    pub file_size: u64,
    pub error_message: Option<String>,
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UploadMode {
    ImageUpload,
    ArticleUpload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub current_files: Vec<String>,
    pub scanned_images: Vec<ImageReference>,
    pub selected_images: Vec<String>,
    pub upload_tasks: Vec<UploadTask>,
    pub oss_config: Option<OSSConfig>,
    pub is_scanning: bool,
    pub is_uploading: bool,
}



// ============================================================================
// Utility Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResult<T> {
    pub items: Vec<T>,
    pub total: usize,
    pub page: usize,
    pub page_size: usize,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigValidation {
    pub valid: bool,
    pub errors: Vec<String>,
    pub connection_test: Option<OSSConnectionTest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveOptions {
    pub force_revalidate: bool,
}

// ============================================================================
// Implementation Helpers
// ============================================================================

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_files: Vec::new(),
            scanned_images: Vec::new(),
            selected_images: Vec::new(),
            upload_tasks: Vec::new(),
            oss_config: None,
            is_scanning: false,
            is_uploading: false,
        }
    }
}

impl UploadTask {
    #[allow(dead_code)]
    pub fn new(image_id: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            image_id,
            status: UploadStatus::Pending,
            progress: 0.0,
            uploaded_url: None,
            error: None,
            start_time: None,
            end_time: None,
        }
    }
}

impl ImageReference {
    pub fn new(
        original_path: String,
        absolute_path: String,
        markdown_line: usize,
        markdown_column: usize,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            original_path,
            absolute_path,
            exists: false, // Will be set during validation
            size: 0,       // Will be set during validation
            last_modified: SystemTime::now(),
            markdown_line,
            markdown_column,
            thumbnail: None, // Will be set during validation for existing images
        }
    }
}

// ============================================================================
// System Health and Monitoring Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemHealth {
    pub status: HealthStatus,
    pub uptime: u64, // seconds
    pub memory_usage: u64, // bytes
    pub disk_space: u64, // bytes available
    pub active_uploads: u32,
    pub last_check: chrono::DateTime<chrono::Utc>,
    pub errors: Vec<HealthError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HealthStatus {
    Healthy,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthError {
    pub component: String,
    pub message: String,
    pub severity: ErrorSeverity,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationConfig {
    pub enabled: bool,
    pub show_progress: bool,
    pub show_completion: bool,
    pub show_errors: bool,
    pub auto_dismiss_success: bool,
    pub dismiss_timeout: u64, // milliseconds
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressNotification {
    pub id: String,
    pub notification_type: NotificationType,
    pub title: String,
    pub message: String,
    pub progress: Option<f32>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub dismissible: bool,
    pub auto_dismiss: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationType {
    Info,
    Success,
    Warning,
    Error,
    Progress,
}

// ============================================================================
// Upload Task Management Models
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadTaskManager {
    pub active_tasks: std::collections::HashMap<String, UploadTaskInfo>,
    pub completed_tasks: Vec<UploadTaskInfo>,
    pub failed_tasks: Vec<UploadTaskInfo>,
    pub cancelled_tasks: Vec<UploadTaskInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadTaskInfo {
    pub id: String,
    pub image_path: String,
    pub status: UploadTaskStatus,
    pub progress: UploadProgress,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub end_time: Option<chrono::DateTime<chrono::Utc>>,
    pub retry_count: u32,
    pub max_retries: u32,
    pub error: Option<String>,
    pub cancellation_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UploadTaskStatus {
    Queued,
    Starting,
    Uploading,
    Completed,
    Failed,
    Cancelled,
    Retrying,
}

impl Default for SystemHealth {
    fn default() -> Self {
        Self {
            status: HealthStatus::Healthy,
            uptime: 0,
            memory_usage: 0,
            disk_space: 0,
            active_uploads: 0,
            last_check: chrono::Utc::now(),
            errors: Vec::new(),
        }
    }
}

impl Default for NotificationConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            show_progress: true,
            show_completion: true,
            show_errors: true,
            auto_dismiss_success: true,
            dismiss_timeout: 5000, // 5 seconds
        }
    }
}

impl UploadTaskInfo {
    #[allow(dead_code)]
    pub fn new(image_path: String, max_retries: u32) -> Self {
        let id = uuid::Uuid::new_v4().to_string();
        Self {
            id: id.clone(),
            image_path,
            status: UploadTaskStatus::Queued,
            progress: UploadProgress {
                image_id: id,
                progress: 0.0,
                bytes_uploaded: 0,
                total_bytes: 0,
                speed: None,
            },
            start_time: chrono::Utc::now(),
            end_time: None,
            retry_count: 0,
            max_retries,
            error: None,
            cancellation_token: None,
        }
    }
}