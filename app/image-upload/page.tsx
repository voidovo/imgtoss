"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { X, AlertCircle, Trash2, Eye, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { convertFileSrc } from '@tauri-apps/api/core'
import { tauriAPI } from "@/lib/tauri-api"
// 导入可复用组件
import { HistoryRecordList } from "@/components/panels/history-record-list"
import { StatCardGrid, createImageUploadStats } from "@/components/panels/stat-card-grid"
import { OSSConfigDisplay } from "@/components/panels/oss-config-display"
import { UploadArea } from "@/components/panels/upload-area"
import type { HistoryRecord } from "@/lib/types"
import { UploadMode } from "@/lib/types"
import { FilenameDisplay } from "@/components/ui/filename-display"
import { formatFileSizeHuman } from "@/lib/utils/format"
import { copyUrlToClipboard, copyImageUrlToClipboard } from "@/lib/utils/copy-to-clipboard"
import { useAppState } from "@/lib/contexts/app-state-context"

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

export default function ImageUploadPage() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [recentHistory, setRecentHistory] = useState<HistoryRecord[]>([])
  
  // Use global app state for configuration
  const { state: appState } = useAppState()
  const config = appState.ossConfig

  // 延迟加载历史记录，避免阻塞初始渲染
  useEffect(() => {
    if (!appState.isInitialized) {
      return
    }

    // 延迟加载以提高页面响应性
    const loadDataWithDelay = async () => {
      setTimeout(async () => {
        try {
          // 首先尝试从图片历史记录加载
          const imageHistory = await tauriAPI.getImageHistory(UploadMode.ImageUpload, 5)
          
          if (imageHistory.length > 0) {
            // 转换ImageHistoryRecord为HistoryRecord格式以兼容显示组件
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
          } else {
            // 如果没有图片历史记录，从统一历史记录中筛选
            await loadHistoryFromUnified()
          }
        } catch (error) {
          console.error('Failed to load history:', error)
          await loadHistoryFromUnified()
        }
      }, 300)
    }

    loadDataWithDelay()
  }, [appState.isInitialized])

  // 从统一历史记录中加载图片上传模式的记录
  const loadHistoryFromUnified = async () => {
    try {
      const allHistory = await tauriAPI.getUploadHistory(1, 20)
      
      // 从统一历史记录中筛选图片上传模式的记录
      const filteredHistory = allHistory.items.filter(record => {
        const isImageUpload = record.metadata?.upload_mode === UploadMode.ImageUpload ||
                              record.operation === 'upload'
        return isImageUpload
      })
      
      setRecentHistory(filteredHistory.slice(0, 5))
    } catch (error) {
      console.error('Failed to load unified history:', error)
      setRecentHistory([])
    }
  }

  // 统一的历史记录刷新函数
  const refreshHistory = async () => {
    try {
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
      } else {
        await loadHistoryFromUnified()
      }
    } catch (error) {
      console.error('Failed to refresh history:', error)
      await loadHistoryFromUnified()
    }
  }
  
  const generateId = async () => {
    try {
      return await tauriAPI.generateUuid()
    } catch (error) {
      console.warn('Failed to generate UUID from backend, falling back to random ID:', error)
      return Math.random().toString(36).substr(2, 9)
    }
  }

  // 创建上传文件对象（基于文件路径）
  const createUploadFileFromPath = async (filePath: string): Promise<UploadFile> => {
    const fileName = filePath.split(/[\\/]/).pop() || filePath
    let fileSize = 0
    
    try {
      fileSize = await tauriAPI.getFileSize(filePath)
    } catch (error) {
      console.warn('Failed to get file size:', error)
    }
    
    return {
      id: await generateId(),
      filePath,
      fileName,
      preview: convertFileSrc(filePath),
      status: "pending",
      progress: 0,
      size: formatFileSizeHuman(fileSize),
      fileSize,
    }
  }
  
  // 创建上传文件对象（基于File对象，用于拖拽）
  const createUploadFileFromFile = async (file: File): Promise<UploadFile> => ({
    id: await generateId(),
    filePath: file.name,
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
    if (uploadFiles.length > 0) {
      try {
        const filePaths = uploadFiles.map(f => f.filePath)
        const duplicateResults = await tauriAPI.checkDuplicatesBatch(filePaths)

        // 标记重复的文件
        const filesWithDuplicateStatus = uploadFiles.map((file, index) => {
          const duplicateResult = duplicateResults[index]
          
          if (duplicateResult?.is_duplicate) {
            return {
              ...file,
              status: "duplicate" as const,
              duplicateInfo: {
                existing_url: duplicateResult.existing_url || ''
              }
            }
          }
          return file
        })

        setFiles((prev) => [...prev, ...filesWithDuplicateStatus])
      } catch (error) {
        console.error("Duplicate detection failed:", error)
        setFiles((prev) => [...prev, ...uploadFiles])
        alert(`重复检测失败: ${error}。文件已添加但建议手动检查是否重复。`)
      }
    } else {
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
      <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">图片上传</h1>
          <p className="text-gray-600 dark:text-gray-400">批量上传图片到对象存储</p>
        </div>
      </div>

      {/* Upload Configuration and Area */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">上传配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* OSS 配置信息 - 使用可复用组件 */}
          <OSSConfigDisplay 
            config={config}
            showAsAlert={false}
            onConfigClick={() => window.location.href = '/storage'}
          />

          {/* 上传区域 - 使用可复用组件 */}
          <UploadArea
            isDragging={isDragging}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onFileSelect={handleFileSelection}
            onInputChange={handleFileSelect}
            title="拖拽图片到此处或点击选择"
            description="支持 JPG、PNG、GIF、WebP 格式，单个文件最大 10MB"
            buttonText="选择图片"
            showFileInput={true}
            multiple={true}
            acceptedFileTypes="image/*"
          />
        </CardContent>
      </Card>

      {/* 上传统计 - 使用可复用组件 */}
      {totalFiles > 0 && (
        <StatCardGrid
          stats={createImageUploadStats({
            totalFiles,
            successFiles,
            errorFiles,
            uploadingFiles,
          })}
          columns={{ default: 2, md: 4 }}
          gap="md"
        />
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
                      <div className="text-sm text-red-600 mt-1">{file.error}</div>
                    )}
                    {file.status === "duplicate" && (
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary">重复文件</Badge>
                        {file.duplicateInfo?.existing_url && (
                          <Button size="sm" variant="outline" onClick={() => copyUrl(file.duplicateInfo!.existing_url)}>
                            <Copy className="h-3 w-3 mr-1" />
                            复制已有链接
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={
                        file.status === "success" ? "default" :
                        file.status === "error" ? "destructive" :
                        file.status === "duplicate" ? "secondary" :
                        file.status === "uploading" ? "secondary" :
                        "outline"
                      }
                      className={
                        file.status === "success" ? "bg-green-100 text-green-800" :
                        file.status === "duplicate" ? "bg-yellow-100 text-yellow-800" :
                        ""
                      }
                    >
                      {file.status === "pending" ? "待上传" :
                       file.status === "uploading" ? "上传中" :
                       file.status === "success" ? "已上传" :
                       file.status === "error" ? "失败" :
                       file.status === "duplicate" ? "重复" : "未知"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(file.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 历史记录 - 使用可复用组件 */}
      <HistoryRecordList
        records={recentHistory}
        title="最近上传记录" 
        onCopyLink={copyImageUrlFromHistory}
        maxFileNameLength={25}
        emptyStateText="暂无上传记录"
      />
    </div>
  )
}
