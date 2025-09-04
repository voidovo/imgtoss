// State recovery utilities for application restart scenarios
// Handles persistence and restoration of application state

import { tauriAPI } from '../tauri-api';
import type { 
  OSSConfig, 
  UploadProgress, 
  SystemHealth, 
  HistoryStatistics,
} from '../types';
import type { UserPreferences } from '../contexts/app-state-context';

export interface RecoveryState {
  timestamp: string;
  version: string;
  config: OSSConfig | null;
  uploadProgress: Array<{ imageId: string; progress: UploadProgress }>;
  userPreferences: UserPreferences;
  lastSyncTime: string | null;
}

export interface RecoveryOptions {
  includeProgress?: boolean;
  includeConfig?: boolean;
  includePreferences?: boolean;
  maxAge?: number; // Maximum age in milliseconds
}

const RECOVERY_STORAGE_KEY = 'imgtoss-recovery-state';
const RECOVERY_VERSION = '1.0.0';
const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Save current application state for recovery
 */
export async function saveRecoveryState(
  config: OSSConfig | null,
  uploadProgress: Map<string, UploadProgress>,
  userPreferences: UserPreferences,
  lastSyncTime: Date | null,
  options: RecoveryOptions = {}
): Promise<void> {
  try {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      return
    }
    
    const recoveryState: RecoveryState = {
      timestamp: new Date().toISOString(),
      version: RECOVERY_VERSION,
      config: options.includeConfig !== false ? config : null,
      uploadProgress: options.includeProgress !== false 
        ? Array.from(uploadProgress.entries()).map(([imageId, progress]) => ({ imageId, progress }))
        : [],
      userPreferences: options.includePreferences !== false ? userPreferences : {} as UserPreferences,
      lastSyncTime: lastSyncTime?.toISOString() || null,
    };

    localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(recoveryState));
  } catch (error) {
    console.error('Failed to save recovery state:', error);
  }
}

/**
 * Load and validate recovery state
 */
export async function loadRecoveryState(options: RecoveryOptions = {}): Promise<RecoveryState | null> {
  try {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      return null
    }
    
    const stored = localStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!stored) return null;

    const recoveryState: RecoveryState = JSON.parse(stored);
    
    // Validate version compatibility
    if (recoveryState.version !== RECOVERY_VERSION) {
      console.warn('Recovery state version mismatch, clearing old state');
      clearRecoveryState();
      return null;
    }

    // Check age
    const maxAge = options.maxAge || DEFAULT_MAX_AGE;
    const stateAge = Date.now() - new Date(recoveryState.timestamp).getTime();
    if (stateAge > maxAge) {
      console.warn('Recovery state too old, clearing');
      clearRecoveryState();
      return null;
    }

    return recoveryState;
  } catch (error) {
    console.error('Failed to load recovery state:', error);
    clearRecoveryState();
    return null;
  }
}

/**
 * Clear recovery state
 */
export function clearRecoveryState(): void {
  try {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      return
    }
    
    localStorage.removeItem(RECOVERY_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear recovery state:', error);
  }
}

/**
 * Recover application state after restart
 */
export async function recoverApplicationState(options: RecoveryOptions = {}): Promise<{
  config: OSSConfig | null;
  uploadProgress: Map<string, UploadProgress>;
  userPreferences: UserPreferences | null;
  lastSyncTime: Date | null;
  wasRecovered: boolean;
}> {
  const recoveryState = await loadRecoveryState(options);
  
  if (!recoveryState) {
    return {
      config: null,
      uploadProgress: new Map(),
      userPreferences: null,
      lastSyncTime: null,
      wasRecovered: false,
    };
  }

  // Reconstruct upload progress map
  const uploadProgress = new Map<string, UploadProgress>();
  recoveryState.uploadProgress.forEach(({ imageId, progress }) => {
    uploadProgress.set(imageId, progress);
  });

  return {
    config: recoveryState.config,
    uploadProgress,
    userPreferences: recoveryState.userPreferences,
    lastSyncTime: recoveryState.lastSyncTime ? new Date(recoveryState.lastSyncTime) : null,
    wasRecovered: true,
  };
}

/**
 * Validate and sync recovered state with backend
 */
export async function validateRecoveredState(
  config: OSSConfig | null,
  uploadProgress: Map<string, UploadProgress>
): Promise<{
  validConfig: OSSConfig | null;
  validProgress: Map<string, UploadProgress>;
  syncRequired: boolean;
}> {
  let validConfig = config;
  let validProgress = new Map<string, UploadProgress>();
  let syncRequired = false;

  try {
    // Validate configuration by loading from backend
    const backendConfig = await tauriAPI.loadOSSConfig();
    if (backendConfig && config) {
      // Compare configurations
      const configChanged = JSON.stringify(backendConfig) !== JSON.stringify(config);
      if (configChanged) {
        validConfig = backendConfig;
        syncRequired = true;
      }
    } else if (backendConfig) {
      validConfig = backendConfig;
      syncRequired = true;
    }

    // Validate upload progress by checking with backend
    if (uploadProgress.size > 0) {
      try {
        const backendProgress = await tauriAPI.getAllUploadProgress();
        const backendProgressMap = new Map<string, UploadProgress>();
        backendProgress.forEach(progress => {
          backendProgressMap.set(progress.image_id, progress);
        });

        // Merge progress, preferring backend data
        for (const [imageId, localProgress] of uploadProgress) {
          const backendProgressItem = backendProgressMap.get(imageId);
          if (backendProgressItem) {
            validProgress.set(imageId, backendProgressItem);
          } else {
            // Local progress exists but not in backend, might be stale
            if (localProgress.progress < 100) {
              validProgress.set(imageId, localProgress);
            }
          }
        }

        // Add any backend progress not in local state
        for (const [imageId, backendProgressItem] of backendProgressMap) {
          if (!validProgress.has(imageId)) {
            validProgress.set(imageId, backendProgressItem);
            syncRequired = true;
          }
        }
      } catch (error) {
        console.warn('Failed to validate upload progress with backend:', error);
        // Keep local progress if backend validation fails
        validProgress = uploadProgress;
      }
    }
  } catch (error) {
    console.error('Failed to validate recovered state:', error);
    // Keep recovered state if validation fails
    validConfig = config;
    validProgress = uploadProgress;
  }

  return {
    validConfig,
    validProgress,
    syncRequired,
  };
}

/**
 * Auto-save recovery state periodically
 */
export function setupAutoRecovery(
  getState: () => {
    config: OSSConfig | null;
    uploadProgress: Map<string, UploadProgress>;
    userPreferences: UserPreferences;
    lastSyncTime: Date | null;
  },
  intervalMs: number = 30000 // 30 seconds
): () => void {
  const interval = setInterval(async () => {
    try {
      const state = getState();
      await saveRecoveryState(
        state.config,
        state.uploadProgress,
        state.userPreferences,
        state.lastSyncTime
      );
    } catch (error) {
      console.error('Auto-recovery save failed:', error);
    }
  }, intervalMs);

  // Return cleanup function
  return () => clearInterval(interval);
}

/**
 * Handle application shutdown gracefully
 */
export async function handleApplicationShutdown(
  config: OSSConfig | null,
  uploadProgress: Map<string, UploadProgress>,
  userPreferences: UserPreferences,
  lastSyncTime: Date | null
): Promise<void> {
  try {
    // Save final recovery state
    await saveRecoveryState(config, uploadProgress, userPreferences, lastSyncTime);
    
    // Cancel any ongoing uploads
    for (const [imageId] of uploadProgress) {
      try {
        await tauriAPI.cancelUpload(imageId);
      } catch (error) {
        console.warn(`Failed to cancel upload ${imageId}:`, error);
      }
    }
  } catch (error) {
    console.error('Failed to handle application shutdown:', error);
  }
}

/**
 * Check if recovery state exists
 */
export function hasRecoveryState(): boolean {
  try {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      return false
    }
    
    return localStorage.getItem(RECOVERY_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Get recovery state info without loading it
 */
export function getRecoveryStateInfo(): {
  exists: boolean;
  timestamp: Date | null;
  age: number | null;
} {
  try {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      return { exists: false, timestamp: null, age: null }
    }
    
    const stored = localStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!stored) {
      return { exists: false, timestamp: null, age: null };
    }

    const recoveryState = JSON.parse(stored);
    const timestamp = new Date(recoveryState.timestamp);
    const age = Date.now() - timestamp.getTime();

    return { exists: true, timestamp, age };
  } catch {
    return { exists: false, timestamp: null, age: null };
  }
}