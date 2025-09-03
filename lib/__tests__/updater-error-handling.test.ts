import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UpdaterAPI, UpdaterErrorType, UpdateStage } from '../updater-api'

// Mock Tauri APIs
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}))

vi.mock('../tauri-api', () => ({
  tauriAPI: {
    getAppVersion: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

describe('UpdaterAPI 错误处理', () => {
  let updaterAPI: UpdaterAPI
  let mockProgressCallback: ReturnType<typeof vi.fn>

  beforeEach(() => {
    updaterAPI = new UpdaterAPI()
    mockProgressCallback = vi.fn()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('错误类型分析', () => {
    it('应该正确识别网络错误', async () => {
      const { tauriAPI } = await import('../tauri-api')
      const mockGetAppVersion = tauriAPI.getAppVersion as ReturnType<typeof vi.fn>
      
      // 模拟网络超时错误
      mockGetAppVersion.mockRejectedValue(new Error('network timeout'))

      try {
        await updaterAPI.getCurrentVersion()
      } catch (error: any) {
        expect(error.type).toBe(UpdaterErrorType.Network)
        expect(error.message).toContain('网络连接超时')
        expect(error.recoverable).toBe(true)
      }
    })

    it('应该正确识别权限错误', async () => {
      const { tauriAPI } = await import('../tauri-api')
      const mockGetAppVersion = tauriAPI.getAppVersion as ReturnType<typeof vi.fn>
      
      // 模拟权限错误
      mockGetAppVersion.mockRejectedValue(new Error('permission denied'))

      try {
        await updaterAPI.getCurrentVersion()
      } catch (error: any) {
        expect(error.type).toBe(UpdaterErrorType.Permission)
        expect(error.message).toContain('权限不足')
        expect(error.recoverable).toBe(false)
      }
    })

    it('应该正确识别下载错误', async () => {
      const { check } = await import('@tauri-apps/plugin-updater')
      const mockCheck = check as ReturnType<typeof vi.fn>
      
      // 模拟检查更新成功，但下载失败
      const mockUpdate = {
        version: '1.1.0',
        date: '2024-01-01',
        body: 'Test update',
        downloadAndInstall: vi.fn().mockRejectedValue(new Error('download failed: disk space'))
      }
      mockCheck.mockResolvedValue(mockUpdate)

      const { tauriAPI } = await import('../tauri-api')
      const mockGetAppVersion = tauriAPI.getAppVersion as ReturnType<typeof vi.fn>
      mockGetAppVersion.mockResolvedValue('1.0.0')

      // 先检查更新
      await updaterAPI.checkForUpdates()

      try {
        await updaterAPI.downloadAndInstall()
      } catch (error: any) {
        expect(error.type).toBe(UpdaterErrorType.DownloadFailed)
        expect(error.message).toContain('磁盘空间不足')
        expect(error.recoverable).toBe(true)
      }
    })
  })

  describe('进度监听和错误通知', () => {
    it('应该在错误时通知进度监听器', async () => {
      const unsubscribe = updaterAPI.onProgress(mockProgressCallback)

      const { tauriAPI } = await import('../tauri-api')
      const mockGetAppVersion = tauriAPI.getAppVersion as ReturnType<typeof vi.fn>
      mockGetAppVersion.mockRejectedValue(new Error('test error'))

      try {
        await updaterAPI.getCurrentVersion()
      } catch (error) {
        // 错误应该被抛出
      }

      // 应该没有调用进度回调，因为 getCurrentVersion 不涉及进度
      expect(mockProgressCallback).not.toHaveBeenCalled()

      unsubscribe()
    })

    it('应该在检查更新失败时通知进度', async () => {
      const unsubscribe = updaterAPI.onProgress(mockProgressCallback)

      const { check } = await import('@tauri-apps/plugin-updater')
      const mockCheck = check as ReturnType<typeof vi.fn>
      mockCheck.mockRejectedValue(new Error('check failed'))

      const { tauriAPI } = await import('../tauri-api')
      const mockGetAppVersion = tauriAPI.getAppVersion as ReturnType<typeof vi.fn>
      mockGetAppVersion.mockResolvedValue('1.0.0')

      try {
        await updaterAPI.checkForUpdates()
      } catch (error) {
        // 错误应该被抛出
      }

      // 应该调用进度回调
      expect(mockProgressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: UpdateStage.Checking,
          progress: 0,
          message: '正在检查更新...'
        })
      )

      expect(mockProgressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: UpdateStage.Error,
          progress: 0,
          message: '检查更新失败',
          error: 'check failed'
        })
      )

      unsubscribe()
    })
  })

  describe('Toast 通知', () => {
    it('应该在成功时显示成功 toast', async () => {
      const { toast } = await import('sonner')

      const { check } = await import('@tauri-apps/plugin-updater')
      const mockCheck = check as ReturnType<typeof vi.fn>
      mockCheck.mockResolvedValue(null) // 没有更新

      const { tauriAPI } = await import('../tauri-api')
      const mockGetAppVersion = tauriAPI.getAppVersion as ReturnType<typeof vi.fn>
      mockGetAppVersion.mockResolvedValue('1.0.0')

      await updaterAPI.checkForUpdates()

      expect(toast.info).toHaveBeenCalledWith(
        '已是最新版本',
        expect.objectContaining({
          description: '您正在使用最新版本的应用',
          duration: 3000,
        })
      )
    })

    it('应该在错误时显示错误 toast', async () => {
      const { toast } = await import('sonner')

      const { check } = await import('@tauri-apps/plugin-updater')
      const mockCheck = check as ReturnType<typeof vi.fn>
      mockCheck.mockRejectedValue(new Error('network error'))

      const { tauriAPI } = await import('../tauri-api')
      const mockGetAppVersion = tauriAPI.getAppVersion as ReturnType<typeof vi.fn>
      mockGetAppVersion.mockResolvedValue('1.0.0')

      try {
        await updaterAPI.checkForUpdates()
      } catch (error) {
        // 错误应该被抛出
      }

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('网络连接失败'),
        expect.objectContaining({
          description: '您可以稍后重试',
          duration: 5000,
        })
      )
    })
  })

  describe('网络连接检查', () => {
    it('应该能够检查网络连接状态', async () => {
      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      })

      const isOnline = await updaterAPI.checkNetworkConnection()
      expect(isOnline).toBe(true)
    })

    it('应该在网络不可用时返回 false', async () => {
      // Mock fetch 失败
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const isOnline = await updaterAPI.checkNetworkConnection()
      expect(isOnline).toBe(false)
    })
  })

  describe('智能重试机制', () => {
    it('应该在可恢复错误时重试', async () => {
      let attemptCount = 0
      const mockOperation = vi.fn().mockImplementation(() => {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error('network timeout')
        }
        return Promise.resolve('success')
      })

      // Mock 网络检查为成功
      global.fetch = vi.fn().mockResolvedValue({ ok: true })

      const result = await updaterAPI.smartRetry(mockOperation, 3, 100)
      
      expect(result).toBe('success')
      expect(mockOperation).toHaveBeenCalledTimes(3)
    })

    it('应该在不可恢复错误时立即停止', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('permission denied'))

      try {
        await updaterAPI.smartRetry(mockOperation, 3, 100)
      } catch (error: any) {
        expect(error.message).toContain('permission')
      }

      expect(mockOperation).toHaveBeenCalledTimes(1)
    })
  })
})