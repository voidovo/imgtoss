import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import UpdatePanel from '../../components/panels/update-panel'
import { UpdaterErrorType, UpdateStage } from '../updater-api'

// Mock Sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

// Mock updater API
vi.mock('../updater-api', () => ({
  updaterAPI: {
    onProgress: vi.fn(() => vi.fn()), // 返回取消订阅函数
    checkForUpdates: vi.fn(),
    downloadAndInstall: vi.fn(),
    relaunchApp: vi.fn(),
    checkNetworkConnection: vi.fn(),
  },
  UpdateStage: {
    Idle: 'idle',
    Checking: 'checking',
    Downloading: 'downloading',
    Installing: 'installing',
    Completed: 'completed',
    Error: 'error',
  },
  UpdaterErrorType: {
    Network: 'network',
    CheckFailed: 'check_failed',
    DownloadFailed: 'download_failed',
    InstallFailed: 'install_failed',
    Permission: 'permission',
    Unknown: 'unknown',
  },
}))

describe('UpdatePanel 错误处理', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应该显示网络错误信息', async () => {
    const { updaterAPI } = await import('../updater-api')
    const mockCheckForUpdates = updaterAPI.checkForUpdates as ReturnType<typeof vi.fn>
    const mockCheckNetworkConnection = updaterAPI.checkNetworkConnection as ReturnType<typeof vi.fn>
    
    // 模拟网络检查失败
    mockCheckNetworkConnection.mockResolvedValue(false)
    
    // 模拟检查更新失败
    mockCheckForUpdates.mockRejectedValue({
      type: UpdaterErrorType.Network,
      message: '网络连接失败，请检查网络连接后重试',
      details: 'network timeout',
      recoverable: true,
    })

    render(<UpdatePanel />)

    // 等待组件加载和网络检查
    await waitFor(() => {
      expect(screen.getByText('离线')).toBeInTheDocument()
    })

    // 点击检查更新按钮
    const checkButton = screen.getByText('检查更新')
    fireEvent.click(checkButton)

    // 等待错误信息显示
    await waitFor(() => {
      expect(screen.getByText('网络连接失败，请检查网络连接后重试')).toBeInTheDocument()
    })

    // 应该显示重试按钮
    expect(screen.getByText(/重试/)).toBeInTheDocument()
  })

  it('应该显示权限错误并隐藏重试按钮', async () => {
    const { updaterAPI } = await import('../updater-api')
    const mockCheckForUpdates = updaterAPI.checkForUpdates as ReturnType<typeof vi.fn>
    const mockCheckNetworkConnection = updaterAPI.checkNetworkConnection as ReturnType<typeof vi.fn>
    
    // 模拟网络检查成功
    mockCheckNetworkConnection.mockResolvedValue(true)
    
    // 模拟权限错误
    mockCheckForUpdates.mockRejectedValue({
      type: UpdaterErrorType.Permission,
      message: '权限不足，请以管理员身份运行应用程序',
      details: 'permission denied',
      recoverable: false,
    })

    render(<UpdatePanel />)

    // 等待组件加载
    await waitFor(() => {
      expect(screen.getByText('在线')).toBeInTheDocument()
    })

    // 等待错误信息显示
    await waitFor(() => {
      expect(screen.getByText('权限不足，请以管理员身份运行应用程序')).toBeInTheDocument()
    })

    // 应该显示联系支持按钮而不是重试按钮
    expect(screen.getByText('联系支持')).toBeInTheDocument()
    expect(screen.queryByText(/重试/)).not.toBeInTheDocument()
  })

  it('应该在重试次数达到上限时禁用重试', async () => {
    const { updaterAPI } = await import('../updater-api')
    const { toast } = await import('sonner')
    const mockCheckForUpdates = updaterAPI.checkForUpdates as ReturnType<typeof vi.fn>
    const mockCheckNetworkConnection = updaterAPI.checkNetworkConnection as ReturnType<typeof vi.fn>
    
    // 模拟网络检查成功
    mockCheckNetworkConnection.mockResolvedValue(true)
    
    // 模拟检查更新失败
    mockCheckForUpdates.mockRejectedValue({
      type: UpdaterErrorType.Network,
      message: '网络连接失败，请检查网络连接后重试',
      details: 'network timeout',
      recoverable: true,
    })

    render(<UpdatePanel />)

    // 等待组件加载
    await waitFor(() => {
      expect(screen.getByText('在线')).toBeInTheDocument()
    })

    // 等待错误信息显示
    await waitFor(() => {
      expect(screen.getByText('网络连接失败，请检查网络连接后重试')).toBeInTheDocument()
    })

    // 多次点击重试按钮
    const retryButton = screen.getByText(/重试/)
    
    // 第一次重试
    fireEvent.click(retryButton)
    await waitFor(() => {
      expect(screen.getByText(/重试 \(2\/3\)/)).toBeInTheDocument()
    })

    // 第二次重试
    fireEvent.click(screen.getByText(/重试 \(2\/3\)/))
    await waitFor(() => {
      expect(screen.getByText(/重试 \(3\/3\)/)).toBeInTheDocument()
    })

    // 第三次重试
    fireEvent.click(screen.getByText(/重试 \(3\/3\)/))
    
    // 第四次尝试重试应该显示警告
    const finalRetryButton = screen.queryByText(/重试/)
    if (finalRetryButton) {
      fireEvent.click(finalRetryButton)
      expect(toast.warning).toHaveBeenCalledWith(
        '重试次数已达上限',
        expect.objectContaining({
          description: '请稍后再试或联系技术支持',
        })
      )
    }
  })

  it('应该显示详细的错误信息', async () => {
    const { updaterAPI } = await import('../updater-api')
    const mockCheckForUpdates = updaterAPI.checkForUpdates as ReturnType<typeof vi.fn>
    const mockCheckNetworkConnection = updaterAPI.checkNetworkConnection as ReturnType<typeof vi.fn>
    
    // 模拟网络检查成功
    mockCheckNetworkConnection.mockResolvedValue(true)
    
    // 模拟详细错误
    mockCheckForUpdates.mockRejectedValue({
      type: UpdaterErrorType.CheckFailed,
      message: '更新服务暂时不可用，请稍后重试',
      details: '404 Not Found',
      recoverable: true,
    })

    render(<UpdatePanel />)

    // 等待错误信息显示
    await waitFor(() => {
      expect(screen.getByText('更新服务暂时不可用，请稍后重试')).toBeInTheDocument()
      expect(screen.getByText('详细信息: 404 Not Found')).toBeInTheDocument()
      expect(screen.getByText('💡 这是一个可恢复的错误，您可以尝试重试')).toBeInTheDocument()
    })
  })

  it('应该在网络离线时阻止重试', async () => {
    const { updaterAPI } = await import('../updater-api')
    const { toast } = await import('sonner')
    const mockCheckForUpdates = updaterAPI.checkForUpdates as ReturnType<typeof vi.fn>
    const mockCheckNetworkConnection = updaterAPI.checkNetworkConnection as ReturnType<typeof vi.fn>
    
    // 初始网络检查成功
    mockCheckNetworkConnection.mockResolvedValueOnce(true)
    
    // 模拟检查更新失败
    mockCheckForUpdates.mockRejectedValue({
      type: UpdaterErrorType.Network,
      message: '网络连接失败，请检查网络连接后重试',
      details: 'network timeout',
      recoverable: true,
    })

    render(<UpdatePanel />)

    // 等待错误信息显示
    await waitFor(() => {
      expect(screen.getByText('网络连接失败，请检查网络连接后重试')).toBeInTheDocument()
    })

    // 模拟网络检查失败（用于重试时）
    mockCheckNetworkConnection.mockResolvedValue(false)

    // 点击重试按钮
    const retryButton = screen.getByText(/重试/)
    fireEvent.click(retryButton)

    // 应该显示网络不可用的 toast
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        '网络连接不可用',
        expect.objectContaining({
          description: '请检查网络连接后重试',
        })
      )
    })
  })
})