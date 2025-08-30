// TypeScript type definitions matching Rust structs
// This file provides type safety for Tauri API communication

// ============================================================================
// File and Scan Related Types
// ============================================================================

export interface ScanResult {
  file_path: string;
  images: ImageReference[];
  status: ScanStatus;
  error?: string;
}

export enum ScanStatus {
  Success = "Success",
  Error = "Error",
}

export interface ImageReference {
  id: string;
  original_path: string;
  absolute_path: string;
  exists: boolean;
  size: number;
  last_modified: string; // SystemTime serialized as ISO string
  markdown_line: number;
  markdown_column: number;
  thumbnail?: string;
}

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  size: number;
  color_space?: string;
}

// ============================================================================
// Upload Related Types
// ============================================================================

export interface UploadTask {
  id: string;
  image_id: string;
  status: UploadStatus;
  progress: number;
  uploaded_url?: string;
  error?: string;
  start_time?: string; // SystemTime serialized as ISO string
  end_time?: string; // SystemTime serialized as ISO string
}

export enum UploadStatus {
  Pending = "Pending",
  Uploading = "Uploading",
  Completed = "Completed",
  Failed = "Failed",
}

export interface UploadResult {
  image_id: string;
  success: boolean;
  uploaded_url?: string;
  error?: string;
}

export interface UploadProgress {
  image_id: string;
  progress: number;
  bytes_uploaded: number;
  total_bytes: number;
  speed?: number; // bytes per second
}

// ============================================================================
// OSS Configuration Types
// ============================================================================

export interface OSSConfig {
  provider: OSSProvider;
  endpoint: string;
  access_key_id: string;
  access_key_secret: string;
  bucket: string;
  region: string;
  path_template: string;
  cdn_domain?: string;
  compression_enabled: boolean;
  compression_quality: number;
}

export enum OSSProvider {
  Aliyun = "Aliyun",
  Tencent = "Tencent",
  AWS = "AWS",
  Custom = "Custom",
}

export interface OSSConnectionTest {
  success: boolean;
  error?: string;
  latency?: number; // milliseconds
  bucket_exists?: boolean; // Whether the specified bucket exists
  available_buckets?: string[]; // List of available buckets (if accessible)
}

export interface ObjectInfo {
  key: string;
  size: number;
  last_modified: string; // SystemTime serialized as ISO string
  etag: string;
  url: string;
}

// ============================================================================
// File Operations Types
// ============================================================================

export interface LinkReplacement {
  file_path: string;
  line: number;
  column: number;
  old_link: string;
  new_link: string;
}

export interface BackupInfo {
  id: string;
  original_path: string;
  backup_path: string;
  timestamp: string; // DateTime serialized as ISO string
  size: number;
  checksum?: string;
}

export interface FileOperation {
  operation_type: FileOperationType;
  file_path: string;
  timestamp: string; // SystemTime serialized as ISO string
  success: boolean;
  error?: string;
}

export enum FileOperationType {
  Backup = "Backup",
  Replace = "Replace",
  Restore = "Restore",
}

export interface ReplacementResult {
  file_path: string;
  backup_info: BackupInfo;
  total_replacements: number;
  successful_replacements: number;
  failed_replacements: ReplacementError[];
  duration: string; // SystemTime serialized as ISO string
}

export interface ReplacementError {
  replacement: LinkReplacement;
  error: string;
}

export interface BatchReplacementResult {
  results: ReplacementResult[];
  total_files: number;
  total_successful_replacements: number;
  total_failed_replacements: number;
  duration: number; // Duration in milliseconds
  timestamp: string; // SystemTime serialized as ISO string
}

export interface RollbackResult {
  total_files: number;
  successful_rollbacks: number;
  failed_rollbacks: RollbackError[];
  duration: number; // Duration in milliseconds
  timestamp: string; // SystemTime serialized as ISO string
}

export interface RollbackError {
  backup_info: BackupInfo;
  error: string;
}

// ============================================================================
// History and State Types
// ============================================================================

export interface HistoryRecord {
  id: string;
  timestamp: string; // DateTime serialized as ISO string
  operation: string;
  files: string[];
  image_count: number;
  success: boolean;
  backup_path?: string;
  duration?: number; // milliseconds
  total_size?: number; // bytes
  error_message?: string;
  metadata: Record<string, string>;
}

export interface ImageHistoryRecord {
  id: string;
  timestamp: string; // DateTime serialized as ISO string
  image_name: string;
  original_path: string;
  uploaded_url?: string;
  upload_mode: UploadMode;
  source_file?: string; // 对于文章上传模式，记录来源Markdown文件
  success: boolean;
  file_size: number;
  error_message?: string;
  checksum?: string;
}

export enum UploadMode {
  ImageUpload = 'ImageUpload',
  ArticleUpload = 'ArticleUpload'
}

export interface AppState {
  current_files: string[];
  scanned_images: ImageReference[];
  selected_images: string[];
  upload_tasks: UploadTask[];
  oss_config?: OSSConfig;
  is_scanning: boolean;
  is_uploading: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ConfigValidation {
  valid: boolean;
  errors: string[];
  connection_test?: OSSConnectionTest;
}

export interface SaveOptions {
  force_revalidate: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

export enum ErrorType {
  VALIDATION = "validation",
  NETWORK = "network",
  FILE_SYSTEM = "file_system",
  SECURITY = "security",
  SERVICE = "service",
}

export interface AppError {
  type: ErrorType;
  message: string;
  details?: string;
  code?: string;
  recoverable: boolean;
}

// ============================================================================
// History Service Types (from Rust service layer)
// ============================================================================

export interface HistoryQuery {
  operation_type?: string;
  start_date?: string;
  end_date?: string;
  success_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface HistoryStatistics {
  total_records: number;
  successful_operations: number;
  failed_operations: number;
  success_rate: number;
  operations_by_type: Record<string, number>;
  total_images_processed: number;
  total_size_processed: number;
  average_duration: number;
  oldest_record?: string; // DateTime serialized as ISO string
  newest_record?: string; // DateTime serialized as ISO string
}

// ============================================================================
// Duplicate Detection Types
// ============================================================================

export interface DuplicateCheckResult {
  checksum: string;
  is_duplicate: boolean;
  existing_record?: HistoryRecord;
  existing_url?: string;
}

export interface DuplicateInfo {
  checksum: string;
  original_path: string;
  existing_url: string;
  upload_date: string;
  file_size: number;
}

// ============================================================================
// System Health and Monitoring Types
// ============================================================================

export interface SystemHealth {
  status: HealthStatus;
  uptime: number; // seconds
  memory_usage: number; // bytes
  disk_space: number; // bytes available
  active_uploads: number;
  last_check: string; // ISO timestamp
  errors: HealthError[];
}

export enum HealthStatus {
  Healthy = "Healthy",
  Warning = "Warning",
  Critical = "Critical",
}

export interface HealthError {
  component: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: string;
}

export enum ErrorSeverity {
  Low = "Low",
  Medium = "Medium",
  High = "High",
  Critical = "Critical",
}

export interface NotificationConfig {
  enabled: boolean;
  show_progress: boolean;
  show_completion: boolean;
  show_errors: boolean;
  auto_dismiss_success: boolean;
  dismiss_timeout: number; // milliseconds
}

export interface ProgressNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  progress?: number;
  timestamp: string;
  dismissible: boolean;
  auto_dismiss: boolean;
}

export enum NotificationType {
  Info = "Info",
  Success = "Success",
  Warning = "Warning",
  Error = "Error",
  Progress = "Progress",
}

// ============================================================================
// Upload Task Management Types
// ============================================================================

export interface UploadTaskManager {
  active_tasks: Map<string, UploadTaskInfo>;
  completed_tasks: UploadTaskInfo[];
  failed_tasks: UploadTaskInfo[];
  cancelled_tasks: UploadTaskInfo[];
}

export interface UploadTaskInfo {
  id: string;
  image_path: string;
  status: UploadTaskStatus;
  progress: UploadProgress;
  start_time: string;
  end_time?: string;
  retry_count: number;
  max_retries: number;
  error?: string;
  cancellation_token?: string;
}

export enum UploadTaskStatus {
  Queued = "Queued",
  Starting = "Starting",
  Uploading = "Uploading",
  Completed = "Completed",
  Failed = "Failed",
  Cancelled = "Cancelled",
  Retrying = "Retrying",
}