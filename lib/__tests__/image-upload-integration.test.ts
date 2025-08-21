/**
 * Integration tests for image upload functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { OSSConfig, UploadResult } from '../types'

// Mock the entire tauri-api module for testing
vi.mock('../tauri-api', () => ({
  tauriAPI: {
    uploadImages: vi.fn(),
    uploadImagesBatch: vi.fn(),
    getUploadProgress: vi.fn(),
    getAllUploadProgress: vi.fn(),
    cancelUpload: vi.fn(),
    retryUpload: vi.fn(),
    clearUploadProgress: vi.fn(),
  }
}))

import { tauriAPI } from '../tauri-api'

describe('Image Upload Integration', () => {
  const mockConfig: OSSConfig = {
    provider: 'Aliyun',
    endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
    access_key_id: 'test-key',
    access_key_secret: 'test-secret',
    bucket: 'test-bucket',
    region: 'cn-hangzhou',
    path_template: 'images/{timestamp}_{filename}',
    cdn_domain: undefined,
    compression_enabled: false,
    compression_quality: 85,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should upload single image successfully', async () => {
    const mockResult: UploadResult[] = [
      {
        image_id: 'test-id-1',
        success: true,
        uploaded_url: 'https://cdn.example.com/images/test.jpg',
        error: undefined,
      }
    ]

    vi.mocked(tauriAPI.uploadImages).mockResolvedValue(mockResult)

    const result = await tauriAPI.uploadImages(['/path/to/test.jpg'], mockConfig)

    expect(tauriAPI.uploadImages).toHaveBeenCalledWith(['/path/to/test.jpg'], mockConfig)
    expect(result).toEqual(mockResult)
  })

  it('should upload multiple images in batch', async () => {
    const mockResult: UploadResult[] = [
      {
        image_id: 'test-id-1',
        success: true,
        uploaded_url: 'https://cdn.example.com/images/test1.jpg',
        error: undefined,
      },
      {
        image_id: 'test-id-2',
        success: true,
        uploaded_url: 'https://cdn.example.com/images/test2.jpg',
        error: undefined,
      }
    ]

    vi.mocked(tauriAPI.uploadImagesBatch).mockResolvedValue(mockResult)

    const result = await tauriAPI.uploadImagesBatch(
      ['/path/to/test1.jpg', '/path/to/test2.jpg'],
      mockConfig,
      2
    )

    expect(tauriAPI.uploadImagesBatch).toHaveBeenCalledWith(
      ['/path/to/test1.jpg', '/path/to/test2.jpg'],
      mockConfig,
      2
    )
    expect(result).toEqual(mockResult)
  })

  it('should handle upload errors gracefully', async () => {
    const mockResult: UploadResult[] = [
      {
        image_id: 'test-id-1',
        success: false,
        uploaded_url: undefined,
        error: 'File not found',
      }
    ]

    vi.mocked(tauriAPI.uploadImages).mockResolvedValue(mockResult)

    const result = await tauriAPI.uploadImages(['/path/to/nonexistent.jpg'], mockConfig)

    expect(result[0].success).toBe(false)
    expect(result[0].error).toBe('File not found')
  })

  it('should get upload progress', async () => {
    const mockProgress = {
      image_id: 'test-id-1',
      progress: 50.0,
      bytes_uploaded: 1024,
      total_bytes: 2048,
      speed: 512,
    }

    vi.mocked(tauriAPI.getUploadProgress).mockResolvedValue(mockProgress)

    const result = await tauriAPI.getUploadProgress('test-task-id')

    expect(tauriAPI.getUploadProgress).toHaveBeenCalledWith('test-task-id')
    expect(result).toEqual(mockProgress)
  })

  it('should get all upload progress', async () => {
    const mockProgressList = [
      {
        image_id: 'test-id-1',
        progress: 50.0,
        bytes_uploaded: 1024,
        total_bytes: 2048,
        speed: 512,
      },
      {
        image_id: 'test-id-2',
        progress: 75.0,
        bytes_uploaded: 1536,
        total_bytes: 2048,
        speed: 256,
      }
    ]

    vi.mocked(tauriAPI.getAllUploadProgress).mockResolvedValue(mockProgressList)

    const result = await tauriAPI.getAllUploadProgress()

    expect(tauriAPI.getAllUploadProgress).toHaveBeenCalled()
    expect(result).toEqual(mockProgressList)
  })

  it('should cancel upload', async () => {
    vi.mocked(tauriAPI.cancelUpload).mockResolvedValue(undefined)

    await tauriAPI.cancelUpload('test-task-id')

    expect(tauriAPI.cancelUpload).toHaveBeenCalledWith('test-task-id')
  })

  it('should retry upload', async () => {
    vi.mocked(tauriAPI.retryUpload).mockResolvedValue(undefined)

    await tauriAPI.retryUpload('test-task-id')

    expect(tauriAPI.retryUpload).toHaveBeenCalledWith('test-task-id')
  })

  it('should clear upload progress', async () => {
    vi.mocked(tauriAPI.clearUploadProgress).mockResolvedValue(undefined)

    await tauriAPI.clearUploadProgress()

    expect(tauriAPI.clearUploadProgress).toHaveBeenCalled()
  })
})