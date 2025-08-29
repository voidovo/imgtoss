// 单例模式的进度监控系统
// 避免重复创建监听器和定时器，提升性能

import { useState, useRef, useEffect, useCallback } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { 
  UploadProgress, 
  SystemHealth, 
  ProgressNotification
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

interface ProgressMonitoringSubscriber {
  id: string;
  onProgressUpdate?: (progress: Map<string, UploadProgress>) => void;
  onHealthUpdate?: (health: SystemHealth | null) => void;
  onNotification?: (notifications: ProgressNotification[]) => void;
}

class ProgressMonitoringSingleton {
  private static instance: ProgressMonitoringSingleton | null = null;
  private state: ProgressMonitoringState;
  private subscribers: Map<string, ProgressMonitoringSubscriber>;
  private unlistenFn: UnlistenFn | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  private constructor() {
    this.state = {
      uploadProgress: new Map(),
      systemHealth: null,
      notifications: [],
      isMonitoring: false,
      lastUpdate: null,
    };
    this.subscribers = new Map();
  }

  public static getInstance(): ProgressMonitoringSingleton {
    if (!ProgressMonitoringSingleton.instance) {
      ProgressMonitoringSingleton.instance = new ProgressMonitoringSingleton();
    }
    return ProgressMonitoringSingleton.instance;
  }

  public async startMonitoring(): Promise<void> {
    if (this.state.isMonitoring) return;

    try {
      // 只初始化一次监听器
      if (!this.isInitialized) {
        await this.initializeListeners();
        this.isInitialized = true;
      }

      this.state.isMonitoring = true;
      this.notifySubscribers();
    } catch (error) {
      console.error('Failed to start progress monitoring:', error);
      throw error;
    }
  }

  private async initializeListeners(): Promise<void> {
    // 监听上传进度事件
    this.unlistenFn = await listen<UploadProgress>('upload-progress', (event) => {
      const progress = event.payload;
      this.state.uploadProgress.set(progress.image_id, progress);
      this.state.lastUpdate = new Date();

      // 创建进度通知
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

      // 更新通知列表
      this.state.notifications = [
        ...this.state.notifications.filter(n => n.id !== notification.id),
        notification
      ];

      this.notifySubscribers();

      // 自动清理完成的上传
      if (progress.progress >= 100) {
        setTimeout(() => {
          this.state.notifications = this.state.notifications.filter(n => n.id !== notification.id);
          this.state.uploadProgress.delete(progress.image_id);
          this.notifySubscribers();
        }, 3000);
      }
    });

    // 启动健康检查（降低频率）
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await tauriAPI.getSystemHealth();
        this.state.systemHealth = health;
        this.notifySubscribers();

        // 只在有错误时创建通知
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

          this.state.notifications = [...this.state.notifications, ...healthNotifications];
          this.notifySubscribers();
        }
      } catch (error) {
        console.error('Failed to check system health:', error);
      }
    }, 60000); // 降低到每分钟检查一次

    // 初始健康检查
    try {
      const health = await tauriAPI.getSystemHealth();
      this.state.systemHealth = health;
      this.notifySubscribers();
    } catch (error) {
      console.warn('Initial health check failed:', error);
    }
  }

  public stopMonitoring(): void {
    // 不完全停止监听，只是标记为非活跃状态
    // 这样可以避免重复创建监听器
    this.state.isMonitoring = false;
    this.notifySubscribers();
  }

  public subscribe(subscriber: ProgressMonitoringSubscriber): () => void {
    this.subscribers.set(subscriber.id, subscriber);

    // 立即发送当前状态
    if (subscriber.onProgressUpdate) {
      subscriber.onProgressUpdate(this.state.uploadProgress);
    }
    if (subscriber.onHealthUpdate) {
      subscriber.onHealthUpdate(this.state.systemHealth);
    }
    if (subscriber.onNotification) {
      subscriber.onNotification(this.state.notifications);
    }

    // 返回取消订阅函数
    return () => {
      this.subscribers.delete(subscriber.id);
      
      // 如果没有订阅者了，可以考虑清理资源
      if (this.subscribers.size === 0 && !this.state.isMonitoring) {
        this.cleanup();
      }
    };
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(subscriber => {
      if (subscriber.onProgressUpdate) {
        subscriber.onProgressUpdate(this.state.uploadProgress);
      }
      if (subscriber.onHealthUpdate) {
        subscriber.onHealthUpdate(this.state.systemHealth);
      }
      if (subscriber.onNotification) {
        subscriber.onNotification(this.state.notifications);
      }
    });
  }

  public async clearProgress(): Promise<void> {
    try {
      await tauriAPI.clearUploadProgress();
      this.state.uploadProgress.clear();
      this.state.notifications = this.state.notifications.filter(n => n.type !== NotificationType.Progress);
      this.notifySubscribers();
    } catch (error) {
      console.error('Failed to clear progress:', error);
      throw error;
    }
  }

  public dismissNotification(id: string): void {
    this.state.notifications = this.state.notifications.filter(n => n.id !== id);
    this.notifySubscribers();
  }

  public clearAllNotifications(): void {
    this.state.notifications = [];
    this.notifySubscribers();
  }

  public async sendNotification(notification: Omit<ProgressNotification, 'id' | 'timestamp'>): Promise<void> {
    const fullNotification: ProgressNotification = {
      ...notification,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    this.state.notifications = [...this.state.notifications, fullNotification];
    this.notifySubscribers();

    // 自动消失
    if (fullNotification.auto_dismiss) {
      setTimeout(() => {
        this.dismissNotification(fullNotification.id);
      }, 5000);
    }

    try {
      await tauriAPI.sendNotification(fullNotification);
    } catch (error) {
      console.error('Failed to send notification to backend:', error);
    }
  }

  public async cancelUpload(taskId: string): Promise<void> {
    try {
      await tauriAPI.cancelUploadTask(taskId);
      this.state.uploadProgress.delete(taskId);
      this.notifySubscribers();

      await this.sendNotification({
        type: NotificationType.Info,
        title: 'Upload Cancelled',
        message: 'Upload has been cancelled successfully',
        dismissible: true,
        auto_dismiss: true,
      });
    } catch (error) {
      console.error('Failed to cancel upload:', error);
      await this.sendNotification({
        type: NotificationType.Error,
        title: 'Cancellation Failed',
        message: 'Failed to cancel upload',
        dismissible: true,
        auto_dismiss: false,
      });
      throw error;
    }
  }

  public async retryUpload(taskId: string, maxRetries?: number): Promise<void> {
    try {
      await tauriAPI.retryUploadTask(taskId, maxRetries);
      
      await this.sendNotification({
        type: NotificationType.Info,
        title: 'Upload Retry',
        message: 'Upload is being retried',
        dismissible: true,
        auto_dismiss: true,
      });
    } catch (error) {
      console.error('Failed to retry upload:', error);
      await this.sendNotification({
        type: NotificationType.Error,
        title: 'Retry Failed',
        message: 'Failed to retry upload',
        dismissible: true,
        auto_dismiss: false,
      });
      throw error;
    }
  }

  private cleanup(): void {
    if (this.unlistenFn) {
      this.unlistenFn();
      this.unlistenFn = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.isInitialized = false;
  }

  public getState(): ProgressMonitoringState {
    return { ...this.state };
  }
}

// Hook 接口保持不变，但使用单例实现
export function useProgressMonitoring() {
  const [state, setState] = useState<ProgressMonitoringState>({
    uploadProgress: new Map(),
    systemHealth: null,
    notifications: [],
    isMonitoring: false,
    lastUpdate: null,
  });

  const subscriberIdRef = useRef<string | undefined>(undefined);
  const monitoringInstance = useRef<ProgressMonitoringSingleton | undefined>(undefined);

  useEffect(() => {
    // 获取单例实例
    monitoringInstance.current = ProgressMonitoringSingleton.getInstance();
    subscriberIdRef.current = `subscriber-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 订阅状态更新
    const unsubscribe = monitoringInstance.current.subscribe({
      id: subscriberIdRef.current,
      onProgressUpdate: (progress) => {
        setState(prev => ({ ...prev, uploadProgress: progress }));
      },
      onHealthUpdate: (health) => {
        setState(prev => ({ ...prev, systemHealth: health }));
      },
      onNotification: (notifications) => {
        setState(prev => ({ ...prev, notifications }));
      },
    });

    // 获取初始状态
    setState(monitoringInstance.current.getState());

    return unsubscribe;
  }, []);

  const startMonitoring = useCallback(async () => {
    if (monitoringInstance.current) {
      await monitoringInstance.current.startMonitoring();
    }
  }, []);

  const stopMonitoring = useCallback(() => {
    if (monitoringInstance.current) {
      monitoringInstance.current.stopMonitoring();
    }
  }, []);

  const clearProgress = useCallback(async () => {
    if (monitoringInstance.current) {
      await monitoringInstance.current.clearProgress();
    }
  }, []);

  const dismissNotification = useCallback((id: string) => {
    if (monitoringInstance.current) {
      monitoringInstance.current.dismissNotification(id);
    }
  }, []);

  const clearAllNotifications = useCallback(() => {
    if (monitoringInstance.current) {
      monitoringInstance.current.clearAllNotifications();
    }
  }, []);

  const sendNotification = useCallback(async (notification: Omit<ProgressNotification, 'id' | 'timestamp'>) => {
    if (monitoringInstance.current) {
      await monitoringInstance.current.sendNotification(notification);
    }
  }, []);

  const cancelUpload = useCallback(async (taskId: string) => {
    if (monitoringInstance.current) {
      await monitoringInstance.current.cancelUpload(taskId);
    }
  }, []);

  const retryUpload = useCallback(async (taskId: string, maxRetries?: number) => {
    if (monitoringInstance.current) {
      await monitoringInstance.current.retryUpload(taskId, maxRetries);
    }
  }, []);

  return {
    ...state,
    startMonitoring,
    stopMonitoring,
    clearProgress,
    dismissNotification,
    clearAllNotifications,
    sendNotification,
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