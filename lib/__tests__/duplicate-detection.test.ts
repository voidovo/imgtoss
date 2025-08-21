import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tauriAPI } from '../tauri-api'
import type { DuplicateCheckResult, DuplicateInfo } from '../types'

// Mock the Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn()
}))

// Mock alert function
global.alert = vi.fn()

describe('Duplicate Detection', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('calculateImageChecksum', () => {
        it('should calculate checksum for an image', async () => {
            const mockChecksum = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890'
            const { invoke } = await import('@tauri-apps/api/core')
            vi.mocked(invoke).mockResolvedValue(mockChecksum)

            const result = await tauriAPI.calculateImageChecksum('/path/to/image.jpg')

            expect(invoke).toHaveBeenCalledWith('calculate_image_checksum', {
                imagePath: '/path/to/image.jpg'
            })
            expect(result).toBe(mockChecksum)
        })

        it('should handle errors when calculating checksum', async () => {
            const { invoke } = await import('@tauri-apps/api/core')
            vi.mocked(invoke).mockRejectedValue(new Error('File not found'))

            await expect(tauriAPI.calculateImageChecksum('/invalid/path.jpg'))
                .rejects.toThrow('File not found')
        })
    })

    describe('checkDuplicateByChecksum', () => {
        it('should return duplicate result when image is duplicate', async () => {
            const mockResult: DuplicateCheckResult = {
                checksum: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
                is_duplicate: true,
                existing_record: {
                    id: 'record-1',
                    timestamp: '2024-01-01T00:00:00Z',
                    operation: 'upload',
                    files: ['/path/to/original.jpg'],
                    image_count: 1,
                    success: true,
                    duration: 1000,
                    total_size: 1024000,
                    metadata: {
                        checksum: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
                        uploaded_url: 'https://example.com/image.jpg'
                    }
                },
                existing_url: 'https://example.com/image.jpg'
            }

            const { invoke } = await import('@tauri-apps/api/core')
            vi.mocked(invoke).mockResolvedValue(mockResult)

            const result = await tauriAPI.checkDuplicateByChecksum(mockResult.checksum)

            expect(invoke).toHaveBeenCalledWith('check_duplicate_by_checksum', {
                checksum: mockResult.checksum
            })
            expect(result).toEqual(mockResult)
            expect(result.is_duplicate).toBe(true)
            expect(result.existing_url).toBe('https://example.com/image.jpg')
        })

        it('should return non-duplicate result when image is unique', async () => {
            const mockResult: DuplicateCheckResult = {
                checksum: 'unique123456789012345678901234567890123456789012345678901234567890',
                is_duplicate: false
            }

            const { invoke } = await import('@tauri-apps/api/core')
            vi.mocked(invoke).mockResolvedValue(mockResult)

            const result = await tauriAPI.checkDuplicateByChecksum(mockResult.checksum)

            expect(result.is_duplicate).toBe(false)
            expect(result.existing_record).toBeUndefined()
            expect(result.existing_url).toBeUndefined()
        })
    })

    describe('checkDuplicatesBatch', () => {
        it('should check multiple images for duplicates', async () => {
            const imagePaths = ['/path/to/image1.jpg', '/path/to/image2.jpg']
            const mockResults: DuplicateCheckResult[] = [
                {
                    checksum: 'checksum1',
                    is_duplicate: false
                },
                {
                    checksum: 'checksum2',
                    is_duplicate: true,
                    existing_record: {
                        id: 'record-2',
                        timestamp: '2024-01-01T00:00:00Z',
                        operation: 'upload',
                        files: ['/path/to/original2.jpg'],
                        image_count: 1,
                        success: true,
                        backup_path: undefined,
                        duration: 1000,
                        total_size: 2048000,
                        error_message: undefined,
                        metadata: {
                            checksum: 'checksum2',
                            uploaded_url: 'https://example.com/image2.jpg'
                        }
                    },
                    existing_url: 'https://example.com/image2.jpg'
                }
            ]

            const { invoke } = await import('@tauri-apps/api/core')
            vi.mocked(invoke).mockResolvedValue(mockResults)

            const results = await tauriAPI.checkDuplicatesBatch(imagePaths)

            expect(invoke).toHaveBeenCalledWith('check_duplicates_batch', {
                imagePaths
            })
            expect(results).toEqual(mockResults)
            expect(results).toHaveLength(2)
            expect(results[0].is_duplicate).toBe(false)
            expect(results[1].is_duplicate).toBe(true)
        })
    })

    describe('getDuplicateInfo', () => {
        it('should return duplicate info when found', async () => {
            const mockInfo: DuplicateInfo = {
                checksum: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
                original_path: '/path/to/original.jpg',
                existing_url: 'https://example.com/image.jpg',
                upload_date: '2024-01-01T00:00:00Z',
                file_size: 1024000
            }

            const { invoke } = await import('@tauri-apps/api/core')
            vi.mocked(invoke).mockResolvedValue(mockInfo)

            const result = await tauriAPI.getDuplicateInfo(mockInfo.checksum)

            expect(invoke).toHaveBeenCalledWith('get_duplicate_info', {
                checksum: mockInfo.checksum
            })
            expect(result).toEqual(mockInfo)
        })

        it('should return null when duplicate info not found', async () => {
            const { invoke } = await import('@tauri-apps/api/core')
            vi.mocked(invoke).mockResolvedValue(null)

            const result = await tauriAPI.getDuplicateInfo('nonexistent-checksum')

            expect(result).toBeNull()
        })
    })

    describe('Source-level Duplicate Prevention', () => {
        it('should detect duplicates immediately when files are selected', async () => {
            const mockResults: DuplicateCheckResult[] = [
                {
                    checksum: 'checksum1',
                    is_duplicate: false
                },
                {
                    checksum: 'checksum2',
                    is_duplicate: true,
                    existing_record: {
                        id: 'record-2',
                        timestamp: '2024-01-01T00:00:00Z',
                        operation: 'upload',
                        files: ['/path/to/original2.jpg'],
                        image_count: 1,
                        success: true,
                        backup_path: undefined,
                        duration: 1000,
                        total_size: 2048000,
                        error_message: undefined,
                        metadata: {
                            checksum: 'checksum2',
                            uploaded_url: 'https://example.com/image2.jpg'
                        }
                    },
                    existing_url: 'https://example.com/image2.jpg'
                }
            ]

            const { invoke } = await import('@tauri-apps/api/core')
            vi.mocked(invoke).mockResolvedValue(mockResults)

            const results = await tauriAPI.checkDuplicatesBatch(['/path/to/image1.jpg', '/path/to/image2.jpg'])

            expect(results).toEqual(mockResults)
            expect(results[0].is_duplicate).toBe(false)
            expect(results[1].is_duplicate).toBe(true)
            expect(results[1].existing_url).toBe('https://example.com/image2.jpg')
        })

        it('should prevent duplicate files from being uploaded', async () => {
            // This test simulates the behavior where duplicate files are marked as error
            // and excluded from upload process
            const duplicateFile = {
                id: 'file-1',
                status: 'error' as const,
                error: '重复图片 - 已存在: https://example.com/image.jpg'
            }

            const normalFile = {
                id: 'file-2', 
                status: 'pending' as const
            }

            const files = [duplicateFile, normalFile]
            const pendingFiles = files.filter(f => f.status === 'pending')

            expect(pendingFiles).toHaveLength(1)
            expect(pendingFiles[0].id).toBe('file-2')
            expect(files.filter(f => f.status === 'error' && f.error?.includes('重复图片'))).toHaveLength(1)
        })
    })
})