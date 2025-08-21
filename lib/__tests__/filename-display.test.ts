// Filename Display Component Tests
// Tests for filename truncation and display utilities

import { describe, it, expect } from 'vitest';
import { truncateFilename, extractFilename } from '@/components/ui/filename-display';

describe('Filename Display Utilities', () => {
  describe('truncateFilename', () => {
    it('should return filename as-is if shorter than maxLength', () => {
      const filename = 'short.txt';
      const result = truncateFilename(filename, 20);
      expect(result).toBe('short.txt');
    });

    it('should truncate filename while preserving extension', () => {
      const filename = 'very-long-filename-that-needs-truncation.txt';
      const result = truncateFilename(filename, 20);
      expect(result).toBe('very-long-fil....txt');
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should handle files without extension', () => {
      const filename = 'very-long-filename-without-extension';
      const result = truncateFilename(filename, 20);
      expect(result).toBe('very-long-filenam...');
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should handle very long extensions', () => {
      const filename = 'file.verylongextension';
      const result = truncateFilename(filename, 15);
      expect(result).toBe('file.verylon...');
      expect(result.length).toBeLessThanOrEqual(15);
    });

    it('should handle edge case where extension is too long', () => {
      const filename = 'file.extensionthatistoolongforthegivenspace';
      const result = truncateFilename(filename, 10);
      expect(result).toBe('file.ex...');
      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  describe('extractFilename', () => {
    it('should extract filename from Unix path', () => {
      const path = '/home/user/documents/file.txt';
      const result = extractFilename(path);
      expect(result).toBe('file.txt');
    });

    it('should extract filename from Windows path', () => {
      const path = 'C:\\Users\\User\\Documents\\file.txt';
      const result = extractFilename(path);
      expect(result).toBe('file.txt');
    });

    it('should handle mixed path separators', () => {
      const path = '/home/user\\documents/file.txt';
      const result = extractFilename(path);
      expect(result).toBe('file.txt');
    });

    it('should return the input if no path separators found', () => {
      const filename = 'file.txt';
      const result = extractFilename(filename);
      expect(result).toBe('file.txt');
    });

    it('should handle empty string', () => {
      const path = '';
      const result = extractFilename(path);
      expect(result).toBe('');
    });

    it('should handle path ending with separator', () => {
      const path = '/home/user/documents/';
      const result = extractFilename(path);
      expect(result).toBe('/home/user/documents/');
    });
  });
});