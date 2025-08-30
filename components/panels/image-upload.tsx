"use client"

import type React from "react"
import { memo } from "react"

import { useState, useCallback, useRef, useEffect } from "react"
import { Upload, X, ImageIcon, CheckCircle, AlertCircle, Trash2, Eye, Copy, RefreshCw, Image, Calendar, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { convertFileSrc } from '@tauri-apps/api/core'
import { tauriAPI, historyOperations, configOperations } from "@/lib/tauri-api"
import type { OSSConfig, UploadResult, UploadProgress, HistoryRecord } from "@/lib/types"
import { OSSProvider, UploadMode } from "@/lib/types"
import { NotificationType } from "@/lib/types"
import { useProgressMonitoring } from "@/lib/hooks/use-progress-monitoring"
import { NotificationSystem, ProgressNotificationCompact } from "@/components/ui/notification-system"
import { FilenameDisplay } from "@/components/ui/filename-display"
import { formatFileSizeHuman } from "@/lib/utils/format"
import { getUserPreference, setUserPreference } from "@/lib/utils/user-preferences"
import { copyUrlToClipboard, copyImageUrlToClipboard } from "@/lib/utils/copy-to-clipboard"
import { useAppState } from "@/lib/contexts/app-state-context"

// Provider display names
const providerDisplayNames = {
  [OSSProvider.Aliyun]: "阿里云 OSS",
  [OSSProvider.Tencent]: "腾讯云 COS", 
  [OSSProvider.AWS]: "Amazon S3",
  [OSSProvider.Custom]: "自定义 S3"
}

interface UploadFile {
  id: string
  filePath: string
  fileName: string
  preview: string
  status: "pending" | "uploading" | "success" | "error" | "duplicate"
  progress: number
  url?: string
  error?: string
  size: string
  fileSize: number
  duplicateInfo?: {
    existing_url: string
  }
}

function ImageUpload() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [recentHistory, setRecentHistory] = useState<HistoryRecord[]>([])
  
  // Use global app state for configuration
  const { state: appState } = useAppState()
  const config = appState.ossConfig
  
  
  // 简化的上传路径
  const uploadPath = "images/"


  // Progress monitoring hook
  const {
    uploadProgress,
    notifications,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    dismissNotification,
    clearAllNotifications,
    sendNotification,
    cancelUpload,
    retryUpload,
  } = useProgressMonitoring()

  // 延迟加载历史记录，避免阻塞初始渲染
  useEffect(() => {
    if (!appState.isInitialized) {
      console.log('[ImageUpload] App not initialized yet, waiting...')
      return
    }

    // 延迟加载以提高页面响应性
    const loadDataWithDelay = async () => {
      // 延迟执行非关键初始化
      setTimeout(async () => {
        try {
          console.log('[ImageUpload] Starting history loading...')
          
          // 首先尝试从图片历史记录加载
          const [historyResult] = await Promise.allSettled([
            tauriAPI.getImageHistory(UploadMode.ImageUpload, 5)
          ])

          if (historyResult.status === 'fulfilled') {
            console.log('[ImageUpload] Image history loaded:', historyResult.value.length, 'records')
            
            if (historyResult.value.length > 0) {
              // 转换ImageHistoryRecord为HistoryRecord格式以兼容显示组件
              const convertedHistory = historyResult.value.map(record => ({
                id: record.id,
                timestamp: record.timestamp,
                operation: "upload",
                files: [record.original_path],
                image_count: 1,
                success: record.success,
                backup_path: undefined,
                duration: undefined,
                total_size: record.file_size,
                error_message: record.error_message,
                metadata: {
                  uploaded_url: record.uploaded_url || "",
                  upload_mode: record.upload_mode
                }
              }))
              setRecentHistory(convertedHistory)
              console.log('[ImageUpload] History set from image records:', convertedHistory.length)
            } else {
              console.log('[ImageUpload] No image history found, trying fallback to unified history')
              // 如果没有图片历史记录，从统一历史记录中筛选
              await loadHistoryFromUnified()
            }
          } else {
            console.warn('[ImageUpload] Failed to load image history:', historyResult.reason)
            // 尝试从统一历史记录加载
            await loadHistoryFromUnified()
          }

          // 启动进度监控（单例模式，不会重复创建）
          await startMonitoring()
        } catch (error) {
          console.error('[ImageUpload] Critical initialization failed:', error)
        }
      }, 300) // 延迟 300ms，让页面先完成关键渲染
    }

    loadDataWithDelay()

    return () => {
      // 清理操作保持轻量
      stopMonitoring()
    }
  }, [appState.isInitialized, startMonitoring, stopMonitoring])

  // 从统一历史记录中加载图片上传模式的记录
  const loadHistoryFromUnified = async () => {
    try {
      console.log('[ImageUpload] Loading history from unified records...')
      const allHistory = await tauriAPI.getUploadHistory(1, 20) // 获取前20条
      console.log('[ImageUpload] Unified history loaded:', allHistory.items.length, 'total records')
      
      // 从统一历史记录中筛选图片上传模式的记录
      const filteredHistory = allHistory.items.filter(record => {
        const isImageUpload = record.metadata?.upload_mode === UploadMode.ImageUpload ||
                              record.operation === 'upload' // 兼容旧的记录
        console.log('[ImageUpload] Checking record:', record.id, 'operation:', record.operation, 'upload_mode:', record.metadata?.upload_mode, 'isImageUpload:', isImageUpload)
        return isImageUpload
      })
      
      console.log('[ImageUpload] Filtered history:', filteredHistory.length, 'image upload records')
      setRecentHistory(filteredHistory.slice(0, 5)) // 只显示前5条
    } catch (error) {
      console.error('[ImageUpload] Failed to load unified history:', error)
      setRecentHistory([]) // 设置为空数组避免显示错误
    }
  }

  // 统一的历史记录刷新函数
  const refreshHistory = async () => {
    try {
      console.log('[ImageUpload] Refreshing history...')
      // 首先尝试从图片历史记录加载
      const imageHistory = await tauriAPI.getImageHistory(UploadMode.ImageUpload, 5)
      
      if (imageHistory.length > 0) {
        const convertedHistory = imageHistory.map(record => ({
          id: record.id,
          timestamp: record.timestamp,
          operation: "upload",
          files: [record.original_path],
          image_count: 1,
          success: record.success,
          backup_path: undefined,
          duration: undefined,
          total_size: record.file_size,
          error_message: record.error_message,
          metadata: {
            uploaded_url: record.uploaded_url || "",
            upload_mode: record.upload_mode
          }
        }))
        setRecentHistory(convertedHistory)
        console.log('[ImageUpload] History refreshed from image records:', convertedHistory.length)
      } else {
        // 如果没有图片历史记录，尝试从统一历史加载
        await loadHistoryFromUnified()
      }
    } catch (error) {
      console.error('[ImageUpload] Failed to refresh history:', error)
      // 尝试备选方案
      await loadHistoryFromUnified()
    }
  }

  // Update file progress from the monitoring hook
  useEffect(() => {
    setFiles(prevFiles =>
      prevFiles.map(file => {
        const progress = uploadProgress.get(file.id)
        if (progress) {
          return {
            ...file,
            progress: progress.progress,
            status: progress.progress >= 100 ? "success" : "uploading"
          }
        }
        return file
      })
    )
  }, [uploadProgress])

  // 清理错误和成功信息
  const clearError = () => {
    // 如果需要错误状态管理，可以在这里添加
  }
  
  const clearSuccess = () => {
    // 如果需要成功状态管理，可以在这里添加
  }
  
  const generateId = async () => {
    try {
      // Use backend-generated UUID to ensure consistency with progress tracking
      return await tauriAPI.generateUuid()
    } catch (error) {
      console.warn('Failed to generate UUID from backend, falling back to random ID:', error)
      // Fallback to random ID if backend call fails
      return Math.random().toString(36).substr(2, 9)
    }
  }

  // 创建上传文件对象（基于文件路径）
  const createUploadFileFromPath = async (filePath: string): Promise<UploadFile> => {
    const fileName = filePath.split(/[\\/]/).pop() || filePath
    let fileSize = 0
    
    try {
      // 尝试获取文件大小，如果失败则使用默认值
      fileSize = await tauriAPI.getFileSize(filePath)
    } catch (error) {
      console.warn('Failed to get file size:', error)
    }
    
    return {
      id: await generateId(),
      filePath,
      fileName,
      preview: convertFileSrc(filePath), // 使用Tauri的convertFileSrc生成预览
      status: "pending",
      progress: 0,
      size: formatFileSizeHuman(fileSize),
      fileSize,
    }
  }
  
  // 创建上传文件对象（基于File对象，用于拖拽）
  const createUploadFileFromFile = async (file: File): Promise<UploadFile> => ({
    id: await generateId(),
    filePath: file.name, // 拖拽时只能获取文件名
    fileName: file.name,
    preview: URL.createObjectURL(file),
    status: "pending",
    progress: 0,
    size: formatFileSizeHuman(file.size),
    fileSize: file.size,
  })

  // 使用Tauri文件对话框选择图片
  const handleFileSelection = useCallback(async () => {
    try {
      clearError()
      clearSuccess()

      // 使用Tauri文件对话框选择图片
      const { open } = await import('@tauri-apps/plugin-dialog')

        const selected = await open({
          multiple: true,
          filters: [{
            name: 'Image Files',
            extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico']
          }]
        })

        if (selected && Array.isArray(selected)) {
          const uploadFiles = await Promise.all(selected.map(createUploadFileFromPath))
          await handleFiles(uploadFiles)
        } else if (selected) {
          const uploadFile = await createUploadFileFromPath(selected)
          await handleFiles([uploadFile])
        }
    } catch (error) {
      console.error('Failed to select files:', error)
      alert(`文件选择失败: ${error}`)
    }
  }, [])

  const handleFiles = useCallback(async (uploadFiles: UploadFile[]) => {

    // 进行重复检测
    console.log('[DuplicateCheck] Starting duplicate detection for:', uploadFiles.length, 'files')
    
    if (uploadFiles.length > 0) {
      console.log('[DuplicateCheck] Starting hash-based duplicate detection')
      
      try {
        // 获取文件路径用于重复检测
        const filePaths = uploadFiles.map(f => f.filePath)
        console.log('[DuplicateCheck] File paths for duplicate check:', filePaths)
        
        // 调用后端批量重复检测
        console.log('[DuplicateCheck] Calling tauriAPI.checkDuplicatesBatch...')
        const duplicateResults = await tauriAPI.checkDuplicatesBatch(filePaths)
        console.log('[DuplicateCheck] Duplicate check results:', duplicateResults)

        // 标记重复的文件
        const filesWithDuplicateStatus = uploadFiles.map((file, index) => {
          const duplicateResult = duplicateResults[index]
          console.log(`[DuplicateCheck] Processing file ${index}: ${file.fileName}, duplicate result:`, duplicateResult)
          
          if (duplicateResult?.is_duplicate) {
            console.log(`[DuplicateCheck] File ${file.fileName} is marked as duplicate`)
            return {
              ...file,
              status: "duplicate" as const,
              duplicateInfo: {
                existing_url: duplicateResult.existing_url || ''
              }
            }
          }
          console.log(`[DuplicateCheck] File ${file.fileName} is not duplicate`)
          return file
        })

        console.log('[DuplicateCheck] Files with duplicate status:', filesWithDuplicateStatus)
        setFiles((prev) => [...prev, ...filesWithDuplicateStatus])

        // 统计重复文件数量
        const duplicateCount = duplicateResults.filter(r => r.is_duplicate).length
        console.log('[DuplicateCheck] Total duplicate files found:', duplicateCount)
      } catch (error) {
        console.error("[DuplicateCheck] Duplicate detection failed with error:", error)
        
        // 如果检测失败，仍然添加文件但显示警告
        console.log('[DuplicateCheck] Adding files despite detection failure')
        setFiles((prev) => [...prev, ...uploadFiles])
        alert(`重复检测失败: ${error}。文件已添加但建议手动检查是否重复。`)
      }
    } else {
      console.log('[DuplicateCheck] No files to check, adding files directly')
      // 如果没有文件，直接添加
      setFiles((prev) => [...prev, ...uploadFiles])
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const droppedFiles = Array.from(e.dataTransfer.files)
      
      // 过滤图片文件
      const imageFiles = droppedFiles.filter((file: File) => file.type.startsWith("image/"))
      if (imageFiles.length !== droppedFiles.length) {
        alert("只支持图片文件格式")
      }
      
      if (imageFiles.length > 0) {
        // 使用File对象创建上传文件（拖拽时只能获取文件名）
        const uploadFiles = await Promise.all(imageFiles.map(createUploadFileFromFile))
        await handleFiles(uploadFiles)
      }
    },
    [handleFiles],
  )

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const fileArray = Array.from(e.target.files)
        const imageFiles = fileArray.filter((file: File) => file.type.startsWith("image/"))
        
        if (imageFiles.length !== fileArray.length) {
          alert("只支持图片文件格式")
        }
        
        if (imageFiles.length > 0) {
          const uploadFiles = await Promise.all(imageFiles.map(createUploadFileFromFile))
          await handleFiles(uploadFiles)
        }
      }
    },
    [handleFiles],
  )

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id)
      if (file?.preview) {
        URL.revokeObjectURL(file.preview)
      }
      return prev.filter((f) => f.id !== id)
    })
  }

  const clearAll = () => {
    files.forEach((file) => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview)
      }
    })
    setFiles([])
  }

  const uploadFiles = async (filesToUpload: UploadFile[]) => {
    if (!config) {
      alert("请先配置存储服务")
      return
    }

    setIsUploading(true)

    try {
      // 分离出需要真正上传的文件（非重复文件）
      const filesToActuallyUpload = filesToUpload.filter(f => f.status !== "duplicate")
      const duplicateFiles = filesToUpload.filter(f => f.status === "duplicate")
      
      console.log(`[Upload] Total files: ${filesToUpload.length}, To upload: ${filesToActuallyUpload.length}, Duplicates: ${duplicateFiles.length}`)

      // Mark all files as processing
      setFiles(prev =>
        prev.map(f => {
          if (filesToUpload.some(upload => upload.id === f.id)) {
            if (f.status === "duplicate") {
              // 重复文件直接标记为成功，使用已存在的URL
              return { 
                ...f, 
                status: "success" as const, 
                progress: 100,
                url: f.duplicateInfo?.existing_url
              }
            } else {
              // 非重复文件标记为上传中
              return { ...f, status: "uploading" as const, progress: 0 }
            }
          }
          return f
        })
      )

      // 只上传非重复的文件
      if (filesToActuallyUpload.length > 0) {
        const imageData: [string, string][] = filesToActuallyUpload.map(f => [f.id, f.filePath])
        const results = await tauriAPI.uploadImagesWithIds(imageData, config)

        // 更新上传结果
        setFiles(prev =>
          prev.map(file => {
            const uploadFile = filesToActuallyUpload.find(f => f.id === file.id)
            if (!uploadFile) return file

            const result = results.find(r => r.image_id === file.id)
            
            if (result) {
              return {
                ...file,
                status: result.success ? "success" as const : "error" as const,
                progress: result.success ? 100 : file.progress,
                url: result.uploaded_url,
                error: result.error,
              }
            }
            return file
          })
        )

        // 为成功上传的图片添加历史记录
        try {
          for (const result of results) {
            if (result.success && result.uploaded_url) {
              const uploadFile = filesToActuallyUpload.find(f => f.id === result.image_id)
              if (uploadFile) {
                await tauriAPI.addImageHistoryRecord(
                  uploadFile.fileName,
                  uploadFile.filePath,
                  result.uploaded_url,
                  UploadMode.ImageUpload,
                  undefined,
                  true,
                  uploadFile.fileSize || 0,
                  undefined,
                  undefined
                )
              }
            }
          }

          await refreshHistory()
        } catch (error) {
          console.warn("Failed to save image history records:", error)
        }
      }

    } catch (error) {
      console.error("Upload failed:", error)
      
      // Parse error message to provide more specific feedback
      let errorMessage = "上传失败"
      if (error instanceof Error) {
        if (error.message.includes('network') || error.message.includes('connection')) {
          errorMessage = "网络连接失败，请检查网络连接"
        } else if (error.message.includes('storage') || error.message.includes('bucket')) {
          errorMessage = "存储服务配置错误，请检查存储配置"
        } else if (error.message.includes('permission') || error.message.includes('access')) {
          errorMessage = "存储访问权限不足，请检查访问密钥"
        } else if (error.message.includes('timeout')) {
          errorMessage = "上传超时，请稍后重试"
        } else if (error.message.includes('size') || error.message.includes('large')) {
          errorMessage = "文件过大，请选择较小的文件"
        } else if (error.message.includes('not found') || error.message.includes('file not found')) {
          errorMessage = "文件未找到，请确认文件存在"
        } else {
          errorMessage = `上传失败: ${error.message}`
        }
      }

      // Mark all uploading files as failed with specific error
      setFiles(prev =>
        prev.map(f =>
          filesToUpload.some(upload => upload.id === f.id)
            ? { ...f, status: "error" as const, error: errorMessage }
            : f
        )
      )
      
      // Send notification about the failure - use alert for now
      console.error("Upload error details:", errorMessage)
      alert(`${errorMessage}。请检查错误并重试。`)
    } finally {
      setIsUploading(false)
    }
  }

  const uploadAll = async () => {
    // 只上传状态为 "pending" 的文件（排除重复文件）
    const pendingFiles = files.filter((f) => f.status === "pending")
    if (pendingFiles.length === 0) {
      const duplicateCount = files.filter((f) => f.status === "duplicate").length
      const errorFiles = files.filter((f) => f.status === "error")
      
      if (duplicateCount > 0 && errorFiles.length === 0) {
        alert(`所有图片都是重复的（${duplicateCount} 个），已自动使用已存在的链接。`)
      } else if (errorFiles.length > 0) {
        alert("没有可上传的文件。请移除错误的文件后重试。")
      } else {
        alert("请先选择要上传的图片文件。")
      }
      return
    }

    await uploadFiles(pendingFiles)
  }

  const cancelFileUpload = async (fileId: string) => {
    try {
      await cancelUpload(fileId)
      setFiles(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: "error" as const, error: "Upload cancelled by user" }
            : f
        )
      )
    } catch (error) {
      console.error("Failed to cancel upload:", error)
    }
  }

  const retryFileUpload = async (fileId: string) => {
    const file = files.find(f => f.id === fileId)
    if (!file) return

    try {
      await retryUpload(fileId)
      setFiles(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: "uploading" as const, progress: 0, error: undefined }
            : f
        )
      )
    } catch (error) {
      console.error("Failed to retry upload:", error)
      alert(`重试上传文件 ${file.fileName} 失败`)
    }
  }







  const removeDuplicateFiles = () => {
    setFiles(prev => {
      const filesToRemove = prev.filter(f => f.status === "duplicate")
      filesToRemove.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview)
        }
      })
      return prev.filter(f => f.status !== "duplicate")
    })
  }

  const removeAllErrorFiles = () => {
    setFiles(prev => {
      const filesToRemove = prev.filter(f => f.status === "error")
      filesToRemove.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview)
        }
      })
      return prev.filter(f => f.status !== "error")
    })
  }





  const copyUrl = (url: string) => {
    copyUrlToClipboard(url)
  }

  const copyImageUrlFromHistory = async (url: string) => {
    await copyImageUrlToClipboard(url)
  }

  const totalFiles = files.length
  const successFiles = files.filter((f) => f.status === "success").length
  const errorFiles = files.filter((f) => f.status === "error").length
  const uploadingFiles = files.filter((f) => f.status === "uploading").length
  const duplicateFiles = files.filter((f) => f.status === "duplicate").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">图片上传</h1>
          <p className="text-gray-600 dark:text-gray-400">批量上传图片到对象存储</p>
        </div>
      </div>

      {/* OSS Configuration Status */}
      {!config && (
        <Alert>
          <Settings className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>未找到 OSS 配置。请先配置您的对象存储设置。</span>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => window.location.href = '/storage'}
            >
              配置存储
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Upload Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">上传配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Storage Provider Info */}
          {config && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-600 dark:text-gray-400">当前供应商:</span>
                  <div className="mt-1">{providerDisplayNames[config.provider]}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-600 dark:text-gray-400">存储桶:</span>
                  <div className="mt-1 font-mono">{config.bucket}</div>
                </div>
                <div>
                  <span className="font-medium text-gray-600 dark:text-gray-400">区域:</span>
                  <div className="mt-1">{config.region || '默认'}</div>
                </div>
              </div>
            </div>
          )}

          {!config && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                请先在存储配置页面配置您的对象存储服务
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Area */}
      <Card>
        <CardContent className="p-6">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
              : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
              }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">拖拽图片到此处或点击选择</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              支持 JPG、PNG、GIF、WebP 格式，单个文件最大 10MB
            </p>
            <Button onClick={handleFileSelection}>选择图片</Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      {/* Upload Statistics */}
      {totalFiles > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">总计</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalFiles}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">成功</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{successFiles}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">失败</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{errorFiles}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">上传中</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{uploadingFiles}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">上传队列 ({files.length})</CardTitle>
              <div className="flex gap-2">
                <Button
                  onClick={uploadAll}
                  disabled={!config || isUploading || files.every((f) => f.status !== "pending")}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isUploading ? "上传中..." : "开始上传"}
                </Button>
                {files.some(f => f.status === "duplicate") && (
                  <Button variant="outline" onClick={removeDuplicateFiles}>
                    <AlertCircle className="h-4 w-4 mr-2" />
                    移除重复 ({duplicateFiles})
                  </Button>
                )}
                {files.some(f => f.status === "error") && (
                  <Button variant="outline" onClick={removeAllErrorFiles}>
                    <X className="h-4 w-4 mr-2" />
                    移除错误
                  </Button>
                )}
                <Button variant="outline" onClick={clearAll}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  清空全部
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {files.map((file) => (
                <div key={file.id} className="flex items-center gap-4 p-3 border rounded-lg">
                  <img
                    src={file.preview || "/placeholder.svg"}
                    alt={file.fileName}
                    className="w-12 h-12 object-cover rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white">
                      <FilenameDisplay 
                        filePath={file.fileName}
                        maxLength={25}
                        showTooltip={true}
                      />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{file.size}</p>
                    {file.status === "uploading" && <Progress value={file.progress} className="mt-2" />}
                    {file.status === "success" && file.url && (
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="sm" variant="outline" onClick={() => copyUrl(file.url!)}>
                          <Copy className="h-3 w-3 mr-1" />
                          复制链接
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => window.open(file.url, "_blank")}>
                          <Eye className="h-3 w-3 mr-1" />
                          预览
                        </Button>
                      </div>
                    )}
                    {file.status === "error" && (
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="sm" variant="outline" onClick={() => retryFileUpload(file.id)}>
                          <RefreshCw className="h-3 w-3 mr-1" />
                          重试
                        </Button>
                      </div>
                    )}
                    {file.status === "uploading" && (
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="sm" variant="outline" onClick={() => cancelFileUpload(file.id)}>
                          <X className="h-3 w-3 mr-1" />
                          取消
                        </Button>
                      </div>
                    )}
                    {file.status === "duplicate" && file.duplicateInfo && (
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="sm" variant="outline" onClick={() => copyUrl(file.duplicateInfo!.existing_url)}>
                          <Copy className="h-3 w-3 mr-1" />
                          复制已存在链接
                        </Button>
                      </div>
                    )}
                    {file.error && <p className="text-sm text-red-600 mt-1">{file.error}</p>}
                    {file.status === "duplicate" && file.duplicateInfo?.existing_url && (
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        已存在: {file.duplicateInfo.existing_url.length > 40 ? 
                          file.duplicateInfo.existing_url.substring(0, 40) + '...' : 
                          file.duplicateInfo.existing_url}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        file.status === "success"
                          ? "default"
                          : file.status === "error"
                            ? "destructive"
                            : file.status === "uploading"
                              ? "secondary"
                              : file.status === "duplicate"
                                ? "secondary"
                                : "outline"
                      }
                      className={
                        file.status === "duplicate" 
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                          : file.status === "success"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : ""
                      }
                    >
                      {file.status === "pending" && "待上传"}
                      {file.status === "uploading" && "上传中"}
                      {file.status === "success" && "成功"}
                      {file.status === "error" && "失败"}
                      {file.status === "duplicate" && "重复"}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => removeFile(file.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Upload History */}
      <Card>
        <CardHeader>
          <CardTitle>最近上传记录</CardTitle>
          <p className="text-sm text-muted-foreground">显示最近的图片上传记录</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentHistory.length > 0 ? (
              recentHistory.map((record) => (
                <div key={record.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                      <Image className="h-5 w-5 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        <FilenameDisplay 
                          filePath={record.files.length > 0 ? record.files[0] : 'Unknown file'}
                          maxLength={25}
                          showTooltip={true}
                        />
                        {record.files.length > 1 && (
                          <span className="text-xs text-gray-500 ml-1">
                            +{record.files.length - 1}个文件
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(record.timestamp).toLocaleString()}</span>
                        {record.total_size && (
                          <>
                            <span>•</span>
                            <span>{formatFileSizeHuman(record.total_size)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={record.success ? "default" : "destructive"}
                      className={record.success ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}
                    >
                      {record.success ? "已上传" : "失败"}
                    </Badge>
                    {record.success && record.metadata?.uploaded_url && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => copyImageUrlFromHistory(record.metadata.uploaded_url)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        复制链接
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <ImageIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>暂无上传记录</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification System */}
      <NotificationSystem
        notifications={notifications}
        onDismiss={dismissNotification}
        onClearAll={clearAllNotifications}
      />

      {/* Compact Progress Notification */}
      <ProgressNotificationCompact
        progress={uploadProgress}
        onCancel={cancelFileUpload}
      />
    </div>
  )
}

// 使用 React.memo 优化性能，避免不必要的重新渲染
export default memo(ImageUpload)
