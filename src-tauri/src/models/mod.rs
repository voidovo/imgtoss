use serde::{Deserialize, Serialize};
use std::time::SystemTime;
use std::collections::HashMap;

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