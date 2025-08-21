import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OSSConfig, OSSProvider } from '../types'

// Mock Tauri invoke function
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

// Import after mocking
const { configOperations } = await import('../tauri-api')

describe('Storage Configuration Integration', () => {
  beforeEach(() => {
    mockInvoke.mockClear()
  })

  const testConfig: OSSConfig = {
    provider: OSSProvider.Aliyun,
    endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
    access_key_id: 'test_access_key',
    access_key_secret: 'test_secret_key',
    bucket: 'test-bucket',
    region: 'cn-hangzhou',
    path_template: 'images/{date}/{filename}',
    cdn_domain: 'https://cdn.example.com',
    compression_enabled: true,
    compression_quality: 80,
  }

  describe('Configuration Operations', () => {
    it('should save OSS configuration', async () => {
      mockInvoke.mockResolvedValue(undefined)

      await configOperations.saveOSSConfig(testConfig)

      expect(mockInvoke).toHaveBeenCalledWith('save_oss_config', {
        config: testConfig
      })
    })

    it('should load OSS configuration', async () => {
      mockInvoke.mockResolvedValue(testConfig)

      const result = await configOperations.loadOSSConfig()

      expect(mockInvoke).toHaveBeenCalledWith('load_oss_config')
      expect(result).toEqual(testConfig)
    })

    it('should test OSS connection', async () => {
      const connectionTest = {
        success: true,
        error: null,
        latency: 150
      }
      mockInvoke.mockResolvedValue(connectionTest)

      const result = await configOperations.testOSSConnection(testConfig)

      expect(mockInvoke).toHaveBeenCalledWith('test_oss_connection', {
        config: testConfig
      })
      expect(result).toEqual(connectionTest)
    })

    it('should validate OSS configuration', async () => {
      const validation = {
        valid: true,
        errors: [],
        connection_test: {
          success: true,
          error: null,
          latency: 120
        }
      }
      mockInvoke.mockResolvedValue(validation)

      const result = await configOperations.validateOSSConfig(testConfig)

      expect(mockInvoke).toHaveBeenCalledWith('validate_oss_config', {
        config: testConfig
      })
      expect(result).toEqual(validation)
    })

    it('should export OSS configuration', async () => {
      const exportData = JSON.stringify({
        version: '1.0',
        export_date: '2024-01-01T00:00:00Z',
        config: testConfig
      }, null, 2)
      mockInvoke.mockResolvedValue(exportData)

      const result = await configOperations.exportOSSConfig()

      expect(mockInvoke).toHaveBeenCalledWith('export_oss_config')
      expect(result).toEqual(exportData)
    })

    it('should import OSS configuration', async () => {
      const configJson = JSON.stringify({
        version: '1.0',
        export_date: '2024-01-01T00:00:00Z',
        config: testConfig
      })
      mockInvoke.mockResolvedValue(undefined)

      await configOperations.importOSSConfig(configJson)

      expect(mockInvoke).toHaveBeenCalledWith('import_oss_config', {
        configJson
      })
    })

    it('should list OSS objects', async () => {
      const objects = [
        {
          key: 'images/test.jpg',
          size: 1024,
          last_modified: '2024-01-01T00:00:00Z',
          etag: 'abc123',
          url: 'https://example.com/images/test.jpg'
        }
      ]
      mockInvoke.mockResolvedValue(objects)

      const result = await configOperations.listOSSObjects(testConfig, 'images/')

      expect(mockInvoke).toHaveBeenCalledWith('list_oss_objects', {
        config: testConfig,
        prefix: 'images/'
      })
      expect(result).toEqual(objects)
    })
  })

  describe('Error Handling', () => {
    it('should handle save configuration errors', async () => {
      const errorMessage = 'Invalid configuration: Endpoint is required'
      mockInvoke.mockRejectedValue(errorMessage)

      await expect(configOperations.saveOSSConfig(testConfig))
        .rejects.toEqual(errorMessage)
    })

    it('should handle connection test errors', async () => {
      const connectionTest = {
        success: false,
        error: 'Connection timeout',
        latency: 5000
      }
      mockInvoke.mockResolvedValue(connectionTest)

      const result = await configOperations.testOSSConnection(testConfig)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection timeout')
    })

    it('should handle validation errors', async () => {
      const validation = {
        valid: false,
        errors: ['Endpoint is required', 'Access key cannot be empty'],
        connection_test: null
      }
      mockInvoke.mockResolvedValue(validation)

      const result = await configOperations.validateOSSConfig(testConfig)

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(2)
    })
  })

  describe('Configuration Workflow', () => {
    it('should complete full configuration workflow', async () => {
      // 1. Load existing config (none found)
      mockInvoke.mockResolvedValueOnce(null)
      
      // 2. Validate new config
      mockInvoke.mockResolvedValueOnce({
        valid: true,
        errors: [],
        connection_test: { success: true, error: null, latency: 100 }
      })
      
      // 3. Save config
      mockInvoke.mockResolvedValueOnce(undefined)
      
      // 4. Test connection
      mockInvoke.mockResolvedValueOnce({
        success: true,
        error: null,
        latency: 120
      })

      // Execute workflow
      const existingConfig = await configOperations.loadOSSConfig()
      expect(existingConfig).toBeNull()

      const validation = await configOperations.validateOSSConfig(testConfig)
      expect(validation.valid).toBe(true)

      await configOperations.saveOSSConfig(testConfig)

      const connectionTest = await configOperations.testOSSConnection(testConfig)
      expect(connectionTest.success).toBe(true)

      expect(mockInvoke).toHaveBeenCalledTimes(4)
    })
  })
})