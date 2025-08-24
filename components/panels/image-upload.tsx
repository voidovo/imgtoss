"use client"

import type React from "react"

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
import { OSSProvider } from "@/lib/types"
import { NotificationType } from "@/lib/types"
import { useProgressMonitoring } from "@/lib/hooks/use-progress-monitoring"
import { NotificationSystem, ProgressNotificationCompact } from "@/components/ui/notification-system"
import { FilenameDisplay } from "@/components/ui/filename-display"
import { formatFileSizeHuman } from "@/lib/utils/format"
import { getUserPreference, setUserPreference } from "@/lib/utils/user-preferences"

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
  status: "pending" | "uploading" | "success" | "error"
  progress: number
  url?: string
  error?: string
  size: string
  fileSize: number
}

export default function ImageUpload() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [config, setConfig] = useState<OSSConfig | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [recentHistory, setRecentHistory] = useState<HistoryRecord[]>([])
  
  // 重复检测设置（从用户偏好设置加载）
  const [duplicateCheckEnabled, setDuplicateCheckEnabled] = useState<boolean>(() => {
    try {
      console.log('[DuplicateCheck] 加载重复检测偏好设置')
      const preference = getUserPreference('duplicateCheckEnabled')
      const enabled = preference !== undefined ? preference : true // 默认启用
      console.log('[DuplicateCheck] 重复检测状态:', enabled)
      return enabled
    } catch (error) {
      console.error('[DuplicateCheck] 加载偏好设置失败:', error)
      return true // 错误时默认启用
    }
  })
  
  // 简化的上传路径
  const uploadPath = "images/"

  // 更新重复检测设置
  const updateDuplicateCheckEnabled = (enabled: boolean) => {
    console.log('[DuplicateCheck] 更新重复检测状态为:', enabled)
    setDuplicateCheckEnabled(enabled)
    try {
      setUserPreference('duplicateCheckEnabled', enabled)
      console.log('[DuplicateCheck] 偏好设置保存成功')
    } catch (error) {
      console.error('[DuplicateCheck] 保存偏好设置失败:', error)
    }
  }

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

  // 加载 OSS 配置和进度监控
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const loadedConfig = await configOperations.loadOSSConfig()
        setConfig(loadedConfig)
      } catch (error) {
        console.error("Failed to load OSS config:", error)
      }
    }

    const loadRecentHistory = async () => {
      try {
        // 获取最近5条成功的图片上传记录
        const result = await historyOperations.searchHistory(
          undefined, // searchTerm
          "upload", // operationType
          true, // successOnly
          undefined, // startDate
          undefined, // endDate
          1, // page
          5 // pageSize
        )
        setRecentHistory(result.items || [])
      } catch (error) {
        console.error("Failed to load recent history:", error)
      }
    }

    const initializeMonitoring = async () => {
      try {
        await startMonitoring()
      } catch (error) {
        console.error("Failed to start progress monitoring:", error)
      }
    }

    loadConfig()
    loadRecentHistory()
    initializeMonitoring()

    return () => {
      stopMonitoring()
    }
  }, [startMonitoring, stopMonitoring])

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
  
  const generateId = () => Math.random().toString(36).substr(2, 9)

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
      id: generateId(),
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
  const createUploadFileFromFile = (file: File): UploadFile => ({
    id: generateId(),
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

    // 如果启用了重复检测，进行哈希值检测
    console.log('[DuplicateCheck] Checking if duplicate detection is enabled:', duplicateCheckEnabled)
    console.log('[DuplicateCheck] Number of upload files:', uploadFiles.length)
    
    if (duplicateCheckEnabled && uploadFiles.length > 0) {
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
              status: "error" as const,
              error: `重复图片 - 已存在: ${duplicateResult.existing_url || '未知链接'}`
            }
          }
          console.log(`[DuplicateCheck] File ${file.fileName} is not duplicate`)
          return file
        })

        console.log('[DuplicateCheck] Files with duplicate status:', filesWithDuplicateStatus)
        setFiles((prev) => [...prev, ...filesWithDuplicateStatus])

        // 如果有重复文件，显示提示
        const duplicateCount = duplicateResults.filter(r => r.is_duplicate).length
        console.log('[DuplicateCheck] Total duplicate files found:', duplicateCount)
        
        if (duplicateCount > 0) {
          console.log('[DuplicateCheck] Showing duplicate files alert')
          alert(`检测到 ${duplicateCount} 个重复图片，已自动标记。您可以选择移除这些重复文件。`)
        }
      } catch (error) {
        console.error("[DuplicateCheck] Duplicate detection failed with error:", error)
        
        // 如果检测失败，仍然添加文件但显示警告
        console.log('[DuplicateCheck] Adding files despite detection failure')
        setFiles((prev) => [...prev, ...uploadFiles])
        alert(`重复检测失败: ${error}。文件已添加但建议手动检查是否重复。`)
      }
    } else {
      console.log('[DuplicateCheck] Duplicate detection disabled or no files, adding files directly')
      // 如果未启用重复检测，直接添加文件
      setFiles((prev) => [...prev, ...uploadFiles])
    }
  }, [duplicateCheckEnabled])

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
        const uploadFiles = imageFiles.map(createUploadFileFromFile)
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
          const uploadFiles = imageFiles.map(createUploadFileFromFile)
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
      // Mark files as uploading
      setFiles(prev =>
        prev.map(f =>
          filesToUpload.some(upload => upload.id === f.id)
            ? { ...f, status: "uploading" as const, progress: 0 }
            : f
        )
      )

      // 在桌面环境中，直接使用文件路径
      const imagePaths = filesToUpload.map(f => f.filePath)

      // 使用upload_images接口（与文章上传保持一致）
      const results = await tauriAPI.uploadImages(imagePaths, config)

      // 基于文件路径匹配结果
      setFiles(prev =>
        prev.map(file => {
          const uploadFile = filesToUpload.find(f => f.id === file.id)
          if (!uploadFile) return file

          // 通过文件路径匹配结果
          const result = results.find(r => 
            r.image_id === uploadFile.filePath || 
            r.image_id === uploadFile.fileName ||
            uploadFile.filePath.endsWith(r.image_id)
          )
          
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
      const errorFiles = files.filter((f) => f.status === "error")
      if (errorFiles.length > 0) {
        // Use alert instead of notification system for now
        alert("没有可上传的文件。请移除重复或错误的文件后重试。")
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
      const filesToRemove = prev.filter(f => f.status === "error" && f.error?.includes("重复"))
      filesToRemove.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview)
        }
      })
      return prev.filter(f => !(f.status === "error" && f.error?.includes("重复")))
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
    navigator.clipboard.writeText(url)
    // Could add toast notification here
  }

  const copyImageUrlFromHistory = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      // 可以在这里添加 toast 提示
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }

  const totalFiles = files.length
  const successFiles = files.filter((f) => f.status === "success").length
  const errorFiles = files.filter((f) => f.status === "error").length
  const uploadingFiles = files.filter((f) => f.status === "uploading").length

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
                {files.some(f => f.status === "error" && f.error?.includes("重复")) && (
                  <Button variant="outline" onClick={removeDuplicateFiles}>
                    <AlertCircle className="h-4 w-4 mr-2" />
                    移除重复
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
                    {file.error && <p className="text-sm text-red-600 mt-1">{file.error}</p>}
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
                              : "outline"
                      }
                    >
                      {file.status === "pending" && "待上传"}
                      {file.status === "uploading" && "上传中"}
                      {file.status === "success" && "成功"}
                      {file.status === "error" && "失败"}
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
          <CardTitle className="text-lg">最近上传记录</CardTitle>
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
