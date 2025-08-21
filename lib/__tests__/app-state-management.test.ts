// Tests for application state management
// Verifies state recovery functionality and core utilities

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveRecoveryState,
  loadRecoveryState,
  clearRecoveryState,
  recoverApplicationState,
  validateRecoveredState,
  hasRecoveryState,
  getRecoveryStateInfo,
} from '../utils/state-recovery';
import type { OSSConfig, UploadProgress, UserPreferences } from '../types';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true,
});

describe('Application State Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    clearRecoveryState();
  });

  describe('State Recovery', () => {
    const mockConfig: OSSConfig = {
      provider: 'Aliyun' as any,
      endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
      access_key_id: 'test-key',
      access_key_secret: 'test-secret',
      bucket: 'test-bucket',
      region: 'cn-hangzhou',
      path_template: 'images/{filename}',
      compression_enabled: false,
      compression_quality: 80,
    };

    const mockPreferences: UserPreferences = {
      theme: 'dark',
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

    it('should save and load recovery state', async () => {
      const uploadProgress = new Map<string, UploadProgress>();
      uploadProgress.set('test-image', {
        image_id: 'test-image',
        progress: 50,
        bytes_uploaded: 500,
        total_bytes: 1000,
      });

      const lastSyncTime = new Date();

      await saveRecoveryState(mockConfig, uploadProgress, mockPreferences, lastSyncTime);

      expect(localStorageMock.setItem).toHaveBeenCalled();

      // Mock the stored data
      const recoveryState = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        config: mockConfig,
        uploadProgress: [{ imageId: 'test-image', progress: uploadProgress.get('test-image') }],
        userPreferences: mockPreferences,
        lastSyncTime: lastSyncTime.toISOString(),
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(recoveryState));

      const loaded = await loadRecoveryState();
      expect(loaded).toBeTruthy();
      expect(loaded?.config).toEqual(mockConfig);
      expect(loaded?.userPreferences).toEqual(mockPreferences);
    });

    it('should recover application state', async () => {
      const recoveryState = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        config: mockConfig,
        uploadProgress: [{ 
          imageId: 'test-image', 
          progress: {
            image_id: 'test-image',
            progress: 75,
            bytes_uploaded: 750,
            total_bytes: 1000,
          }
        }],
        userPreferences: mockPreferences,
        lastSyncTime: new Date().toISOString(),
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(recoveryState));

      const recovered = await recoverApplicationState();
      
      expect(recovered.wasRecovered).toBe(true);
      expect(recovered.config).toEqual(mockConfig);
      expect(recovered.userPreferences).toEqual(mockPreferences);
      expect(recovered.uploadProgress.size).toBe(1);
      expect(recovered.uploadProgress.get('test-image')?.progress).toBe(75);
    });

    it('should handle invalid recovery state', async () => {
      localStorageMock.getItem.mockReturnValue('invalid json');

      const recovered = await recoverApplicationState();
      
      expect(recovered.wasRecovered).toBe(false);
      expect(recovered.config).toBe(null);
      expect(recovered.uploadProgress.size).toBe(0);
    });

    it('should clear old recovery state', async () => {
      const oldState = {
        timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
        version: '1.0.0',
        config: mockConfig,
        uploadProgress: [],
        userPreferences: mockPreferences,
        lastSyncTime: null,
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(oldState));

      const loaded = await loadRecoveryState({ maxAge: 24 * 60 * 60 * 1000 }); // 24 hours max
      expect(loaded).toBe(null);
      expect(localStorageMock.removeItem).toHaveBeenCalled();
    });
  });

  describe('Recovery State Utilities', () => {
    it('should check if recovery state exists', () => {
      expect(hasRecoveryState()).toBe(false);
      
      localStorageMock.getItem.mockReturnValue('{"test": "data"}');
      expect(hasRecoveryState()).toBe(true);
    });

    it('should get recovery state info', () => {
      const info = getRecoveryStateInfo();
      expect(info.exists).toBe(false);
      expect(info.timestamp).toBe(null);
      expect(info.age).toBe(null);

      const timestamp = new Date().toISOString();
      const recoveryState = {
        timestamp,
        version: '1.0.0',
        config: null,
        uploadProgress: [],
        userPreferences: {},
        lastSyncTime: null,
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(recoveryState));
      
      const infoWithData = getRecoveryStateInfo();
      expect(infoWithData.exists).toBe(true);
      expect(infoWithData.timestamp).toEqual(new Date(timestamp));
      expect(typeof infoWithData.age).toBe('number');
    });
  });
});