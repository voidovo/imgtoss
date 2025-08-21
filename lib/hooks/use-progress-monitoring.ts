// React hook for progress monitoring and notifications
// Provides real-time progress updates and notification management

import { useEffect, useState, useCallback, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { 
  UploadProgress, 
  SystemHealth, 
  ProgressNotification, 
  UploadTaskManager,
  UploadTaskInfo 
} from '../types';
import { NotificationType } from '../types';
import { tauriAPI } from '../tauri-api';

interface ProgressMonitoringState {
  uploadProgress: Map<string, UploadProgress>;
  systemHealth: SystemHealth | null;
  notifications: ProgressNotification[];
  isMonitoring: boolean;
  lastUpdate: Date | null;
}

interface ProgressMonitoringActions {
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => void;
  clearProgress: () => Promise<void>;
  dismissNotification: (id: string) => void;
  clearAllNotifications: () => void;
  sendNotification: (notification: Omit<ProgressNotification, 'id' | 'timestamp'>) => Promise<void>;
  refreshSystemHealth: () => Promise<void>;
  cancelUpload: (taskId: string) => Promise<void>;
  retryUpload: (taskId: string, maxRetries?: number) => Promise<void>;
}

export function useProgressMonitoring(): ProgressMonitoringState & ProgressMonitoringActions {
  const [state, setState] = useState<ProgressMonitoringState>({
    uploadProgress: new Map(),
    systemHealth: null,
    notifications: [],
    isMonitoring: false,
    lastUpdate: null,
  });

  const unlistenRef = useRef<UnlistenFn | null>(null);
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start monitoring progress events
  const startMonitoring = useCallback(async () => {
    if (state.isMonitoring) return;

    try {
      // Listen for upload progress events
      const unlisten = await listen<UploadProgress>('upload-progress', (event) => {
        const progress = event.payload;
        setState(prev => ({
          ...prev,
          uploadProgress: new Map(prev.uploadProgress).set(progress.image_id, progress),
          lastUpdate: new Date(),
        }));

        // Auto-create progress notification
        const notification: ProgressNotification = {
          id: `progress-${progress.image_id}`,
          type: NotificationType.Progress,
          title: 'Upload Progress',
          message: `Uploading image: ${Math.round(progress.progress)}%`,
          progress: progress.progress,
          timestamp: new Date().toISOString(),
          dismissible: false,
          auto_dismiss: progress.progress >= 100,
        };

        setState(prev => ({
          ...prev,
          notifications: [
            ...prev.notifications.filter(n => n.id !== notification.id),
            notification
          ],
        }));

        // Auto-dismiss completed uploads after 3 seconds
        if (progress.progress >= 100) {
          setTimeout(() => {
            setState(prev => ({
              ...prev,
              notifications: prev.notifications.filter(n => n.id !== notification.id),
              uploadProgress: (() => {
                const newMap = new Map(prev.uploadProgress);
                newMap.delete(progress.image_id);
                return newMap;
              })(),
            }));
          }, 3000);
        }
      });

      unlistenRef.current = unlisten;

      // Start periodic health checks
      const healthInterval = setInterval(async () => {
        try {
          const health = await tauriAPI.getSystemHealth();
          setState(prev => ({
            ...prev,
            systemHealth: health,
          }));

          // Create notifications for health issues
          if (health.errors.length > 0) {
            const healthNotifications = health.errors.map(error => ({
              id: `health-${error.component}-${Date.now()}`,
              type: error.severity === 'Critical' ? NotificationType.Error : NotificationType.Warning,
              title: `System Health: ${error.component}`,
              message: error.message,
              timestamp: new Date().toISOString(),
              dismissible: true,
              auto_dismiss: false,
            }));

            setState(prev => ({
              ...prev,
              notifications: [...prev.notifications, ...healthNotifications],
            }));
          }
        } catch (error) {
          console.error('Failed to check system health:', error);
        }
      }, 30000); // Check every 30 seconds

      healthCheckIntervalRef.current = healthInterval;

      // Initial health check
      await refreshSystemHealth();

      setState(prev => ({
        ...prev,
        isMonitoring: true,
      }));

    } catch (error) {
      console.error('Failed to start progress monitoring:', error);
      throw error;
    }
  }, [state.isMonitoring]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current);
      healthCheckIntervalRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isMonitoring: false,
    }));
  }, []);

  // Clear all progress data
  const clearProgress = useCallback(async () => {
    try {
      await tauriAPI.clearUploadProgress();
      setState(prev => ({
        ...prev,
        uploadProgress: new Map(),
        notifications: prev.notifications.filter(n => n.type !== NotificationType.Progress),
      }));
    } catch (error) {
      console.error('Failed to clear progress:', error);
      throw error;
    }
  }, []);

  // Dismiss a specific notification
  const dismissNotification = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      notifications: prev.notifications.filter(n => n.id !== id),
    }));
  }, []);

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    setState(prev => ({
      ...prev,
      notifications: [],
    }));
  }, []);

  // Send a custom notification
  const sendNotification = useCallback(async (
    notification: Omit<ProgressNotification, 'id' | 'timestamp'>
  ) => {
    const fullNotification: ProgressNotification = {
      ...notification,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    setState(prev => ({
      ...prev,
      notifications: [...prev.notifications, fullNotification],
    }));

    // Auto-dismiss if configured
    if (fullNotification.auto_dismiss) {
      setTimeout(() => {
        dismissNotification(fullNotification.id);
      }, 5000);
    }

    try {
      await tauriAPI.sendNotification(fullNotification);
    } catch (error) {
      console.error('Failed to send notification to backend:', error);
    }
  }, [dismissNotification]);

  // Refresh system health
  const refreshSystemHealth = useCallback(async () => {
    try {
      const health = await tauriAPI.getSystemHealth();
      setState(prev => ({
        ...prev,
        systemHealth: health,
      }));
    } catch (error) {
      console.error('Failed to refresh system health:', error);
      throw error;
    }
  }, []);

  // Cancel upload
  const cancelUpload = useCallback(async (taskId: string) => {
    try {
      await tauriAPI.cancelUploadTask(taskId);
      
      // Remove from progress map
      setState(prev => ({
        ...prev,
        uploadProgress: (() => {
          const newMap = new Map(prev.uploadProgress);
          newMap.delete(taskId);
          return newMap;
        })(),
      }));

      // Send cancellation notification
      await sendNotification({
        type: NotificationType.Info,
        title: 'Upload Cancelled',
        message: 'Upload has been cancelled successfully',
        dismissible: true,
        auto_dismiss: true,
      });
    } catch (error) {
      console.error('Failed to cancel upload:', error);
      await sendNotification({
        type: NotificationType.Error,
        title: 'Cancellation Failed',
        message: 'Failed to cancel upload',
        dismissible: true,
        auto_dismiss: false,
      });
      throw error;
    }
  }, [sendNotification]);

  // Retry upload
  const retryUpload = useCallback(async (taskId: string, maxRetries?: number) => {
    try {
      await tauriAPI.retryUploadTask(taskId, maxRetries);
      
      await sendNotification({
        type: NotificationType.Info,
        title: 'Upload Retry',
        message: 'Upload is being retried',
        dismissible: true,
        auto_dismiss: true,
      });
    } catch (error) {
      console.error('Failed to retry upload:', error);
      await sendNotification({
        type: NotificationType.Error,
        title: 'Retry Failed',
        message: 'Failed to retry upload',
        dismissible: true,
        auto_dismiss: false,
      });
      throw error;
    }
  }, [sendNotification]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  return {
    ...state,
    startMonitoring,
    stopMonitoring,
    clearProgress,
    dismissNotification,
    clearAllNotifications,
    sendNotification,
    refreshSystemHealth,
    cancelUpload,
    retryUpload,
  };
}

// Hook for simplified progress monitoring (just progress data)
export function useUploadProgress() {
  const [progress, setProgress] = useState<Map<string, UploadProgress>>(new Map());
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    const setupListener = async () => {
      try {
        // Get initial progress
        const initialProgress = await tauriAPI.getAllUploadProgress();
        const progressMap = new Map();
        initialProgress.forEach(p => progressMap.set(p.image_id, p));
        setProgress(progressMap);

        // Listen for updates
        const unlisten = await listen<UploadProgress>('upload-progress', (event) => {
          const progressUpdate = event.payload;
          setProgress(prev => new Map(prev).set(progressUpdate.image_id, progressUpdate));
        });

        unlistenRef.current = unlisten;
      } catch (error) {
        console.error('Failed to setup progress listener:', error);
      }
    };

    setupListener();

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  return progress;
}

// Hook for system health monitoring
export function useSystemHealth() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshHealth = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const healthData = await tauriAPI.getSystemHealth();
      setHealth(healthData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get system health');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    
    // Set up periodic health checks
    const interval = setInterval(refreshHealth, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [refreshHealth]);

  return {
    health,
    isLoading,
    error,
    refreshHealth,
  };
}