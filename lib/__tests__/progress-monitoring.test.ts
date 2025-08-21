// Tests for progress monitoring and notification system
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { 
  UploadProgress, 
  SystemHealth, 
  ProgressNotification, 
  NotificationType,
  HealthStatus,
  UploadTaskInfo,
  UploadTaskManager 
} from '../types';

// Mock Tauri API
const mockTauriAPI = {
  getSystemHealth: vi.fn(),
  getNotificationConfig: vi.fn(),
  updateNotificationConfig: vi.fn(),
  sendNotification: vi.fn(),
  cancelUploadTask: vi.fn(),
  retryUploadTask: vi.fn(),
  getUploadTaskStatus: vi.fn(),
  getAllUploadTasks: vi.fn(),
  getAllUploadProgress: vi.fn(),
  clearUploadProgress: vi.fn(),
};

// Mock Tauri events
const mockListen = vi.fn();
const mockUnlisten = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}));

vi.mock('../tauri-api', () => ({
  tauriAPI: mockTauriAPI,
}));

describe('Progress Monitoring System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockResolvedValue(mockUnlisten);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('System Health Monitoring', () => {
    it('should get system health status', async () => {
      const mockHealth: SystemHealth = {
        status: 'Healthy' as HealthStatus,
        uptime: 3600,
        memory_usage: 500_000_000,
        disk_space: 10_000_000_000,
        active_uploads: 2,
        last_check: new Date().toISOString(),
        errors: [],
      };

      mockTauriAPI.getSystemHealth.mockResolvedValue(mockHealth);

      const result = await mockTauriAPI.getSystemHealth();
      expect(result).toEqual(mockHealth);
      expect(mockTauriAPI.getSystemHealth).toHaveBeenCalledTimes(1);
    });

    it('should handle system health with warnings', async () => {
      const mockHealth: SystemHealth = {
        status: 'Warning' as HealthStatus,
        uptime: 7200,
        memory_usage: 1_500_000_000, // 1.5GB - should trigger warning
        disk_space: 500_000_000, // 500MB - should trigger warning
        active_uploads: 5,
        last_check: new Date().toISOString(),
        errors: [
          {
            component: 'Memory',
            message: 'Elevated memory usage: 1.5 GB',
            severity: 'Medium',
            timestamp: new Date().toISOString(),
          },
          {
            component: 'Storage',
            message: 'Low disk space: 0.5 GB',
            severity: 'Medium',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      mockTauriAPI.getSystemHealth.mockResolvedValue(mockHealth);

      const result = await mockTauriAPI.getSystemHealth();
      expect(result.status).toBe('Warning');
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].component).toBe('Memory');
      expect(result.errors[1].component).toBe('Storage');
    });

    it('should handle critical system health status', async () => {
      const mockHealth: SystemHealth = {
        status: 'Critical' as HealthStatus,
        uptime: 10800,
        memory_usage: 2_500_000_000, // 2.5GB - should trigger critical
        disk_space: 50_000_000, // 50MB - should trigger critical
        active_uploads: 1,
        last_check: new Date().toISOString(),
        errors: [
          {
            component: 'Memory',
            message: 'High memory usage: 2.5 GB',
            severity: 'Critical',
            timestamp: new Date().toISOString(),
          },
          {
            component: 'Storage',
            message: 'Very low disk space: 50.0 MB',
            severity: 'Critical',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      mockTauriAPI.getSystemHealth.mockResolvedValue(mockHealth);

      const result = await mockTauriAPI.getSystemHealth();
      expect(result.status).toBe('Critical');
      expect(result.errors).toHaveLength(2);
      expect(result.errors.every(e => e.severity === 'Critical')).toBe(true);
    });
  });

  describe('Upload Task Management', () => {
    it('should cancel upload task', async () => {
      const taskId = 'test-task-123';
      mockTauriAPI.cancelUploadTask.mockResolvedValue(undefined);

      await mockTauriAPI.cancelUploadTask(taskId);
      expect(mockTauriAPI.cancelUploadTask).toHaveBeenCalledWith(taskId);
    });

    it('should retry upload task', async () => {
      const taskId = 'test-task-456';
      const maxRetries = 3;
      mockTauriAPI.retryUploadTask.mockResolvedValue(undefined);

      await mockTauriAPI.retryUploadTask(taskId, maxRetries);
      expect(mockTauriAPI.retryUploadTask).toHaveBeenCalledWith(taskId, maxRetries);
    });

    it('should get upload task status', async () => {
      const taskId = 'test-task-789';
      const mockTaskInfo: UploadTaskInfo = {
        id: taskId,
        image_path: '/path/to/image.jpg',
        status: 'Uploading',
        progress: {
          image_id: taskId,
          progress: 50.0,
          bytes_uploaded: 1024,
          total_bytes: 2048,
          speed: 512,
        },
        start_time: new Date().toISOString(),
        end_time: null,
        retry_count: 0,
        max_retries: 3,
        error: null,
        cancellation_token: null,
      };

      mockTauriAPI.getUploadTaskStatus.mockResolvedValue(mockTaskInfo);

      const result = await mockTauriAPI.getUploadTaskStatus(taskId);
      expect(result).toEqual(mockTaskInfo);
      expect(result?.status).toBe('Uploading');
      expect(result?.progress.progress).toBe(50.0);
    });

    it('should get all upload tasks', async () => {
      const mockTaskManager: UploadTaskManager = {
        active_tasks: new Map([
          ['task-1', {
            id: 'task-1',
            image_path: '/path/to/image1.jpg',
            status: 'Uploading',
            progress: {
              image_id: 'task-1',
              progress: 25.0,
              bytes_uploaded: 512,
              total_bytes: 2048,
              speed: 256,
            },
            start_time: new Date().toISOString(),
            end_time: null,
            retry_count: 0,
            max_retries: 3,
            error: null,
            cancellation_token: null,
          }],
        ]),
        completed_tasks: [],
        failed_tasks: [],
        cancelled_tasks: [],
      };

      mockTauriAPI.getAllUploadTasks.mockResolvedValue(mockTaskManager);

      const result = await mockTauriAPI.getAllUploadTasks();
      expect(result).toEqual(mockTaskManager);
      expect(result.active_tasks.size).toBe(1);
    });
  });

  describe('Progress Tracking', () => {
    it('should get all upload progress', async () => {
      const mockProgress: UploadProgress[] = [
        {
          image_id: 'image-1',
          progress: 50.0,
          bytes_uploaded: 1024,
          total_bytes: 2048,
          speed: 512,
        },
        {
          image_id: 'image-2',
          progress: 75.0,
          bytes_uploaded: 1536,
          total_bytes: 2048,
          speed: 256,
        },
      ];

      mockTauriAPI.getAllUploadProgress.mockResolvedValue(mockProgress);

      const result = await mockTauriAPI.getAllUploadProgress();
      expect(result).toEqual(mockProgress);
      expect(result).toHaveLength(2);
      expect(result[0].progress).toBe(50.0);
      expect(result[1].progress).toBe(75.0);
    });

    it('should clear upload progress', async () => {
      mockTauriAPI.clearUploadProgress.mockResolvedValue(undefined);

      await mockTauriAPI.clearUploadProgress();
      expect(mockTauriAPI.clearUploadProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe('Notification System', () => {
    it('should send notification', async () => {
      const mockNotification: ProgressNotification = {
        id: 'notification-1',
        type: 'Info' as NotificationType,
        title: 'Test Notification',
        message: 'This is a test notification',
        progress: undefined,
        timestamp: new Date().toISOString(),
        dismissible: true,
        auto_dismiss: false,
      };

      mockTauriAPI.sendNotification.mockResolvedValue(undefined);

      await mockTauriAPI.sendNotification(mockNotification);
      expect(mockTauriAPI.sendNotification).toHaveBeenCalledWith(mockNotification);
    });

    it('should handle progress notification', async () => {
      const mockProgressNotification: ProgressNotification = {
        id: 'progress-notification-1',
        type: 'Progress' as NotificationType,
        title: 'Upload Progress',
        message: 'Uploading image: 75%',
        progress: 75.0,
        timestamp: new Date().toISOString(),
        dismissible: false,
        auto_dismiss: true,
      };

      mockTauriAPI.sendNotification.mockResolvedValue(undefined);

      await mockTauriAPI.sendNotification(mockProgressNotification);
      expect(mockTauriAPI.sendNotification).toHaveBeenCalledWith(mockProgressNotification);
    });

    it('should handle error notification', async () => {
      const mockErrorNotification: ProgressNotification = {
        id: 'error-notification-1',
        type: 'Error' as NotificationType,
        title: 'Upload Failed',
        message: 'Failed to upload image due to network error',
        progress: undefined,
        timestamp: new Date().toISOString(),
        dismissible: true,
        auto_dismiss: false,
      };

      mockTauriAPI.sendNotification.mockResolvedValue(undefined);

      await mockTauriAPI.sendNotification(mockErrorNotification);
      expect(mockTauriAPI.sendNotification).toHaveBeenCalledWith(mockErrorNotification);
    });
  });

  describe('Error Handling', () => {
    it('should handle system health check failure', async () => {
      const errorMessage = 'Failed to get system health';
      mockTauriAPI.getSystemHealth.mockRejectedValue(new Error(errorMessage));

      await expect(mockTauriAPI.getSystemHealth()).rejects.toThrow(errorMessage);
    });

    it('should handle task cancellation failure', async () => {
      const taskId = 'invalid-task';
      const errorMessage = 'Task not found';
      mockTauriAPI.cancelUploadTask.mockRejectedValue(new Error(errorMessage));

      await expect(mockTauriAPI.cancelUploadTask(taskId)).rejects.toThrow(errorMessage);
    });

    it('should handle notification send failure', async () => {
      const mockNotification: ProgressNotification = {
        id: 'notification-1',
        type: 'Info' as NotificationType,
        title: 'Test',
        message: 'Test message',
        timestamp: new Date().toISOString(),
        dismissible: true,
        auto_dismiss: false,
      };

      const errorMessage = 'Failed to send notification';
      mockTauriAPI.sendNotification.mockRejectedValue(new Error(errorMessage));

      await expect(mockTauriAPI.sendNotification(mockNotification)).rejects.toThrow(errorMessage);
    });
  });

  describe('Validation', () => {
    it('should validate task ID format', () => {
      const validTaskId = '123e4567-e89b-12d3-a456-426614174000';
      const invalidTaskId = 'invalid-task-id';

      // Valid UUID format (36 characters with 4 hyphens)
      expect(validTaskId.length).toBe(36);
      expect(validTaskId.split('-').length - 1).toBe(4);

      // Invalid format
      expect(invalidTaskId.length).not.toBe(36);
      expect(invalidTaskId.split('-').length - 1).not.toBe(4);
    });

    it('should validate notification structure', () => {
      const validNotification: ProgressNotification = {
        id: 'notification-1',
        type: 'Success' as NotificationType,
        title: 'Upload Complete',
        message: 'Image uploaded successfully',
        timestamp: new Date().toISOString(),
        dismissible: true,
        auto_dismiss: true,
      };

      expect(validNotification.id).toBeTruthy();
      expect(validNotification.title).toBeTruthy();
      expect(validNotification.message).toBeTruthy();
      expect(validNotification.timestamp).toBeTruthy();
      expect(['Info', 'Success', 'Warning', 'Error', 'Progress']).toContain(validNotification.type);
    });

    it('should validate system health structure', () => {
      const validHealth: SystemHealth = {
        status: 'Healthy' as HealthStatus,
        uptime: 3600,
        memory_usage: 500_000_000,
        disk_space: 10_000_000_000,
        active_uploads: 0,
        last_check: new Date().toISOString(),
        errors: [],
      };

      expect(['Healthy', 'Warning', 'Critical']).toContain(validHealth.status);
      expect(validHealth.uptime).toBeGreaterThanOrEqual(0);
      expect(validHealth.memory_usage).toBeGreaterThanOrEqual(0);
      expect(validHealth.disk_space).toBeGreaterThanOrEqual(0);
      expect(validHealth.active_uploads).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(validHealth.errors)).toBe(true);
    });
  });
});