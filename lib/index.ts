// Main entry point for Tauri API integration
// Exports all the essential components for easy importing

// Core API client
export { TauriAPI, tauriAPI } from './tauri-api';

// Convenience method groups
export {
  fileOperations,
  uploadOperations,
  configOperations,
  historyOperations,
} from './tauri-api';

// Updater API
export { 
  UpdaterAPI, 
  updaterAPI, 
  updaterOperations 
} from './updater-api';

// State Management
export { AppStateProvider, useAppState } from './contexts/app-state-context';
export type { UserPreferences, AppState as AppContextState, AppAction } from './contexts/app-state-context';

// State Management Hooks
export * from './hooks/use-app-config';
export * from './hooks/use-user-preferences';
export * from './hooks/use-app-notifications';
export * from './hooks/use-app-sync';
export * from './hooks/use-progress-monitoring';

// State Recovery Utilities
export * from './utils/state-recovery';

// Error handling utilities
export {
  TauriError,
  parseTauriError,
  getUserFriendlyErrorMessage,
  withErrorHandling,
  withRetry,
  executeBatchOperation,
  logError,
  createErrorResponse,
  type ErrorResponse,
  type BatchOperationResult,
} from './error-handler';

// Type definitions
export type {
  // File and Scan types
  ScanResult,
  ImageReference,
  ImageInfo,
  
  // Upload types
  UploadTask,
  UploadResult,
  UploadProgress,
  
  // Configuration types
  OSSConfig,
  OSSConnectionTest,
  ConfigValidation,
  ObjectInfo,
  
  // File operation types
  LinkReplacement,
  FileOperation,
  ReplacementResult,
  ReplacementError,
  BatchReplacementResult,
  
  // History types
  UploadHistoryRecord,
  HistoryQuery,
  HistoryStatistics,
  
  // Utility types
  PaginatedResult,
  ValidationResult,
  AppState,
  AppError,
} from './types';

// Updater types
export type {
  UpdateInfo,
  UpdateProgress,
  UpdaterError,
} from './updater-api';

// Enums
export {
  ScanStatus,
  UploadStatus,
  OSSProvider,
  FileOperationType,
  ErrorType,
} from './types';

// Updater enums
export {
  UpdateStage,
  UpdaterErrorType,
} from './updater-api';

// Usage examples (for development and testing)
// export { examples } from './examples/tauri-usage-examples';