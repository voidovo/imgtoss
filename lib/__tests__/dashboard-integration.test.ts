// Dashboard Integration Tests
// Tests for dashboard component integration with Tauri backend services

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tauriAPI } from '../tauri-api';
import type { HistoryStatistics, HistoryRecord, OSSConfig, OSSProvider } from '../types';

// Mock Tauri API
vi.mock('../tauri-api', () => ({
  tauriAPI: {
    getHistoryStatistics: vi.fn(),
    getUploadHistory: vi.fn(),
    loadOSSConfig: vi.fn(),
  },
}));

describe('Dashboard Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Statistics Loading', () => {
    it('should load history statistics successfully', async () => {
      const mockStats: HistoryStatistics = {
        total_operations: 25,
        successful_operations: 23,
        failed_operations: 2,
        total_files_processed: 45,
        total_images_uploaded: 67,
        total_size_uploaded: 1024 * 1024 * 15, // 15MB
        average_operation_duration: 2500,
        operations_by_type: {
          upload: 15,
          replace: 10,
        },
        operations_by_date: {
          '2024-01-20': 5,
          '2024-01-21': 8,
          '2024-01-22': 12,
        },
      };

      vi.mocked(tauriAPI.getHistoryStatistics).mockResolvedValue(mockStats);

      const result = await tauriAPI.getHistoryStatistics();

      expect(result).toEqual(mockStats);
      expect(result.total_operations).toBe(25);
      expect(result.successful_operations).toBe(23);
      expect(result.total_images_uploaded).toBe(67);
      expect(result.total_size_uploaded).toBe(1024 * 1024 * 15);
    });
  });

  describe('Data Formatting Utilities', () => {
    it('should format file sizes correctly', () => {
      const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
      };

      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1024 * 1024 * 1.5)).toBe('1.5 MB');
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });
  });
});