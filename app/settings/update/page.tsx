"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
  RotateCcw,
  Zap
} from "lucide-react"
import { updaterAPI, UpdateInfo, UpdateProgress, UpdateStage, UpdaterError, UpdaterErrorType } from "@/lib/updater-api"
import { toast } from "sonner"

interface UpdatePanelState {
  updateInfo: UpdateInfo | null
  updateProgress: UpdateProgress | null
  isCheckingUpdate: boolean
  isUpdating: boolean
  error: UpdaterError | null
  lastCheckTime: Date | null
  retryCount: number
  maxRetries: number
  networkStatus: 'checking' | 'online' | 'offline' | 'unknown'
}

export default function UpdateSettingsPage() {
  const [state, setState] = useState<UpdatePanelState>({
    updateInfo: null,
    updateProgress: null,
    isCheckingUpdate: false,
    isUpdating: false,
    error: null,
    lastCheckTime: null,
    retryCount: 0,
    maxRetries: 3,
    networkStatus: 'unknown',
  })

  // 进度监听器回调
  const handleProgressUpdate = useCallback((progress: UpdateProgress) => {
    setState(prev => ({
      ...prev,
      updateProgress: progress,
      isUpdating: progress.stage === UpdateStage.Downloading || progress.stage === UpdateStage.Installing,
      error: progress.error ? {
        type: UpdaterErrorType.Unknown,
        message: progress.error,
        recoverable: true
      } : null,
    }))
  }, [])

  // 组件挂载时设置进度监听器
  useEffect(() => {
    const unsubscribe = updaterAPI.onProgress(handleProgressUpdate)

    // 检查网络状态
    checkNetworkStatus().then((isOnline) => {
      if (isOnline) {
        // 自动检查更新
        handleCheckUpdate()
      } else {
        toast.warning('网络连接不可用', {
          description: '请检查网络连接后手动检查更新',
          duration: 5000,
        })
      }
    })

    return unsubscribe
  }, [handleProgressUpdate])

  // 检查更新
  const handleCheckUpdate = async (isRetry: boolean = false) => {
    try {
      setState(prev => ({
        ...prev,
        isCheckingUpdate: true,
        error: null,
        updateProgress: null,
        retryCount: isRetry ? prev.retryCount + 1 : 0
      }))

      const updateInfo = await updaterAPI.checkForUpdates()

      setState(prev => ({
        ...prev,
        updateInfo,
        isCheckingUpdate: false,
        lastCheckTime: new Date(),
        retryCount: 0, // 成功后重置重试计数
      }))
    } catch (error) {
      const updaterError = error as UpdaterError
      setState(prev => ({
        ...prev,
        error: updaterError,
        isCheckingUpdate: false,
        lastCheckTime: new Date(),
      }))

      // 如果是可恢复的错误且未达到最大重试次数，可以考虑自动重试
      if (updaterError.recoverable && state.retryCount < state.maxRetries && !isRetry) {
        // 不自动重试，让用户手动重试以保持控制权
        console.log('检查更新失败，用户可以手动重试')
      }
    }
  }

  // 开始更新
  const handleStartUpdate = async (isRetry: boolean = false) => {
    try {
      setState(prev => ({
        ...prev,
        isUpdating: true,
        error: null,
        retryCount: isRetry ? prev.retryCount + 1 : 0
      }))

      await updaterAPI.downloadAndInstall()

      // 更新完成后，重置重试计数
      setState(prev => ({
        ...prev,
        retryCount: 0,
      }))

      // 更新完成后，可以选择重启应用
      // 这里我们不自动重启，让用户决定
    } catch (error) {
      const updaterError = error as UpdaterError
      setState(prev => ({
        ...prev,
        error: updaterError,
        isUpdating: false,
      }))
    }
  }

  // 重启应用
  const handleRelaunchApp = async () => {
    try {
      await updaterAPI.relaunchApp()
    } catch (error) {
      const updaterError = error as UpdaterError
      setState(prev => ({
        ...prev,
        error: updaterError,
      }))
    }
  }

  // 检查网络状态
  const checkNetworkStatus = async () => {
    setState(prev => ({ ...prev, networkStatus: 'checking' }))

    try {
      const isOnline = await updaterAPI.checkNetworkConnection()
      setState(prev => ({
        ...prev,
        networkStatus: isOnline ? 'online' : 'offline'
      }))
      return isOnline
    } catch (error) {
      setState(prev => ({ ...prev, networkStatus: 'offline' }))
      return false
    }
  }

  // 重试操作
  const handleRetry = async () => {
    if (state.retryCount >= state.maxRetries) {
      toast.warning('重试次数已达上限', {
        description: '请稍后再试或联系技术支持',
        duration: 5000,
      })
      return
    }

    // 先检查网络状态
    const isOnline = await checkNetworkStatus()
    if (!isOnline) {
      toast.error('网络连接不可用', {
        description: '请检查网络连接后重试',
        duration: 5000,
      })
      return
    }

    if (state.updateProgress?.stage === UpdateStage.Error) {
      // 如果是更新过程中出错，重试更新
      toast.info('正在重试更新...', {
        description: `第 ${state.retryCount + 1} 次重试`,
        duration: 3000,
      })
      handleStartUpdate(true)
    } else {
      // 如果是检查更新出错，重试检查
      toast.info('正在重试检查更新...', {
        description: `第 ${state.retryCount + 1} 次重试`,
        duration: 3000,
      })
      handleCheckUpdate(true)
    }
  }

  // 获取更新状态显示文本
  const getUpdateStatusText = () => {
    if (state.isCheckingUpdate) {
      return "正在检查更新..."
    }

    if (!state.updateInfo) {
      return "未知"
    }

    if (state.updateInfo.available) {
      return `发现新版本 ${state.updateInfo.version}`
    }

    return "已是最新版本"
  }

  // 获取更新状态徽章
  const getUpdateStatusBadge = () => {
    if (state.isCheckingUpdate) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          检查中
        </Badge>
      )
    }

    if (!state.updateInfo) {
      return null
    }

    if (state.updateInfo.available) {
      return (
        <Badge className="bg-blue-500 text-white hover:bg-blue-600 border-transparent flex items-center gap-1">
          <Zap className="h-3 w-3" />
          有更新
        </Badge>
      )
    }

    return (
      <Badge className="bg-green-500 text-white hover:bg-green-600 border-transparent flex items-center gap-1">
        <CheckCircle className="h-3 w-3" />
        最新版本
      </Badge>
    )
  }

  // 获取进度条显示文本
  const getProgressText = () => {
    if (!state.updateProgress) return ""

    switch (state.updateProgress.stage) {
      case UpdateStage.Checking:
        return "正在检查更新..."
      case UpdateStage.Downloading:
        if (state.updateProgress.bytesDownloaded && state.updateProgress.totalBytes) {
          const downloadedMB = (state.updateProgress.bytesDownloaded / 1024 / 1024).toFixed(1)
          const totalMB = (state.updateProgress.totalBytes / 1024 / 1024).toFixed(1)
          return `下载中... ${downloadedMB} MB / ${totalMB} MB (${state.updateProgress.progress.toFixed(0)}%)`
        } else if (state.updateProgress.bytesDownloaded) {
          const downloadedMB = (state.updateProgress.bytesDownloaded / 1024 / 1024).toFixed(1)
          return `下载中... ${downloadedMB} MB (${state.updateProgress.progress.toFixed(0)}%)`
        } else {
          return `下载中... ${state.updateProgress.progress.toFixed(0)}%`
        }
      case UpdateStage.Installing:
        return `安装中... ${state.updateProgress.progress.toFixed(0)}%`
      case UpdateStage.Completed:
        return "更新完成 (100%)"
      case UpdateStage.Error:
        return "更新失败"
      default:
        return state.updateProgress.message || `进行中... ${state.updateProgress.progress.toFixed(0)}%`
    }
  }

  // 判断是否可以开始更新
  const canStartUpdate = () => {
    return (
      state.updateInfo?.available &&
      !state.isCheckingUpdate &&
      !state.isUpdating &&
      state.updateProgress?.stage !== UpdateStage.Completed
    )
  }

  // 判断是否显示重启按钮
  const shouldShowRelaunchButton = () => {
    return state.updateProgress?.stage === UpdateStage.Completed
  }

  // 判断是否显示重试按钮
  const shouldShowRetryButton = () => {
    return (
      state.error &&
      state.error.recoverable &&
      state.retryCount < state.maxRetries &&
      (state.updateProgress?.stage === UpdateStage.Error || !state.updateProgress) &&
      !state.isCheckingUpdate &&
      !state.isUpdating
    )
  }

  return (
    <div className="space-y-6">
      {/* 版本信息卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                应用更新
                {getUpdateStatusBadge()}
              </CardTitle>
              <CardDescription>
                管理应用版本和更新
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCheckUpdate}
              disabled={state.isCheckingUpdate || state.isUpdating}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${state.isCheckingUpdate ? 'animate-spin' : ''}`} />
              检查更新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 版本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">当前版本</div>
              <div className="text-lg font-semibold">
                {state.updateInfo?.currentVersion || "获取中..."}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">最新版本</div>
              <div className="text-lg font-semibold">
                {state.updateInfo?.available
                  ? state.updateInfo.version
                  : state.updateInfo?.currentVersion || "获取中..."
                }
              </div>
            </div>
          </div>

          {/* 更新状态 */}
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-2">状态</div>
            <div className="text-sm">{getUpdateStatusText()}</div>
          </div>

          {/* 最后检查时间 */}
          {state.lastCheckTime && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">最后检查</div>
              <div className="text-sm text-muted-foreground">
                {state.lastCheckTime.toLocaleString('zh-CN')}
              </div>
            </div>
          )}

          {/* 网络状态 */}
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">网络状态</div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${state.networkStatus === 'online' ? 'bg-green-500' :
                  state.networkStatus === 'offline' ? 'bg-red-500' :
                    state.networkStatus === 'checking' ? 'bg-yellow-500 animate-pulse' :
                      'bg-gray-400'
                }`} />
              <span className="text-sm">
                {state.networkStatus === 'online' ? '在线' :
                  state.networkStatus === 'offline' ? '离线' :
                    state.networkStatus === 'checking' ? '检查中...' :
                      '未知'}
              </span>
              {state.networkStatus === 'offline' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={checkNetworkStatus}
                  className="h-6 px-2 text-xs"
                >
                  重新检查
                </Button>
              )}
            </div>
          </div>

          {/* 更新说明 */}
          {state.updateInfo?.available && state.updateInfo.body && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">更新说明</div>
              <div className="text-sm bg-muted p-3 rounded-md max-h-32 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-xs">{state.updateInfo.body}</pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 更新进度卡片 */}
      {(state.updateProgress || state.isUpdating) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              更新进度
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 更新阶段指示器 */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-4">
                <div className={`flex items-center space-x-2 ${state.updateProgress?.stage === UpdateStage.Checking ? 'text-blue-600 font-medium' : 'text-muted-foreground'
                  }`}>
                  <div className={`w-2 h-2 rounded-full ${state.updateProgress?.stage === UpdateStage.Checking ? 'bg-blue-600' : 'bg-muted-foreground/30'
                    }`} />
                  <span>检查</span>
                </div>
                <div className={`flex items-center space-x-2 ${state.updateProgress?.stage === UpdateStage.Downloading ? 'text-blue-600 font-medium' :
                    [UpdateStage.Installing, UpdateStage.Completed].includes(state.updateProgress?.stage as UpdateStage) ? 'text-green-600' : 'text-muted-foreground'
                  }`}>
                  <div className={`w-2 h-2 rounded-full ${state.updateProgress?.stage === UpdateStage.Downloading ? 'bg-blue-600' :
                      [UpdateStage.Installing, UpdateStage.Completed].includes(state.updateProgress?.stage as UpdateStage) ? 'bg-green-600' : 'bg-muted-foreground/30'
                    }`} />
                  <span>下载</span>
                </div>
                <div className={`flex items-center space-x-2 ${state.updateProgress?.stage === UpdateStage.Installing ? 'text-orange-600 font-medium' :
                    state.updateProgress?.stage === UpdateStage.Completed ? 'text-green-600' : 'text-muted-foreground'
                  }`}>
                  <div className={`w-2 h-2 rounded-full ${state.updateProgress?.stage === UpdateStage.Installing ? 'bg-orange-600' :
                      state.updateProgress?.stage === UpdateStage.Completed ? 'bg-green-600' : 'bg-muted-foreground/30'
                    }`} />
                  <span>安装</span>
                </div>
                <div className={`flex items-center space-x-2 ${state.updateProgress?.stage === UpdateStage.Completed ? 'text-green-600 font-medium' : 'text-muted-foreground'
                  }`}>
                  <div className={`w-2 h-2 rounded-full ${state.updateProgress?.stage === UpdateStage.Completed ? 'bg-green-600' : 'bg-muted-foreground/30'
                    }`} />
                  <span>完成</span>
                </div>
              </div>
            </div>

            {/* 进度条 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{getProgressText()}</span>
                <span>{state.updateProgress?.progress.toFixed(0)}%</span>
              </div>
              <Progress
                value={state.updateProgress?.progress || 0}
                className={`h-3 ${state.updateProgress?.stage === UpdateStage.Error
                    ? '[&>div]:bg-destructive'
                    : state.updateProgress?.stage === UpdateStage.Completed
                      ? '[&>div]:bg-green-500'
                      : state.updateProgress?.stage === UpdateStage.Installing
                        ? '[&>div]:bg-orange-500'
                        : '[&>div]:bg-blue-500'
                  }`}
              />
            </div>

            {/* 详细信息 */}
            {state.updateProgress && (
              <div className="space-y-2">
                {/* 下载信息 */}
                {state.updateProgress.bytesDownloaded && (
                  <div className="text-sm text-muted-foreground">
                    已下载: {(state.updateProgress.bytesDownloaded / 1024 / 1024).toFixed(2)} MB
                    {state.updateProgress.totalBytes && (
                      <> / {(state.updateProgress.totalBytes / 1024 / 1024).toFixed(2)} MB</>
                    )}
                  </div>
                )}

                {/* 下载速度 */}
                {state.updateProgress.downloadSpeed && state.updateProgress.stage === UpdateStage.Downloading && (
                  <div className="text-sm text-muted-foreground">
                    下载速度: {(state.updateProgress.downloadSpeed / 1024).toFixed(0)} KB/s
                  </div>
                )}

                {/* 当前阶段描述 */}
                {state.updateProgress.message && state.updateProgress.message !== getProgressText() && (
                  <div className="text-sm text-muted-foreground">
                    {state.updateProgress.message}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 错误信息 */}
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <div className="font-medium">{state.error.message}</div>
              {state.error.details && (
                <div className="text-sm text-muted-foreground">
                  详细信息: {state.error.details}
                </div>
              )}
              {state.retryCount > 0 && (
                <div className="text-sm text-muted-foreground">
                  已重试 {state.retryCount} 次 (最多 {state.maxRetries} 次)
                </div>
              )}
              {state.error.recoverable && (
                <div className="text-sm text-blue-600">
                  💡 这是一个可恢复的错误，您可以尝试重试
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        {/* 开始更新按钮 */}
        {canStartUpdate() && (
          <Button
            onClick={() => handleStartUpdate()}
            disabled={state.isUpdating}
            className="flex items-center gap-2"
          >
            {state.isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            立即更新
          </Button>
        )}

        {/* 重启应用按钮 */}
        {shouldShowRelaunchButton() && (
          <Button
            onClick={handleRelaunchApp}
            className="flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            重启应用
          </Button>
        )}

        {/* 重试按钮 */}
        {shouldShowRetryButton() && (
          <Button
            variant="outline"
            onClick={handleRetry}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            重试 ({state.retryCount + 1}/{state.maxRetries})
          </Button>
        )}

        {/* 联系支持按钮 */}
        {state.error && !state.error.recoverable && (
          <Button
            variant="outline"
            onClick={() => {
              toast.info('请联系技术支持', {
                description: '您可以通过应用内的帮助页面或官方网站联系我们',
                duration: 5000,
              })
            }}
            className="flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4" />
            联系支持
          </Button>
        )}
      </div>

      {/* 提示信息 */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          • 更新过程中请不要关闭应用程序
          <br />
          • 更新完成后需要重启应用以使更改生效
          <br />
          • 如果更新失败，您可以尝试重新检查更新或手动下载最新版本
        </AlertDescription>
      </Alert>
    </div>
  )
}