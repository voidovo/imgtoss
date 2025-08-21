// Test file for Tauri API integration
// This file tests the type safety and error handling of the Tauri API client

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { TauriAPI, tauriAPI } from '../tauri-api';
import { parseTauriError, TauriError, withErrorHandling, withRetry } from '../error-handler';
import { ErrorType, OSSProvider, ScanStatus, UploadStatus } from '../types';

// Mock the Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe('TauriAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('File Operations', () => {
    it('should scan markdown files with correct parameters', async () => {
      const mockResult = [
        {
          file_path: '/test/file.md',
          images: [],
          status: ScanStatus.Success,
        },
      ];
      
      mockInvoke.mockResolvedValue(mockResult);
      
      const result = await tauriAPI.scanMarkdownFiles(['/test/file.md']);
      
      expect(mockInvoke).toHaveBeenCalledWith('scan_markdown_files', {
        filePaths: ['/test/file.md'],
      });
      expect(result).toEqual(mockResult);
    });

    it('should get image info with correct parameters', async () => {
      const mockImageInfo = {
        width: 1920,
        height: 1080,
        format: 'PNG',
        size: 1024000,
        color_space: 'RGB',
      };
      
      mockInvoke.mockResolvedValue(mockImageInfo);
      
      const result = await tauriAPI.getImageInfo('/test/image.png');
      
      expect(mockInvoke).toHaveBeenCalledWith('get_image_info', {
        imagePath: '/test/image.png',
      });
      expect(result).toEqual(mockImageInfo);
    });
  });

  describe('Upload Operations', () => {
    it('should upload images with correct parameters', async () => {
      const mockConfig = {
        provider: OSSProvider.Aliyun,
        endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
        access_key_id: 'test_key',
        access_key_secret: 'test_secret',
        bucket: 'test-bucket',
        region: 'cn-hangzhou',
        path_template: 'images/{filename}',
        compression_enabled: true,
        compression_quality: 80,
      };
      
      const mockResult = [
        {
          image_id: 'test-id',
          success: true,
          uploaded_url: 'https://example.com/image.png',
        },
      ];
      
      mockInvoke.mockResolvedValue(mockResult);
      
      const result = await tauriAPI.uploadImages(['test-id'], mockConfig);
      
      expect(mockInvoke).toHaveBeenCalledWith('upload_images', {
        imagePaths: ['test-id'],
        config: mockConfig,
      });
      expect(result).toEqual(mockResult);
    });

    it('should get upload progress with correct parameters', async () => {
      const mockProgress = {
        image_id: 'test-id',
        progress: 0.5,
        bytes_uploaded: 512000,
        total_bytes: 1024000,
        speed: 1000000,
      };
      
      mockInvoke.mockResolvedValue(mockProgress);
      
      const result = await tauriAPI.getUploadProgress('test-task-id');
      
      expect(mockInvoke).toHaveBeenCalledWith('get_upload_progress', {
        taskId: 'test-task-id',
      });
      expect(result).toEqual(mockProgress);
    });
  });

  describe('Configuration Operations', () => {
    it('should save OSS config with correct parameters', async () => {
      const mockConfig = {
        provider: OSSProvider.AWS,
        endpoint: 'https://s3.amazonaws.com',
        access_key_id: 'test_key',
        access_key_secret: 'test_secret',
        bucket: 'test-bucket',
        region: 'us-east-1',
        path_template: 'uploads/{filename}',
        compression_enabled: false,
        compression_quality: 90,
      };
      
      mockInvoke.mockResolvedValue(undefined);
      
      await tauriAPI.saveOSSConfig(mockConfig);
      
      expect(mockInvoke).toHaveBeenCalledWith('save_oss_config', {
        config: mockConfig,
      });
    });

    it('should test OSS connection with correct parameters', async () => {
      const mockConfig = {
        provider: OSSProvider.Tencent,
        endpoint: 'https://cos.ap-beijing.myqcloud.com',
        access_key_id: 'test_key',
        access_key_secret: 'test_secret',
        bucket: 'test-bucket',
        region: 'ap-beijing',
        path_template: 'files/{filename}',
        compression_enabled: true,
        compression_quality: 75,
      };
      
      const mockResult = {
        success: true,
        latency: 150,
      };
      
      mockInvoke.mockResolvedValue(mockResult);
      
      const result = await tauriAPI.testOSSConnection(mockConfig);
      
      expect(mockInvoke).toHaveBeenCalledWith('test_oss_connection', {
        config: mockConfig,
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('History Operations', () => {
    it('should get upload history with pagination', async () => {
      const mockResult = {
        items: [
          {
            id: 'history-1',
            timestamp: '2023-01-01T00:00:00Z',
            operation: 'upload',
            files: ['/test/file.md'],
            image_count: 1,
            success: true,
            metadata: {},
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
        has_more: false,
      };
      
      mockInvoke.mockResolvedValue(mockResult);
      
      const result = await tauriAPI.getUploadHistory(1, 20);
      
      expect(mockInvoke).toHaveBeenCalledWith('get_upload_history', {
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual(mockResult);
    });
  });
});

describe('Error Handling', () => {
  describe('parseTauriError', () => {
    it('should parse string validation errors correctly', () => {
      const error = parseTauriError('File path cannot be empty');
      
      expect(error).toBeInstanceOf(TauriError);
      expect(error.type).toBe(ErrorType.VALIDATION);
      expect(error.message).toBe('File path cannot be empty');
      expect(error.recoverable).toBe(true);
    });

    it('should parse string network errors correctly', () => {
      const error = parseTauriError('Connection timeout');
      
      expect(error).toBeInstanceOf(TauriError);
      expect(error.type).toBe(ErrorType.NETWORK);
      expect(error.message).toBe('Connection timeout');
      expect(error.recoverable).toBe(true);
    });

    it('should parse string file system errors correctly', () => {
      const error = parseTauriError('File not found: /test/file.md');
      
      expect(error).toBeInstanceOf(TauriError);
      expect(error.type).toBe(ErrorType.FILE_SYSTEM);
      expect(error.message).toBe('File not found: /test/file.md');
      expect(error.recoverable).toBe(true);
    });

    it('should parse string security errors correctly', () => {
      const error = parseTauriError('Rate limit exceeded');
      
      expect(error).toBeInstanceOf(TauriError);
      expect(error.type).toBe(ErrorType.SECURITY);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.recoverable).toBe(false);
    });

    it('should handle Error objects', () => {
      const originalError = new Error('Test error');
      const error = parseTauriError(originalError);
      
      expect(error).toBeInstanceOf(TauriError);
      expect(error.type).toBe(ErrorType.SERVICE);
      expect(error.message).toBe('Test error');
      expect(error.recoverable).toBe(true);
    });

    it('should handle structured error objects', () => {
      const errorObj = {
        type: ErrorType.VALIDATION,
        message: 'Invalid configuration',
        details: 'Missing required field',
        code: 'VALIDATION_001',
        recoverable: true,
      };
      
      const error = parseTauriError(errorObj);
      
      expect(error).toBeInstanceOf(TauriError);
      expect(error.type).toBe(ErrorType.VALIDATION);
      expect(error.message).toBe('Invalid configuration');
      expect(error.details).toBe('Missing required field');
      expect(error.code).toBe('VALIDATION_001');
      expect(error.recoverable).toBe(true);
    });
  });

  describe('withErrorHandling', () => {
    it('should execute successful operations normally', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await withErrorHandling(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should wrap errors with context', async () => {
      const operation = vi.fn().mockRejectedValue('Test error');
      
      await expect(withErrorHandling(operation, 'Test context')).rejects.toThrow(
        'Test context: Test error'
      );
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await withRetry(operation, 3, 100);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should retry recoverable errors', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce('Network timeout')
        .mockResolvedValue('success');
      
      const result = await withRetry(operation, 3, 10);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-recoverable errors', async () => {
      const operation = vi.fn().mockRejectedValue('Rate limit exceeded');
      
      await expect(withRetry(operation, 3, 10)).rejects.toThrow('Rate limit exceeded');
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should fail after max retries', async () => {
      const operation = vi.fn().mockRejectedValue('Network timeout');
      
      await expect(withRetry(operation, 2, 10)).rejects.toThrow('Network timeout');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });
});

describe('Type Safety', () => {
  it('should enforce correct parameter types', () => {
    // This test ensures TypeScript compilation catches type errors
    const api = new TauriAPI();
    
    // These should compile without errors
    expect(() => {
      api.scanMarkdownFiles(['file1.md', 'file2.md']);
      api.getImageInfo('/path/to/image.png');
      api.generateThumbnail('/path/to/image.png', 256);
    }).not.toThrow();
  });

  it('should provide correct return types', async () => {
    mockInvoke.mockResolvedValue([]);
    
    const result = await tauriAPI.scanMarkdownFiles(['test.md']);
    
    // TypeScript should infer this as ScanResult[]
    expect(Array.isArray(result)).toBe(true);
  });
});