import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HistoryRecord, PaginatedResult, HistoryStatistics } from '../types';

// Mock Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { historyOperations } from '../tauri-api';
import { invoke } from '@tauri-apps/api/core';

const mockInvoke = vi.mocked(invoke);

describe('History Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUploadHistory', () => {
    it('should fetch paginated history records', async () => {
      const mockResponse: PaginatedResult<HistoryRecord> = {
        items: [
          {
            id: '1',
            timestamp: '2024-01-15T10:30:00Z',
            operation: 'upload',
            files: ['test.jpg'],
            image_count: 1,
            success: true,
            backup_path: undefined,
            duration: 1000,
            total_size: 2048,
            error_message: undefined,
            metadata: {},
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
        has_more: false,
      };

      mockInvoke.mockResolvedValue(mockResponse);

      const result = await historyOperations.getUploadHistory(1, 20);

      expect(mockInvoke).toHaveBeenCalledWith('get_upload_history', {
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle default pagination parameters', async () => {
      const mockResponse: PaginatedResult<HistoryRecord> = {
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
        has_more: false,
      };

      mockInvoke.mockResolvedValue(mockResponse);

      await historyOperations.getUploadHistory();

      expect(mockInvoke).toHaveBeenCalledWith('get_upload_history', {
        page: undefined,
        pageSize: undefined,
      });
    });
  });

  describe('searchHistory', () => {
    it('should search history with all parameters', async () => {
      const mockResponse: PaginatedResult<HistoryRecord> = {
        items: [
          {
            id: '1',
            timestamp: '2024-01-15T10:30:00Z',
            operation: 'upload',
            files: ['search-test.jpg'],
            image_count: 1,
            success: true,
            backup_path: undefined,
            duration: 1000,
            total_size: 2048,
            error_message: undefined,
            metadata: {},
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
        has_more: false,
      };

      mockInvoke.mockResolvedValue(mockResponse);

      const result = await historyOperations.searchHistory(
        'test',
        'upload',
        true,
        '2024-01-01T00:00:00Z',
        '2024-01-31T23:59:59Z',
        1,
        20
      );

      expect(mockInvoke).toHaveBeenCalledWith('search_history', {
        searchTerm: 'test',
        operationType: 'upload',
        successOnly: true,
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z',
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should search history with minimal parameters', async () => {
      const mockResponse: PaginatedResult<HistoryRecord> = {
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
        has_more: false,
      };

      mockInvoke.mockResolvedValue(mockResponse);

      await historyOperations.searchHistory('test');

      expect(mockInvoke).toHaveBeenCalledWith('search_history', {
        searchTerm: 'test',
        operationType: undefined,
        successOnly: undefined,
        startDate: undefined,
        endDate: undefined,
        page: undefined,
        pageSize: undefined,
      });
    });
  });

  describe('clearHistory', () => {
    it('should clear all history records', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await historyOperations.clearHistory();

      expect(mockInvoke).toHaveBeenCalledWith('clear_history');
    });
  });

  describe('exportHistory', () => {
    it('should export history as JSON string', async () => {
      const mockExportData = JSON.stringify({
        records: [],
        backups: [],
        operations: [],
        export_date: '2024-01-15T10:30:00Z',
        version: '1.0',
      });

      mockInvoke.mockResolvedValue(mockExportData);

      const result = await historyOperations.exportHistory();

      expect(mockInvoke).toHaveBeenCalledWith('export_history');
      expect(result).toBe(mockExportData);
    });
  });

  describe('addHistoryRecord', () => {
    it('should add a new history record', async () => {
      const mockId = 'new-record-id';
      mockInvoke.mockResolvedValue(mockId);

      const result = await historyOperations.addHistoryRecord(
        'upload',
        ['test.jpg'],
        1,
        true,
        '/backup/path',
        1000,
        2048,
        undefined
      );

      expect(mockInvoke).toHaveBeenCalledWith('add_history_record', {
        operation: 'upload',
        files: ['test.jpg'],
        imageCount: 1,
        success: true,
        backupPath: '/backup/path',
        duration: 1000,
        totalSize: 2048,
        errorMessage: undefined,
      });
      expect(result).toBe(mockId);
    });

    it('should add a history record with error', async () => {
      const mockId = 'error-record-id';
      mockInvoke.mockResolvedValue(mockId);

      await historyOperations.addHistoryRecord(
        'upload',
        ['failed.jpg'],
        0,
        false,
        undefined,
        undefined,
        undefined,
        'Upload failed: Network error'
      );

      expect(mockInvoke).toHaveBeenCalledWith('add_history_record', {
        operation: 'upload',
        files: ['failed.jpg'],
        imageCount: 0,
        success: false,
        backupPath: undefined,
        duration: undefined,
        totalSize: undefined,
        errorMessage: 'Upload failed: Network error',
      });
    });
  });

  describe('getHistoryStatistics', () => {
    it('should fetch history statistics', async () => {
      const mockStats: HistoryStatistics = {
        total_operations: 10,
        successful_operations: 8,
        failed_operations: 2,
        total_files_processed: 15,
        total_images_uploaded: 12,
        total_size_uploaded: 10485760, // 10MB
        average_operation_duration: 1500,
        operations_by_type: {
          upload: 8,
          replace: 2,
        },
        operations_by_date: {
          '2024-01-15': 5,
          '2024-01-14': 3,
          '2024-01-13': 2,
        },
      };

      mockInvoke.mockResolvedValue(mockStats);

      const result = await historyOperations.getHistoryStatistics();

      expect(mockInvoke).toHaveBeenCalledWith('get_history_statistics');
      expect(result).toEqual(mockStats);
    });
  });

  describe('Error Handling', () => {
    it('should handle Tauri command errors', async () => {
      const errorMessage = 'Failed to load history';
      mockInvoke.mockRejectedValue(new Error(errorMessage));

      await expect(historyOperations.getUploadHistory()).rejects.toThrow(errorMessage);
    });

    it('should handle search errors', async () => {
      const errorMessage = 'Invalid search parameters';
      mockInvoke.mockRejectedValue(new Error(errorMessage));

      await expect(
        historyOperations.searchHistory('test', 'invalid-operation')
      ).rejects.toThrow(errorMessage);
    });

    it('should handle export errors', async () => {
      const errorMessage = 'No history data to export';
      mockInvoke.mockRejectedValue(new Error(errorMessage));

      await expect(historyOperations.exportHistory()).rejects.toThrow(errorMessage);
    });
  });

  describe('Data Validation', () => {
    it('should handle empty history results', async () => {
      const emptyResponse: PaginatedResult<HistoryRecord> = {
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
        has_more: false,
      };

      mockInvoke.mockResolvedValue(emptyResponse);

      const result = await historyOperations.getUploadHistory();
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle large pagination results', async () => {
      const largeResponse: PaginatedResult<HistoryRecord> = {
        items: Array.from({ length: 100 }, (_, i) => ({
          id: `record-${i}`,
          timestamp: '2024-01-15T10:30:00Z',
          operation: 'upload',
          files: [`file-${i}.jpg`],
          image_count: 1,
          success: true,
          backup_path: undefined,
          duration: 1000,
          total_size: 2048,
          error_message: undefined,
          metadata: {},
        })),
        total: 1000,
        page: 1,
        page_size: 100,
        has_more: true,
      };

      mockInvoke.mockResolvedValue(largeResponse);

      const result = await historyOperations.getUploadHistory(1, 100);
      expect(result.items).toHaveLength(100);
      expect(result.has_more).toBe(true);
    });
  });

  describe('File Export Integration', () => {
    it('should handle file download in browser environment', async () => {
      // Mock DOM APIs
      const mockCreateElement = vi.fn();
      const mockAppendChild = vi.fn();
      const mockRemoveChild = vi.fn();
      const mockClick = vi.fn();
      const mockCreateObjectURL = vi.fn();
      const mockRevokeObjectURL = vi.fn();

      const mockLink = {
        href: '',
        download: '',
        click: mockClick,
      };

      mockCreateElement.mockReturnValue(mockLink);
      mockCreateObjectURL.mockReturnValue('blob:mock-url');

      // Mock global objects
      Object.defineProperty(global, 'document', {
        value: {
          createElement: mockCreateElement,
          body: {
            appendChild: mockAppendChild,
            removeChild: mockRemoveChild,
          },
        },
        writable: true,
      });

      Object.defineProperty(global, 'URL', {
        value: {
          createObjectURL: mockCreateObjectURL,
          revokeObjectURL: mockRevokeObjectURL,
        },
        writable: true,
      });

      Object.defineProperty(global, 'Blob', {
        value: class MockBlob {
          constructor(public content: any[], public options: any) {}
        },
        writable: true,
      });

      const mockHistoryData = '{"records": [], "version": "1.0"}';
      mockInvoke.mockResolvedValue(mockHistoryData);

      await historyOperations.exportHistoryToFile();

      expect(mockInvoke).toHaveBeenCalledWith('export_history');
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockAppendChild).toHaveBeenCalledWith(mockLink);
      expect(mockClick).toHaveBeenCalled();
      expect(mockRemoveChild).toHaveBeenCalledWith(mockLink);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
      expect(mockLink.download).toMatch(/^history-export-\d{4}-\d{2}-\d{2}\.json$/);
    });
  });
});