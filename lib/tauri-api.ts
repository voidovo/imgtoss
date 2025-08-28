// Centralized Tauri API client with typed methods
// Provides type-safe communication with Tauri backend

import { invoke } from '@tauri-apps/api/core';
import type {
  ScanResult,
  ImageInfo,
  UploadResult,
  UploadProgress,
  OSSConfig,
  OSSConnectionTest,
  ConfigValidation,
  SaveOptions,
  ObjectInfo,
  LinkReplacement,
  BackupInfo,
  ReplacementResult,
  BatchReplacementResult,
  RollbackResult,
  HistoryRecord,
  PaginatedResult,
  HistoryStatistics,
  FileOperation,
  DuplicateCheckResult,
  DuplicateInfo,
  SystemHealth,
  NotificationConfig,
  ProgressNotification,
  UploadTaskInfo,
  UploadTaskManager,
} from './types';

/**
 * Centralized Tauri API client providing type-safe methods for all backend operations
 */
export class TauriAPI {
  // ============================================================================
  // File and Scan Operations
  // ============================================================================

  /**
   * Scan markdown files for image references
   */
  async scanMarkdownFiles(filePaths: string[]): Promise<ScanResult[]> {
    return invoke<ScanResult[]>('scan_markdown_files', { filePaths });
  }

  /**
   * Get detailed information about an image file
   */
  async getImageInfo(imagePath: string): Promise<ImageInfo> {
    return invoke<ImageInfo>('get_image_info', { imagePath });
  }

  /**
   * Generate a thumbnail for an image
   */
  async generateThumbnail(imagePath: string, size: number): Promise<number[]> {
    return invoke<number[]>('generate_thumbnail', { imagePath, size });
  }

  // ============================================================================
  // Upload Operations
  // ============================================================================

  /**
   * Upload multiple images to configured storage provider
   */
  async uploadImages(imagePaths: string[], config: OSSConfig): Promise<UploadResult[]> {
    return invoke<UploadResult[]>('upload_images', { imagePaths, config });
  }

  /**
   * Upload multiple images to OSS with custom IDs for progress tracking
   */
  async uploadImagesWithIds(imageData: [string, string][], config: OSSConfig): Promise<UploadResult[]> {
    return invoke<UploadResult[]>('upload_images_with_ids', { imageData, config });
  }

  /**
   * Upload multiple images in batches with concurrent processing
   */
  async uploadImagesBatch(imagePaths: string[], config: OSSConfig, batchSize?: number): Promise<UploadResult[]> {
    return invoke<UploadResult[]>('upload_images_batch', { imagePaths, config, batchSize });
  }

  /**
   * Get upload progress for a specific task
   */
  async getUploadProgress(taskId: string): Promise<UploadProgress | null> {
    return invoke<UploadProgress | null>('get_upload_progress', { taskId });
  }

  /**
   * Cancel an ongoing upload task
   */
  async cancelUpload(taskId: string): Promise<void> {
    return invoke<void>('cancel_upload', { taskId });
  }

  /**
   * Retry a failed upload task
   */
  async retryUpload(taskId: string): Promise<void> {
    return invoke<void>('retry_upload', { taskId });
  }

  /**
   * Get all current upload progress states
   */
  async getAllUploadProgress(): Promise<UploadProgress[]> {
    return invoke<UploadProgress[]>('get_all_upload_progress');
  }

  /**
   * Clear all upload progress tracking
   */
  async clearUploadProgress(): Promise<void> {
    return invoke<void>('clear_upload_progress');
  }

  /**
   * Generate a new UUID for use as file ID
   */
  async generateUuid(): Promise<string> {
    return invoke<string>('generate_uuid');
  }

  // ============================================================================
  // OSS Configuration Operations
  // ============================================================================

  /**
   * Save OSS configuration to local storage
   */
  async saveOSSConfig(config: OSSConfig, options?: SaveOptions): Promise<void> {
    return invoke<void>('save_oss_config', { config, options });
  }

  /**
   * Load OSS configuration from local storage
   */
  async loadOSSConfig(): Promise<OSSConfig | null> {
    return invoke<OSSConfig | null>('load_oss_config');
  }

  /**
   * Test connection to OSS provider
   */
  async testOSSConnection(config: OSSConfig): Promise<OSSConnectionTest> {
    return invoke<OSSConnectionTest>('test_oss_connection', { config });
  }

  /**
   * Validate OSS configuration parameters
   */
  async validateOSSConfig(config: OSSConfig): Promise<ConfigValidation> {
    return invoke<ConfigValidation>('validate_oss_config', { config });
  }

  /**
   * Get cached connection status for OSS configuration
   */
  async getCachedConnectionStatus(config: OSSConfig): Promise<OSSConnectionTest | null> {
    return invoke<OSSConnectionTest | null>('get_cached_connection_status', { config });
  }

  /**
   * Clear all cached connection test results
   */
  async clearConnectionCache(): Promise<void> {
    return invoke<void>('clear_connection_cache');
  }

  /**
   * List objects in OSS bucket with optional prefix
   */
  async listOSSObjects(config: OSSConfig, prefix: string = ''): Promise<ObjectInfo[]> {
    return invoke<ObjectInfo[]>('list_oss_objects', { config, prefix });
  }

  /**
   * Export OSS configuration as JSON string
   */
  async exportOSSConfig(): Promise<string> {
    return invoke<string>('export_oss_config');
  }

  /**
   * Import OSS configuration from JSON string
   */
  async importOSSConfig(configJson: string): Promise<void> {
    return invoke<void>('import_oss_config', { configJson });
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * Replace markdown links in files
   */
  async replaceMarkdownLinks(replacements: LinkReplacement[]): Promise<void> {
    return invoke<void>('replace_markdown_links', { replacements });
  }

  /**
   * Replace markdown links and return detailed results
   */
  async replaceMarkdownLinksWithResult(replacements: LinkReplacement[]): Promise<BatchReplacementResult> {
    return invoke<BatchReplacementResult>('replace_markdown_links_with_result', { replacements });
  }

  /**
   * Replace links in a single file and return results
   */
  async replaceSingleFileLinks(filePath: string, replacements: LinkReplacement[]): Promise<ReplacementResult> {
    return invoke<ReplacementResult>('replace_single_file_links', { filePath, replacements });
  }

  /**
   * Create a backup of a file before modification
   */
  async createBackup(filePath: string): Promise<BackupInfo> {
    return invoke<BackupInfo>('create_backup', { filePath });
  }

  /**
   * Restore a file from backup
   */
  async restoreFromBackup(backupId: string): Promise<void> {
    return invoke<void>('restore_from_backup', { backupId });
  }

  /**
   * List all backups, optionally filtered by file path
   */
  async listBackups(filePath?: string): Promise<BackupInfo[]> {
    return invoke<BackupInfo[]>('list_backups', { filePath });
  }

  /**
   * Rollback file changes using backup information
   */
  async rollbackFileChanges(backupInfos: BackupInfo[]): Promise<RollbackResult> {
    return invoke<RollbackResult>('rollback_file_changes', { backupInfos });
  }

  /**
   * Delete a specific backup
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    return invoke<boolean>('delete_backup', { backupId });
  }

  /**
   * Clean up old backups older than specified days
   */
  async cleanupOldBackups(olderThanDays: number): Promise<number> {
    return invoke<number>('cleanup_old_backups', { olderThanDays });
  }

  // ============================================================================
  // History Operations
  // ============================================================================

  /**
   * Get paginated upload history
   */
  async getUploadHistory(page?: number, pageSize?: number): Promise<PaginatedResult<HistoryRecord>> {
    return invoke<PaginatedResult<HistoryRecord>>('get_upload_history', { page, pageSize });
  }

  /**
   * Search history records with filters and pagination
   */
  async searchHistory(
    searchTerm?: string,
    operationType?: string,
    successOnly?: boolean,
    startDate?: string,
    endDate?: string,
    page?: number,
    pageSize?: number
  ): Promise<PaginatedResult<HistoryRecord>> {
    return invoke<PaginatedResult<HistoryRecord>>('search_history', {
      searchTerm,
      operationType,
      successOnly,
      startDate,
      endDate,
      page,
      pageSize,
    });
  }

  /**
   * Clear all history records
   */
  async clearHistory(): Promise<void> {
    return invoke<void>('clear_history');
  }

  /**
   * Export history data as JSON string
   */
  async exportHistory(): Promise<string> {
    return invoke<string>('export_history');
  }

  /**
   * Export history data and download as file
   */
  async exportHistoryToFile(): Promise<void> {
    const historyData = await this.exportHistory();
    const blob = new Blob([historyData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `history-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }

  /**
   * Add a new history record
   */
  async addHistoryRecord(
    operation: string,
    files: string[],
    imageCount: number,
    success: boolean,
    backupPath?: string,
    duration?: number,
    totalSize?: number,
    errorMessage?: string
  ): Promise<string> {
    return invoke<string>('add_history_record', {
      operation,
      files,
      imageCount,
      success,
      backupPath,
      duration,
      totalSize,
      errorMessage,
    });
  }

  /**
   * Get history statistics
   */
  async getHistoryStatistics(): Promise<HistoryStatistics> {
    return invoke<HistoryStatistics>('get_history_statistics');
  }

  /**
   * Clean up old history records older than specified days
   */
  async cleanupOldHistory(olderThanDays: number): Promise<number> {
    return invoke<number>('cleanup_old_history', { olderThanDays });
  }

  /**
   * Get file operations with optional limit
   */
  async getFileOperations(limit?: number): Promise<FileOperation[]> {
    return invoke<FileOperation[]>('get_file_operations', { limit });
  }

  // ============================================================================
  // Utility Operations
  // ============================================================================

  /**
   * Get application version
   */
  async getAppVersion(): Promise<string> {
    return invoke<string>('get_app_version');
  }

  /**
   * Validate a file path for security and existence
   */
  async validateFilePath(path: string): Promise<boolean> {
    return invoke<boolean>('validate_file_path', { path });
  }

  /**
   * Get file size in bytes
   */
  async getFileSize(path: string): Promise<number> {
    return invoke<number>('get_file_size', { path });
  }

  // ============================================================================
  // Duplicate Detection Operations
  // ============================================================================

  /**
   * Calculate SHA256 checksum for an image file
   */
  async calculateImageChecksum(imagePath: string): Promise<string> {
    return invoke<string>('calculate_image_checksum', { imagePath });
  }

  /**
   * Check if an image is a duplicate based on its checksum
   */
  async checkDuplicateByChecksum(checksum: string): Promise<DuplicateCheckResult> {
    return invoke<DuplicateCheckResult>('check_duplicate_by_checksum', { checksum });
  }

  /**
   * Check multiple images for duplicates in batch
   */
  async checkDuplicatesBatch(imagePaths: string[]): Promise<DuplicateCheckResult[]> {
    return invoke<DuplicateCheckResult[]>('check_duplicates_batch', { imagePaths });
  }

  /**
   * Get detailed information about a duplicate image
   */
  async getDuplicateInfo(checksum: string): Promise<DuplicateInfo | null> {
    return invoke<DuplicateInfo | null>('get_duplicate_info', { checksum });
  }

  // ============================================================================
  // System Health and Monitoring Operations
  // ============================================================================

  /**
   * Get current system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    return invoke<SystemHealth>('get_system_health');
  }

  /**
   * Get notification configuration
   */
  async getNotificationConfig(): Promise<NotificationConfig> {
    return invoke<NotificationConfig>('get_notification_config');
  }

  /**
   * Update notification configuration
   */
  async updateNotificationConfig(config: NotificationConfig): Promise<void> {
    return invoke<void>('update_notification_config', { config });
  }

  /**
   * Send a notification to the user
   */
  async sendNotification(notification: ProgressNotification): Promise<void> {
    return invoke<void>('send_notification', { notification });
  }

  // ============================================================================
  // Enhanced Upload Task Management Operations
  // ============================================================================

  /**
   * Cancel a specific upload task
   */
  async cancelUploadTask(taskId: string): Promise<void> {
    return invoke<void>('cancel_upload_task', { taskId });
  }

  /**
   * Retry a failed upload task
   */
  async retryUploadTask(taskId: string, maxRetries?: number): Promise<void> {
    return invoke<void>('retry_upload_task', { taskId, maxRetries });
  }

  /**
   * Get status of a specific upload task
   */
  async getUploadTaskStatus(taskId: string): Promise<UploadTaskInfo | null> {
    return invoke<UploadTaskInfo | null>('get_upload_task_status', { taskId });
  }

  /**
   * Get all upload tasks with their current status
   */
  async getAllUploadTasks(): Promise<UploadTaskManager> {
    return invoke<UploadTaskManager>('get_all_upload_tasks');
  }
}

// Export singleton instance
export const tauriAPI = new TauriAPI();

// Export individual method groups for convenience
export const fileOperations = {
  scanMarkdownFiles: (filePaths: string[]) => tauriAPI.scanMarkdownFiles(filePaths),
  getImageInfo: (imagePath: string) => tauriAPI.getImageInfo(imagePath),
  generateThumbnail: (imagePath: string, size: number) => tauriAPI.generateThumbnail(imagePath, size),
};

export const uploadOperations = {
  uploadImages: (imagePaths: string[], config: OSSConfig) => tauriAPI.uploadImages(imagePaths, config),
  uploadImagesWithIds: (imageData: [string, string][], config: OSSConfig) => tauriAPI.uploadImagesWithIds(imageData, config),
  uploadImagesBatch: (imagePaths: string[], config: OSSConfig, batchSize?: number) => tauriAPI.uploadImagesBatch(imagePaths, config, batchSize),
  getUploadProgress: (taskId: string) => tauriAPI.getUploadProgress(taskId),
  getAllUploadProgress: () => tauriAPI.getAllUploadProgress(),
  cancelUpload: (taskId: string) => tauriAPI.cancelUpload(taskId),
  retryUpload: (taskId: string) => tauriAPI.retryUpload(taskId),
  clearUploadProgress: () => tauriAPI.clearUploadProgress(),
  generateUuid: () => tauriAPI.generateUuid(),
};

export const configOperations = {
  saveOSSConfig: (config: OSSConfig, options?: SaveOptions) => tauriAPI.saveOSSConfig(config, options),
  loadOSSConfig: () => tauriAPI.loadOSSConfig(),
  testOSSConnection: (config: OSSConfig) => tauriAPI.testOSSConnection(config),
  validateOSSConfig: (config: OSSConfig) => tauriAPI.validateOSSConfig(config),
  getCachedConnectionStatus: (config: OSSConfig) => tauriAPI.getCachedConnectionStatus(config),
  clearConnectionCache: () => tauriAPI.clearConnectionCache(),
  listOSSObjects: (config: OSSConfig, prefix?: string) => tauriAPI.listOSSObjects(config, prefix || ''),
  exportOSSConfig: () => tauriAPI.exportOSSConfig(),
  importOSSConfig: (configJson: string) => tauriAPI.importOSSConfig(configJson),
};

export const historyOperations = {
  getUploadHistory: (page?: number, pageSize?: number) => tauriAPI.getUploadHistory(page, pageSize),
  searchHistory: (
    searchTerm?: string,
    operationType?: string,
    successOnly?: boolean,
    startDate?: string,
    endDate?: string,
    page?: number,
    pageSize?: number
  ) => tauriAPI.searchHistory(searchTerm, operationType, successOnly, startDate, endDate, page, pageSize),
  clearHistory: () => tauriAPI.clearHistory(),
  exportHistory: () => tauriAPI.exportHistory(),
  exportHistoryToFile: () => tauriAPI.exportHistoryToFile(),
  addHistoryRecord: (
    operation: string,
    files: string[],
    imageCount: number,
    success: boolean,
    backupPath?: string,
    duration?: number,
    totalSize?: number,
    errorMessage?: string
  ) => tauriAPI.addHistoryRecord(operation, files, imageCount, success, backupPath, duration, totalSize, errorMessage),
  getHistoryStatistics: () => tauriAPI.getHistoryStatistics(),
};

export const duplicateOperations = {
  calculateImageChecksum: (imagePath: string) => tauriAPI.calculateImageChecksum(imagePath),
  checkDuplicateByChecksum: (checksum: string) => tauriAPI.checkDuplicateByChecksum(checksum),
  checkDuplicatesBatch: (imagePaths: string[]) => tauriAPI.checkDuplicatesBatch(imagePaths),
  getDuplicateInfo: (checksum: string) => tauriAPI.getDuplicateInfo(checksum),
};

export const systemHealthOperations = {
  getSystemHealth: () => tauriAPI.getSystemHealth(),
  getNotificationConfig: () => tauriAPI.getNotificationConfig(),
  updateNotificationConfig: (config: NotificationConfig) => tauriAPI.updateNotificationConfig(config),
  sendNotification: (notification: ProgressNotification) => tauriAPI.sendNotification(notification),
};

export const taskManagementOperations = {
  cancelUploadTask: (taskId: string) => tauriAPI.cancelUploadTask(taskId),
  retryUploadTask: (taskId: string, maxRetries?: number) => tauriAPI.retryUploadTask(taskId, maxRetries),
  getUploadTaskStatus: (taskId: string) => tauriAPI.getUploadTaskStatus(taskId),
  getAllUploadTasks: () => tauriAPI.getAllUploadTasks(),
};