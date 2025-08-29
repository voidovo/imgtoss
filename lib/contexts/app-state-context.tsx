"use client"

import React, { createContext, useContext, useReducer, useEffect, useCallback, ReactNode } from 'react';
import { tauriAPI } from '../tauri-api';
import type {
  OSSConfig,
  OSSConnectionTest,
  SystemHealth,
  UploadProgress,
  HistoryStatistics,
  NotificationConfig,
  ProgressNotification,
  AppError,
} from '../types';
import { ErrorType } from '../types';

// ============================================================================
// State Types
// ============================================================================

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  autoSaveConfig: boolean;
  showNotifications: boolean;
  defaultUploadPath: string;
  defaultBatchSize: number;
  autoBackup: boolean;
  compressionEnabled: boolean;
  compressionQuality: number;
  duplicateCheckEnabled: boolean;
  autoRetryFailedUploads: boolean;
  maxRetryAttempts: number;
}

export interface AppState {
  // Configuration state
  ossConfig: OSSConfig | null;
  isConfigLoaded: boolean;
  configError: string | null;
  lastConnectionTest: OSSConnectionTest | null;
  
  // System health and monitoring
  systemHealth: SystemHealth | null;
  isHealthLoading: boolean;
  healthError: string | null;
  
  // Upload progress tracking
  uploadProgress: Map<string, UploadProgress>;
  activeUploads: number;
  
  // History and statistics
  historyStatistics: HistoryStatistics | null;
  
  // User preferences
  userPreferences: UserPreferences;
  preferencesLoaded: boolean;
  
  // Notifications
  notifications: ProgressNotification[];
  notificationConfig: NotificationConfig | null;
  
  // Application state
  isInitialized: boolean;
  isOnline: boolean;
  lastSyncTime: Date | null;
  
  // Error handling
  errors: AppError[];
}

// ============================================================================
// Action Types
// ============================================================================

export type AppAction =
  | { type: 'SET_INITIALIZED'; payload: boolean }
  | { type: 'SET_OSS_CONFIG'; payload: OSSConfig | null }
  | { type: 'SET_CONFIG_LOADING'; payload: boolean }
  | { type: 'SET_CONFIG_ERROR'; payload: string | null }
  | { type: 'SET_LAST_CONNECTION_TEST'; payload: OSSConnectionTest | null }
  | { type: 'SET_SYSTEM_HEALTH'; payload: SystemHealth | null }
  | { type: 'SET_HEALTH_LOADING'; payload: boolean }
  | { type: 'SET_HEALTH_ERROR'; payload: string | null }
  | { type: 'SET_UPLOAD_PROGRESS'; payload: { imageId: string; progress: UploadProgress } }
  | { type: 'REMOVE_UPLOAD_PROGRESS'; payload: string }
  | { type: 'CLEAR_UPLOAD_PROGRESS' }
  | { type: 'SET_HISTORY_STATISTICS'; payload: HistoryStatistics | null }
  | { type: 'SET_USER_PREFERENCES'; payload: Partial<UserPreferences> }
  | { type: 'SET_PREFERENCES_LOADED'; payload: boolean }
  | { type: 'ADD_NOTIFICATION'; payload: ProgressNotification }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'CLEAR_NOTIFICATIONS' }
  | { type: 'SET_NOTIFICATION_CONFIG'; payload: NotificationConfig }
  | { type: 'SET_ONLINE_STATUS'; payload: boolean }
  | { type: 'SET_LAST_SYNC_TIME'; payload: Date }
  | { type: 'ADD_ERROR'; payload: AppError }
  | { type: 'REMOVE_ERROR'; payload: string }
  | { type: 'CLEAR_ERRORS' };

// ============================================================================
// Default State
// ============================================================================

const defaultUserPreferences: UserPreferences = {
  theme: 'system',
  autoSaveConfig: true,
  showNotifications: true,
  defaultUploadPath: 'images/',
  defaultBatchSize: 3,
  autoBackup: true,
  compressionEnabled: false,
  compressionQuality: 80,
  duplicateCheckEnabled: true,
  autoRetryFailedUploads: true,
  maxRetryAttempts: 3,
};

const initialState: AppState = {
  ossConfig: null,
  isConfigLoaded: false,
  configError: null,
  lastConnectionTest: null,
  systemHealth: null,
  isHealthLoading: false,
  healthError: null,
  uploadProgress: new Map(),
  activeUploads: 0,
  historyStatistics: null,
  userPreferences: defaultUserPreferences,
  preferencesLoaded: false,
  notifications: [],
  notificationConfig: null,
  isInitialized: false,
  isOnline: navigator.onLine,
  lastSyncTime: null,
  errors: [],
};

// ============================================================================
// Reducer
// ============================================================================

function appStateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: action.payload };
      
    case 'SET_OSS_CONFIG':
      return { 
        ...state, 
        ossConfig: action.payload,
        isConfigLoaded: true,
        configError: null,
      };
      
    case 'SET_CONFIG_LOADING':
      return { ...state, isConfigLoaded: !action.payload };
      
    case 'SET_CONFIG_ERROR':
      return { ...state, configError: action.payload };
      
    case 'SET_LAST_CONNECTION_TEST':
      return { ...state, lastConnectionTest: action.payload };
      
    case 'SET_SYSTEM_HEALTH':
      return { 
        ...state, 
        systemHealth: action.payload,
        isHealthLoading: false,
        healthError: null,
      };
      
    case 'SET_HEALTH_LOADING':
      return { ...state, isHealthLoading: action.payload };
      
    case 'SET_HEALTH_ERROR':
      return { ...state, healthError: action.payload, isHealthLoading: false };
      
    case 'SET_UPLOAD_PROGRESS':
      const newProgressMap = new Map(state.uploadProgress);
      newProgressMap.set(action.payload.imageId, action.payload.progress);
      return { 
        ...state, 
        uploadProgress: newProgressMap,
        activeUploads: newProgressMap.size,
      };
      
    case 'REMOVE_UPLOAD_PROGRESS':
      const updatedProgressMap = new Map(state.uploadProgress);
      updatedProgressMap.delete(action.payload);
      return { 
        ...state, 
        uploadProgress: updatedProgressMap,
        activeUploads: updatedProgressMap.size,
      };
      
    case 'CLEAR_UPLOAD_PROGRESS':
      return { 
        ...state, 
        uploadProgress: new Map(),
        activeUploads: 0,
      };
      
    case 'SET_HISTORY_STATISTICS':
      return { ...state, historyStatistics: action.payload };
      
    case 'SET_USER_PREFERENCES':
      return { 
        ...state, 
        userPreferences: { ...state.userPreferences, ...action.payload },
      };
      
    case 'SET_PREFERENCES_LOADED':
      return { ...state, preferencesLoaded: action.payload };
      
    case 'ADD_NOTIFICATION':
      return { 
        ...state, 
        notifications: [...state.notifications, action.payload],
      };
      
    case 'REMOVE_NOTIFICATION':
      return { 
        ...state, 
        notifications: state.notifications.filter(n => n.id !== action.payload),
      };
      
    case 'CLEAR_NOTIFICATIONS':
      return { ...state, notifications: [] };
      
    case 'SET_NOTIFICATION_CONFIG':
      return { ...state, notificationConfig: action.payload };
      
    case 'SET_ONLINE_STATUS':
      return { ...state, isOnline: action.payload };
      
    case 'SET_LAST_SYNC_TIME':
      return { ...state, lastSyncTime: action.payload };
      
    case 'ADD_ERROR':
      return { 
        ...state, 
        errors: [...state.errors, action.payload],
      };
      
    case 'REMOVE_ERROR':
      return { 
        ...state, 
        errors: state.errors.filter(e => e.code !== action.payload),
      };
      
    case 'CLEAR_ERRORS':
      return { ...state, errors: [] };
      
    default:
      return state;
  }
}

// ============================================================================
// Context
// ============================================================================

interface AppStateContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  
  // Configuration actions
  loadConfig: () => Promise<void>;
  saveConfig: (config: OSSConfig) => Promise<void>;
  testConnection: (config: OSSConfig) => Promise<boolean>;
  
  // System health actions
  refreshSystemHealth: () => Promise<void>;
  
  // Upload progress actions
  updateUploadProgress: (imageId: string, progress: UploadProgress) => void;
  removeUploadProgress: (imageId: string) => void;
  clearAllProgress: () => Promise<void>;
  
  // History actions
  refreshHistoryStatistics: () => Promise<void>;
  
  // User preferences actions
  loadUserPreferences: () => Promise<void>;
  saveUserPreferences: (preferences: Partial<UserPreferences>) => Promise<void>;
  resetUserPreferences: () => Promise<void>;
  
  // Notification actions
  addNotification: (notification: Omit<ProgressNotification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
  
  // Error handling actions
  addError: (error: Omit<AppError, 'code'>) => void;
  removeError: (code: string) => void;
  clearAllErrors: () => void;
  
  // Utility actions
  initialize: () => Promise<void>;
  syncWithBackend: () => Promise<void>;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

interface AppStateProviderProps {
  children: ReactNode;
}

export function AppStateProvider({ children }: AppStateProviderProps) {
  const [state, dispatch] = useReducer(appStateReducer, initialState);

  // ============================================================================
  // Configuration Actions
  // ============================================================================

  const loadConfig = useCallback(async () => {
    try {
      dispatch({ type: 'SET_CONFIG_LOADING', payload: true });
      const config = await tauriAPI.loadOSSConfig();
      dispatch({ type: 'SET_OSS_CONFIG', payload: config });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load configuration';
      dispatch({ type: 'SET_CONFIG_ERROR', payload: errorMessage });
      addError({
        type: ErrorType.SERVICE,
        message: 'Failed to load OSS configuration',
        details: errorMessage,
        recoverable: true,
      });
    }
  }, []);

  const saveConfig = useCallback(async (config: OSSConfig) => {
    try {
      await tauriAPI.saveOSSConfig(config);
      dispatch({ type: 'SET_OSS_CONFIG', payload: config });
      
      if (state.userPreferences.showNotifications) {
        addNotification({
          type: 'Success' as any,
          title: 'Configuration Saved',
          message: 'OSS configuration has been saved successfully',
          dismissible: true,
          auto_dismiss: true,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save configuration';
      addError({
        type: ErrorType.SERVICE,
        message: 'Failed to save OSS configuration',
        details: errorMessage,
        recoverable: true,
      });
      throw error;
    }
  }, [state.userPreferences.showNotifications]);

  const testConnection = useCallback(async (config: OSSConfig): Promise<boolean> => {
    try {
      const result = await tauriAPI.testOSSConnection(config);
      return result.success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection test failed';
      addError({
        type: ErrorType.NETWORK,
        message: 'OSS connection test failed',
        details: errorMessage,
        recoverable: true,
      });
      return false;
    }
  }, []);

  // ============================================================================
  // System Health Actions
  // ============================================================================

  const refreshSystemHealth = useCallback(async () => {
    try {
      dispatch({ type: 'SET_HEALTH_LOADING', payload: true });
      const health = await tauriAPI.getSystemHealth();
      dispatch({ type: 'SET_SYSTEM_HEALTH', payload: health });
      dispatch({ type: 'SET_LAST_SYNC_TIME', payload: new Date() });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get system health';
      dispatch({ type: 'SET_HEALTH_ERROR', payload: errorMessage });
      addError({
        type: ErrorType.SERVICE,
        message: 'Failed to refresh system health',
        details: errorMessage,
        recoverable: true,
      });
    }
  }, []);

  // ============================================================================
  // Upload Progress Actions
  // ============================================================================

  const updateUploadProgress = useCallback((imageId: string, progress: UploadProgress) => {
    dispatch({ type: 'SET_UPLOAD_PROGRESS', payload: { imageId, progress } });
  }, []);

  const removeUploadProgress = useCallback((imageId: string) => {
    dispatch({ type: 'REMOVE_UPLOAD_PROGRESS', payload: imageId });
  }, []);

  const clearAllProgress = useCallback(async () => {
    try {
      await tauriAPI.clearUploadProgress();
      dispatch({ type: 'CLEAR_UPLOAD_PROGRESS' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear progress';
      addError({
        type: ErrorType.SERVICE,
        message: 'Failed to clear upload progress',
        details: errorMessage,
        recoverable: true,
      });
    }
  }, []);

  // ============================================================================
  // History Actions
  // ============================================================================

  const refreshHistoryStatistics = useCallback(async () => {
    try {
      const statistics = await tauriAPI.getHistoryStatistics();
      dispatch({ type: 'SET_HISTORY_STATISTICS', payload: statistics });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get history statistics';
      addError({
        type: ErrorType.SERVICE,
        message: 'Failed to refresh history statistics',
        details: errorMessage,
        recoverable: true,
      });
    }
  }, []);

  // ============================================================================
  // User Preferences Actions
  // ============================================================================

  const loadUserPreferences = useCallback(async () => {
    try {
      // Use async operation to prevent blocking main thread
      const stored = await new Promise<string | null>(resolve => {
        setTimeout(() => {
          resolve(localStorage.getItem('imgtoss-user-preferences'));
        }, 0);
      });
      
      if (stored) {
        const preferences = JSON.parse(stored) as Partial<UserPreferences>;
        dispatch({ type: 'SET_USER_PREFERENCES', payload: preferences });
      }
      dispatch({ type: 'SET_PREFERENCES_LOADED', payload: true });
    } catch (error) {
      console.error('Failed to load user preferences:', error);
      dispatch({ type: 'SET_PREFERENCES_LOADED', payload: true });
    }
  }, []);

  const saveUserPreferences = useCallback(async (preferences: Partial<UserPreferences>) => {
    try {
      dispatch({ type: 'SET_USER_PREFERENCES', payload: preferences });
      const updatedPreferences = { ...state.userPreferences, ...preferences };
      localStorage.setItem('imgtoss-user-preferences', JSON.stringify(updatedPreferences));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save preferences';
      addError({
        type: ErrorType.FILE_SYSTEM,
        message: 'Failed to save user preferences',
        details: errorMessage,
        recoverable: true,
      });
    }
  }, [state.userPreferences]);

  const resetUserPreferences = useCallback(async () => {
    try {
      localStorage.removeItem('imgtoss-user-preferences');
      dispatch({ type: 'SET_USER_PREFERENCES', payload: defaultUserPreferences });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to reset preferences';
      addError({
        type: ErrorType.FILE_SYSTEM,
        message: 'Failed to reset user preferences',
        details: errorMessage,
        recoverable: true,
      });
    }
  }, []);

  // ============================================================================
  // Notification Actions
  // ============================================================================

  const addNotification = useCallback((notification: Omit<ProgressNotification, 'id' | 'timestamp'>) => {
    const fullNotification: ProgressNotification = {
      ...notification,
      id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };
    
    dispatch({ type: 'ADD_NOTIFICATION', payload: fullNotification });
    
    // Auto-dismiss if configured
    if (fullNotification.auto_dismiss) {
      setTimeout(() => {
        removeNotification(fullNotification.id);
      }, 5000);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
  }, []);

  const clearAllNotifications = useCallback(() => {
    dispatch({ type: 'CLEAR_NOTIFICATIONS' });
  }, []);

  // ============================================================================
  // Error Handling Actions
  // ============================================================================

  const addError = useCallback((error: Omit<AppError, 'code'>) => {
    const fullError: AppError = {
      ...error,
      code: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    
    dispatch({ type: 'ADD_ERROR', payload: fullError });
    
    // Also add as notification if user wants to see errors
    if (state.userPreferences.showNotifications) {
      addNotification({
        type: 'Error' as any,
        title: 'Error',
        message: error.message,
        dismissible: true,
        auto_dismiss: false,
      });
    }
  }, [state.userPreferences.showNotifications]);

  const removeError = useCallback((code: string) => {
    dispatch({ type: 'REMOVE_ERROR', payload: code });
  }, []);

  const clearAllErrors = useCallback(() => {
    dispatch({ type: 'CLEAR_ERRORS' });
  }, []);

  // ============================================================================
  // Utility Actions
  // ============================================================================

  const initialize = useCallback(async () => {
    try {
      // Phase 1: Critical initialization (parallel execution)
      const [preferencesResult, configResult] = await Promise.allSettled([
        loadUserPreferences(),
        loadConfig()
      ]);
      
      // Handle preference loading errors
      if (preferencesResult.status === 'rejected') {
        console.warn('Failed to load user preferences:', preferencesResult.reason);
      }
      
      // Handle config loading errors
      if (configResult.status === 'rejected') {
        console.warn('Failed to load configuration:', configResult.reason);
      }
      
      // Mark as initialized early to unblock UI
      dispatch({ type: 'SET_INITIALIZED', payload: true });
      
      // Phase 2: Non-critical initialization (deferred)
      setTimeout(async () => {
        try {
          // Parallel execution of non-critical tasks
          const nonCriticalTasks = [];
          
          // Connection test (if config exists)
          if (configResult.status === 'fulfilled') {
            nonCriticalTasks.push(
              (async () => {
                try {
                  const config = await tauriAPI.loadOSSConfig();
                  if (config) {
                    console.log('Configuration loaded, performing automatic connection test...');
                    const connectionTest = await tauriAPI.testOSSConnection(config);
                    
                    dispatch({ type: 'SET_LAST_CONNECTION_TEST', payload: connectionTest });
                    
                    if (connectionTest.success) {
                      console.log(`Connection test successful (latency: ${connectionTest.latency}ms)`);
                      if (state.userPreferences.showNotifications) {
                        addNotification({
                          type: 'Success' as any,
                          title: '存储连接成功',
                          message: `连接测试成功，延迟: ${connectionTest.latency}ms`,
                          dismissible: true,
                          auto_dismiss: true,
                        });
                      }
                    } else {
                      console.warn('Connection test failed:', connectionTest.error);
                      addNotification({
                        type: 'Warning' as any,
                        title: '存储连接失败',
                        message: `连接测试失败: ${connectionTest.error || '未知错误'}`,
                        dismissible: true,
                        auto_dismiss: false,
                      });
                    }
                  }
                } catch (error) {
                  console.warn('Failed to perform automatic connection test:', error);
                }
              })()
            );
          }
          
          // Notification config
          nonCriticalTasks.push(
            (async () => {
              try {
                const notificationConfig = await tauriAPI.getNotificationConfig();
                dispatch({ type: 'SET_NOTIFICATION_CONFIG', payload: notificationConfig });
              } catch (error) {
                console.warn('Failed to load notification config:', error);
              }
            })()
          );
          
          // System health
          nonCriticalTasks.push(refreshSystemHealth());
          
          // History statistics
          nonCriticalTasks.push(refreshHistoryStatistics());
          
          // Execute all non-critical tasks in parallel
          await Promise.allSettled(nonCriticalTasks);
          
        } catch (error) {
          console.warn('Non-critical initialization failed:', error);
        }
      }, 100); // Defer by 100ms to unblock UI
      
    } catch (error) {
      console.error('Failed to initialize application state:', error);
      addError({
        type: ErrorType.SERVICE,
        message: 'Failed to initialize application',
        details: error instanceof Error ? error.message : 'Unknown error',
        recoverable: true,
      });
      // Still mark as initialized to prevent blocking
      dispatch({ type: 'SET_INITIALIZED', payload: true });
    }
  }, [loadUserPreferences, loadConfig, refreshSystemHealth, refreshHistoryStatistics, state.userPreferences.showNotifications, addNotification]);

  const syncWithBackend = useCallback(async () => {
    try {
      // Sync configuration
      await loadConfig();
      
      // Sync system health
      await refreshSystemHealth();
      
      // Sync history statistics
      await refreshHistoryStatistics();
      
      // Sync upload progress
      const allProgress = await tauriAPI.getAllUploadProgress();
      dispatch({ type: 'CLEAR_UPLOAD_PROGRESS' });
      allProgress.forEach(progress => {
        updateUploadProgress(progress.image_id, progress);
      });
      
      dispatch({ type: 'SET_LAST_SYNC_TIME', payload: new Date() });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      addError({
        type: ErrorType.SERVICE,
        message: 'Failed to sync with backend',
        details: errorMessage,
        recoverable: true,
      });
    }
  }, [loadConfig, refreshSystemHealth, refreshHistoryStatistics, updateUploadProgress]);

  // ============================================================================
  // Effects
  // ============================================================================

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => dispatch({ type: 'SET_ONLINE_STATUS', payload: true });
    const handleOffline = () => dispatch({ type: 'SET_ONLINE_STATUS', payload: false });
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Periodic sync when online (reduced frequency)
  useEffect(() => {
    if (!state.isOnline || !state.isInitialized) return;
    
    // Reduce sync frequency to every 5 minutes to avoid performance impact
    const interval = setInterval(() => {
      // Only sync if there are active operations or if it's been a while
      const timeSinceLastSync = state.lastSyncTime ? Date.now() - state.lastSyncTime.getTime() : 0;
      const hasActiveOperations = state.activeUploads > 0;
      
      // Sync if there are active uploads or it's been more than 10 minutes
      if (hasActiveOperations || timeSinceLastSync > 600000) {
        syncWithBackend();
      }
    }, 300000); // Check every 5 minutes instead of 1 minute
    
    return () => clearInterval(interval);
  }, [state.isOnline, state.isInitialized, state.activeUploads, state.lastSyncTime, syncWithBackend]);

  // Auto-save preferences when they change
  useEffect(() => {
    if (state.preferencesLoaded) {
      localStorage.setItem('imgtoss-user-preferences', JSON.stringify(state.userPreferences));
    }
  }, [state.userPreferences, state.preferencesLoaded]);

  // ============================================================================
  // Context Value
  // ============================================================================

  const contextValue: AppStateContextType = {
    state,
    dispatch,
    loadConfig,
    saveConfig,
    testConnection,
    refreshSystemHealth,
    updateUploadProgress,
    removeUploadProgress,
    clearAllProgress,
    refreshHistoryStatistics,
    loadUserPreferences,
    saveUserPreferences,
    resetUserPreferences,
    addNotification,
    removeNotification,
    clearAllNotifications,
    addError,
    removeError,
    clearAllErrors,
    initialize,
    syncWithBackend,
  };

  return (
    <AppStateContext.Provider value={contextValue}>
      {children}
    </AppStateContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useAppState() {
  const context = useContext(AppStateContext);
  if (context === undefined) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}