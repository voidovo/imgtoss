"use client"

import React, { useState, useCallback, useEffect } from "react"
import { FileText, Upload, CheckCircle, AlertCircle, FolderOpen, Image, Copy, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { convertFileSrc } from '@tauri-apps/api/core'
import { tauriAPI } from "@/lib/tauri-api"
import { FilenameDisplay } from "@/components/ui/filename-display"
import { formatFileSizeHuman } from "@/lib/utils/format"
// 导入可复用组件
import { HistoryRecordList } from "@/components/panels/history-record-list"
import { StatCardGrid, createArticleUploadStats } from "@/components/panels/stat-card-grid"
import { OSSConfigDisplay } from "@/components/panels/oss-config-display"
import { MarkdownUploadArea } from "@/components/panels/upload-area"
import type { ScanResult, ImageReference, LinkReplacement, OSSConfig, UploadHistoryRecord } from "@/lib/types"
import { OSSProvider, UploadMode } from "@/lib/types"
import { copyToClipboardWithToast } from "@/lib/utils/copy-to-clipboard"
import { useAppState } from "@/lib/contexts/app-state-context"

interface ProcessingState {
  selectedFiles: string[]
  scanResults: ScanResult[]
  selectedImages: Set<string>
  isScanning: boolean
  isProcessing: boolean
  processingProgress: number
  error: string | null
  successMessage: string | null
  duplicateResults: Map<string, { is_duplicate: boolean; existing_url?: string }>
}

export default function ArticleUploadPage() {
  const [showImageModal, setShowImageModal] = useState(false)
  const [state, setState] = useState<ProcessingState>({
    selectedFiles: [],
    scanResults: [],
    selectedImages: new Set(),
    isScanning: false,
    isProcessing: false,
    processingProgress: 0,
    error: null,
    successMessage: null,
    duplicateResults: new Map(),
  })

  const [recentHistory, setRecentHistory] = useState<UploadHistoryRecord[]>([])

  // 使用全局应用状态获取配置
  const { state: appState } = useAppState()
  const ossConfig = appState.ossConfig

  // 延迟初始化，避免阻塞页面渲染
  React.useEffect(() => {
    if (!appState.isInitialized) {
      return
    }

    // 延迟执行非关键初始化
    const initializeWithDelay = () => {
      setTimeout(async () => {
        try {
          // 并行加载历史记录
          await loadHistoryWithFallback()
        } catch (error) {
          console.error('Critical initialization failed:', error)
        }
      }, 250) // 延迟 250ms 避免阻塞渲染
    }

    initializeWithDelay()
  }, [appState.isInitialized, ossConfig])

  // 从历史记录加载，支持备选方案
  const loadHistoryWithFallback = async () => {
    try {
      // 首先尝试加载图片历史记录
      const imageHistory = await tauriAPI.getImageHistory(UploadMode.ArticleUpload, 5)

      if (imageHistory.length > 0) {
        // 直接使用新的 UploadHistoryRecord，不需要转换
        setRecentHistory(imageHistory)
      } else {
        // 如果没有图片历史记录，从统一历史记录中筛选
        await loadHistoryFromUnified()
      }
    } catch (error) {
      console.warn('Failed to load image history, trying unified history:', error)
      // 如果图片历史加载失败，尝试从统一历史记录加载
      await loadHistoryFromUnified()
    }
  }

  // 从统一历史记录中加载文章上传模式的记录
  const loadHistoryFromUnified = async () => {
    try {
      const allHistory = await tauriAPI.getUploadHistory(1, 20) // 获取前20条

      // 从统一历史记录中筛选文章上传模式的记录
      const filteredHistory = allHistory.items.filter(record => {
        const isArticleUpload = record.upload_mode === UploadMode.ArticleUpload
        return isArticleUpload
      })

      setRecentHistory(filteredHistory.slice(0, 3)) // 只显示前3条
    } catch (error) {
      console.error('Failed to load unified history:', error)
      setRecentHistory([]) // 设置为空数组避免显示错误
    }
  }

  // 统一的历史记录刷新函数
  const refreshHistory = async () => {
    try {
      // 首先尝试从图片历史记录加载
      const imageHistory = await tauriAPI.getImageHistory(UploadMode.ArticleUpload, 3)

      if (imageHistory.length > 0) {
        // 直接使用新的 UploadHistoryRecord，不需要转换
        setRecentHistory(imageHistory)
      } else {
        // 如果没有图片历史记录，尝试从统一历史加载
        await loadHistoryFromUnified()
      }
    } catch (error) {
      console.error('Failed to refresh history:', error)
      // 尝试备选方案
      await loadHistoryFromUnified()
    }
  }

  const clearError = () => setState(prev => ({ ...prev, error: null }))
  const clearSuccess = () => setState(prev => ({ ...prev, successMessage: null }))

  const copyToClipboard = async (text: string) => {
    await copyToClipboardWithToast(text)
  }

  // Get all detected images from scan results
  const detectedImages = state.scanResults.flatMap(result => result.images).filter(img => img.exists)

  const handleFileSelection = useCallback(async () => {
    try {
      clearError()
      clearSuccess()

      // Use Tauri's file dialog to select markdown files
      const { open } = await import('@tauri-apps/plugin-dialog')

      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Markdown Files',
          extensions: ['md', 'markdown']
        }]
      })

      if (selected && Array.isArray(selected)) {
        setState(prev => ({
          ...prev,
          selectedFiles: selected,
          scanResults: [],
          selectedImages: new Set()
        }))
        // Auto-scan after file selection
        await handleScanFiles(selected)
      } else if (selected) {
        setState(prev => ({
          ...prev,
          selectedFiles: [selected],
          scanResults: [],
          selectedImages: new Set()
        }))
        // Auto-scan after file selection
        await handleScanFiles([selected])
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `Failed to select files: ${error}`
      }))
    }
  }, [])

  const handleScanFiles = useCallback(async (filesToScan?: string[]) => {
    const files = filesToScan || state.selectedFiles
    if (files.length === 0) {
      setState(prev => ({ ...prev, error: "Please select markdown files first" }))
      return
    }

    setState(prev => ({ ...prev, isScanning: true, error: null }))

    try {
      const results = await tauriAPI.scanMarkdownFiles(files)

      setState(prev => ({
        ...prev,
        scanResults: results,
        isScanning: false,
        selectedImages: new Set()
      }))

      // 在扫描完成后进行重复检查
      const allImages = results.flatMap(result => result.images).filter(img => img.exists)
      if (allImages.length > 0) {
        await checkDuplicatesForImages(allImages)
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `Failed to scan files: ${error}`,
        isScanning: false
      }))
    }
  }, [state.selectedFiles])

  // 检查图片重复的函数
  const checkDuplicatesForImages = async (images: any[]) => {
    try {
      // 获取图片路径用于重复检测
      const filePaths = images.map(img => img.absolute_path)

      // 调用后端批量重复检测
      const duplicateResults = await tauriAPI.checkDuplicatesBatch(filePaths)

      // 将结果转换为Map方便查找
      const duplicateMap = new Map()
      images.forEach((img, index) => {
        const duplicateResult = duplicateResults[index]
        duplicateMap.set(img.id, {
          is_duplicate: duplicateResult?.is_duplicate || false,
          existing_url: duplicateResult?.existing_url
        })
      })

      setState(prev => ({
        ...prev,
        duplicateResults: duplicateMap
      }))

      // 统计重复图片数量并提示用户
      const duplicateCount = duplicateResults.filter(r => r.is_duplicate).length
      if (duplicateCount > 0) {
        console.log('Found', duplicateCount, 'duplicate images')
      }
    } catch (error) {
      console.error('Duplicate check failed:', error)
      // 即使重复检查失败也不影响正常流程
    }
  }

  const handleImageSelect = (imageId: string, checked: boolean) => {
    setState(prev => {
      const newSelected = new Set(prev.selectedImages)
      if (checked) {
        newSelected.add(imageId)
      } else {
        newSelected.delete(imageId)
      }
      return { ...prev, selectedImages: newSelected }
    })
  }

  const handleSelectAll = (checked: boolean) => {
    setState(prev => {
      const allImageIds = detectedImages.map(img => img.id)
      return {
        ...prev,
        selectedImages: checked ? new Set(allImageIds) : new Set()
      }
    })
  }

  const handleUploadSelected = useCallback(async () => {
    if (state.selectedImages.size === 0) {
      setState(prev => ({ ...prev, error: "Please select images to process" }))
      return
    }

    if (!ossConfig) {
      setState(prev => ({ ...prev, error: "OSS configuration not found. Please configure storage settings first." }))
      return
    }

    setState(prev => ({ ...prev, isProcessing: true, processingProgress: 0, error: null }))

    try {
      // Step 1: Filter out duplicate images and prepare for upload
      const selectedImages = detectedImages.filter(img => {
        const isSelected = state.selectedImages.has(img.id)
        const duplicateResult = state.duplicateResults.get(img.id)
        const isDuplicate = duplicateResult?.is_duplicate || false

        if (isSelected && isDuplicate) {
          console.log(`Skipping duplicate image: ${img.original_path}`)
          return false
        }
        return isSelected
      })

      if (selectedImages.length === 0) {
        setState(prev => ({ ...prev, error: "No non-duplicate images selected for upload", isProcessing: false }))
        return
      }

      const imageData: [string, string][] = selectedImages.map(img => [img.id, img.absolute_path])
      setState(prev => ({ ...prev, processingProgress: 25 }))

      const uploadResults = await tauriAPI.uploadImagesWithIds(imageData, ossConfig)
      setState(prev => ({ ...prev, processingProgress: 50 }))

      // Step 2: Create link replacements
      const replacements: LinkReplacement[] = []

      for (const result of state.scanResults) {
        for (const image of result.images) {
          if (state.selectedImages.has(image.id)) {
            // 检查是否是重复图片
            const duplicateResult = state.duplicateResults.get(image.id)
            if (duplicateResult?.is_duplicate && duplicateResult.existing_url) {
              // 对于重复图片，使用已存在的URL进行替换
              replacements.push({
                file_path: result.file_path,
                line: image.markdown_line,
                column: image.markdown_column,
                old_link: image.original_path,
                new_link: duplicateResult.existing_url
              })
            } else {
              // 对于非重复图片，使用上传后的URL
              const uploadResult = uploadResults.find(ur => ur.image_id === image.id)
              if (uploadResult?.success && uploadResult.uploaded_url) {
                replacements.push({
                  file_path: result.file_path,
                  line: image.markdown_line,
                  column: image.markdown_column,
                  old_link: image.original_path,
                  new_link: uploadResult.uploaded_url
                })
              }
            }
          }
        }
      }

      setState(prev => ({ ...prev, processingProgress: 75 }))

      // Step 3: Replace links in markdown files
      if (replacements.length > 0) {
        await tauriAPI.replaceMarkdownLinksWithResult(replacements)
      }

      const duplicateCount = Array.from(state.selectedImages).filter(id => {
        const duplicateResult = state.duplicateResults.get(id)
        return duplicateResult?.is_duplicate
      }).length

      const uploadedCount = selectedImages.length
      const totalProcessed = replacements.length

      let successMsg = `Successfully processed ${totalProcessed} images in ${state.scanResults.length} files`
      if (duplicateCount > 0) {
        successMsg += ` (${duplicateCount} duplicates used existing URLs, ${uploadedCount} newly uploaded)`
      }

      setState(prev => ({
        ...prev,
        processingProgress: 100,
        isProcessing: false,
        successMessage: successMsg
      }))

      setShowImageModal(false)

      // 为每张成功处理的图片添加历史记录
      try {
        const imageHistoryRecords = []

        for (const replacement of replacements) {
          // 找到对应的图片信息
          const imageInfo = detectedImages.find(img =>
            img.original_path === replacement.old_link &&
            state.selectedImages.has(img.id)
          )

          if (imageInfo) {
            imageHistoryRecords.push({
              id: "", // 后端会生成
              timestamp: new Date().toISOString(),
              image_name: imageInfo.original_path.split(/[\\/]/).pop() || imageInfo.original_path,
              uploaded_url: replacement.new_link,
              upload_mode: UploadMode.ArticleUpload,
              source_file: replacement.file_path, // 来源Markdown文件
              file_size: imageInfo.size || 0,
              checksum: "" // 后端会生成或使用默认值
            })
          }
        }

        // 批量添加历史记录
        if (imageHistoryRecords.length > 0) {
          await tauriAPI.addBatchUploadHistoryRecords(imageHistoryRecords)
        }

        // 刷新历史记录显示
        await refreshHistory()
      } catch (error) {
        console.warn("Failed to save image history records:", error)
      }

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `Failed to process images: ${error}`,
        isProcessing: false,
        processingProgress: 0
      }))
    }
  }, [state.selectedImages, state.scanResults, state.selectedFiles, ossConfig])

  const totalImages = detectedImages.length
  const selectedCount = state.selectedImages.size

  return (
    <div className="p-8 space-y-6">
      {/* Error Alert */}
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
          <Button variant="ghost" size="sm" onClick={clearError} className="ml-auto">
            ×
          </Button>
        </Alert>
      )}

      {/* Success Alert */}
      {state.successMessage && (
        <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{state.successMessage}</AlertDescription>
          <Button variant="ghost" size="sm" onClick={clearSuccess} className="ml-auto">
            ×
          </Button>
        </Alert>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">文章上传</h1>
          <p className="text-gray-600 dark:text-gray-400">批量处理 Markdown 文件中的图片链接</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">上传配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* OSS 配置信息 - 使用可复用组件 */}
            <OSSConfigDisplay 
              config={ossConfig}
              showAsAlert={false}
              onConfigClick={() => window.location.href = '/storage'}
            />

            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                拖拽 Markdown 文件到此处，或点击选择文件
              </p>
              <Button
                onClick={handleFileSelection}
                disabled={state.isScanning}
              >
                {state.isScanning ? "扫描中..." : "选择 MD 文件"}
              </Button>
            </div>

            {/* Selected Files Display */}
            {state.selectedFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  已选择 {state.selectedFiles.length} 个文件:
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {state.selectedFiles.map((file, index) => (
                    <div key={index} className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scanning Progress */}
            {state.isScanning && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">正在扫描文件中的图片...</p>
                <Progress value={50} className="w-full" />
              </div>
            )}

            {/* Processing Progress */}
            {state.isProcessing && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">正在处理图片...</p>
                <Progress value={state.processingProgress} className="w-full" />
              </div>
            )}

            {/* Detected Images */}
            {detectedImages.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">检测到的图片 ({detectedImages.length})</h4>
                  <Button
                    onClick={() => setShowImageModal(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={state.isProcessing || !ossConfig}
                  >
                    选择上传
                  </Button>
                </div>
                <div className="space-y-2">
                  {detectedImages.slice(0, 2).map((image) => (
                    <div
                      key={image.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <div className="flex-1 min-w-0">
                          <FilenameDisplay
                            filePath={image.original_path}
                            className="text-sm"
                            maxLength={50}
                            showFullPath={true}
                          />
                        </div>
                      </div>
                      <Badge variant="secondary">本地</Badge>
                    </div>
                  ))}
                  {detectedImages.length > 2 && (
                    <div className="text-center py-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowImageModal(true)}>
                        查看全部 {detectedImages.length} 张图片
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 扫描结果统计 - 使用可复用组件 */}
            {state.scanResults.length > 0 && (
              <StatCardGrid 
                stats={createArticleUploadStats({
                  fileCount: state.scanResults.length,
                  imageCount: detectedImages.length,
                  selectedCount: selectedCount,
                  missingCount: state.scanResults.flatMap(r => r.images).length - detectedImages.length
                })}
                columns={{ default: 2, md: 4 }}
                gap="md"
                className="mt-4"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 历史记录 - 使用可复用组件 */}
      <HistoryRecordList
        records={recentHistory}
        title="最近上传记录"
        onCopyLink={copyToClipboard}
        maxFileNameLength={25}
        emptyStateText="暂无上传记录"
      />

      <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>选择要上传的图片</DialogTitle>
            <DialogDescription>从检测到的 {detectedImages.length} 张图片中选择需要上传的图片</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all"
                checked={selectedCount === detectedImages.length && detectedImages.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all" className="text-sm font-medium">
                全选 ({selectedCount}/{detectedImages.length})
              </label>
            </div>

            <ScrollArea className="h-96">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-4">
                {detectedImages.map((image) => {
                  const duplicateResult = state.duplicateResults.get(image.id)
                  const isDuplicate = duplicateResult?.is_duplicate || false

                  return (
                    <div key={image.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`image-${image.id}`}
                          checked={state.selectedImages.has(image.id)}
                          onCheckedChange={(checked) => handleImageSelect(image.id, checked as boolean)}
                        />
                        <div className="flex-1 min-w-0">
                          {image.exists && (
                            <img
                              src={convertFileSrc(image.absolute_path)}
                              alt={image.original_path}
                              className="w-full h-32 object-cover rounded mb-2"
                            />
                          )}
                          <div className="space-y-1">
                            <FilenameDisplay
                              filePath={image.original_path}
                              className="text-sm font-medium"
                              maxLength={30}
                              showTooltip={true}
                            />
                            <p className="text-xs text-gray-500">
                              大小: {formatFileSizeHuman(image.size || 0)}
                            </p>
                            {isDuplicate && (
                              <div className="flex items-center gap-1">
                                <Badge variant="secondary" className="text-xs">重复文件</Badge>
                                <span className="text-xs text-gray-500">将使用已有链接</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImageModal(false)}>
              取消
            </Button>
            <Button
              onClick={handleUploadSelected}
              disabled={state.isProcessing || selectedCount === 0}
            >
              {state.isProcessing ? "处理中..." : `上传选中的图片 (${selectedCount})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
