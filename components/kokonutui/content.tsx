"use client"

import React, { useState, useCallback, useEffect } from "react"
import { FileText, Upload, CheckCircle, AlertCircle, FolderOpen, Image, Copy } from "lucide-react"
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
import { historyOperations } from "@/lib/tauri-api"
import { FilenameDisplay } from "@/components/ui/filename-display"
import { formatFileSizeHuman } from "@/lib/utils/format"
import type { ScanResult, ImageReference, LinkReplacement, OSSConfig, HistoryRecord } from "@/lib/types"
import { useSystemHealth } from "@/lib/hooks/use-progress-monitoring"
import { SystemHealthMonitor, SystemHealthIndicator } from "@/components/ui/system-health-monitor"

interface ProcessingState {
  selectedFiles: string[]
  scanResults: ScanResult[]
  selectedImages: Set<string>
  isScanning: boolean
  isProcessing: boolean
  processingProgress: number
  error: string | null
  successMessage: string | null
}

export default function Content() {
  const [showImageModal, setShowImageModal] = useState(false)
  const [showHealthModal, setShowHealthModal] = useState(false)
  const [state, setState] = useState<ProcessingState>({
    selectedFiles: [],
    scanResults: [],
    selectedImages: new Set(),
    isScanning: false,
    isProcessing: false,
    processingProgress: 0,
    error: null,
    successMessage: null,
  })

  const [ossConfig, setOssConfig] = useState<OSSConfig | null>(null)
  const [recentHistory, setRecentHistory] = useState<HistoryRecord[]>([])
  const { health, isLoading: healthLoading, refreshHealth } = useSystemHealth()

  // Load OSS config and recent history on component mount
  React.useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await tauriAPI.loadOSSConfig()
        setOssConfig(config)
      } catch (error) {
        console.error("Failed to load OSS config:", error)
      }
    }
    
    const loadRecentHistory = async () => {
      try {
        // 获取最近3条成功的文章上传记录 (operation = "replace")
        const result = await historyOperations.searchHistory(
          undefined, // searchTerm
          "replace", // operationType
          true, // successOnly
          undefined, // startDate
          undefined, // endDate
          1, // page
          3 // pageSize
        )
        setRecentHistory(result.items || [])
      } catch (error) {
        console.error("Failed to load recent history:", error)
      }
    }
    
    loadConfig()
    loadRecentHistory()
  }, [])

  const clearError = () => setState(prev => ({ ...prev, error: null }))
  const clearSuccess = () => setState(prev => ({ ...prev, successMessage: null }))

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // 可以在这里添加 toast 提示
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
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
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: `Failed to scan files: ${error}`,
        isScanning: false
      }))
    }
  }, [state.selectedFiles])

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
      // Step 1: Upload selected images
      const selectedImages = detectedImages.filter(img => state.selectedImages.has(img.id))
      const selectedImagePaths = selectedImages.map(img => img.absolute_path)
      setState(prev => ({ ...prev, processingProgress: 25 }))

      const uploadResults = await tauriAPI.uploadImages(selectedImagePaths, ossConfig)
      setState(prev => ({ ...prev, processingProgress: 50 }))

      // Step 2: Create link replacements
      const replacements: LinkReplacement[] = []

      for (const result of state.scanResults) {
        for (const image of result.images) {
          if (state.selectedImages.has(image.id)) {
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

      setState(prev => ({ ...prev, processingProgress: 75 }))

      // Step 3: Replace links in markdown files
      if (replacements.length > 0) {
        await tauriAPI.replaceMarkdownLinksWithResult(replacements)
      }

      setState(prev => ({
        ...prev,
        processingProgress: 100,
        isProcessing: false,
        successMessage: `Successfully processed ${replacements.length} images in ${state.scanResults.length} files`
      }))

      setShowImageModal(false)

      // Add to history
      await tauriAPI.addHistoryRecord(
        "replace",
        state.selectedFiles,
        state.selectedImages.size,
        true,
        undefined,
        undefined,
        undefined,
        undefined
      )

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
    <div className="space-y-6">
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

      {/* System Health Indicator */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <SystemHealthIndicator 
          health={health} 
          onClick={() => setShowHealthModal(true)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              文章上传模式
            </CardTitle>
            <CardDescription>选择 Markdown 文件，自动检测并上传本地图片到对象存储</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

              {/* OSS Configuration Status */}
              {!ossConfig && detectedImages.length > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    未找到 OSS 配置。请先在存储配置页面配置您的对象存储设置。
                  </AlertDescription>
                </Alert>
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

              {/* Scan Results Summary */}
              {state.scanResults.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <FileText className="h-6 w-6 mx-auto text-blue-500 mb-1" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">文件</p>
                    <p className="text-lg font-bold text-blue-600">{state.scanResults.length}</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <Image className="h-6 w-6 mx-auto text-green-500 mb-1" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">图片</p>
                    <p className="text-lg font-bold text-green-600">{detectedImages.length}</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <CheckCircle className="h-6 w-6 mx-auto text-purple-500 mb-1" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">已选择</p>
                    <p className="text-lg font-bold text-purple-600">{selectedCount}</p>
                  </div>
                  <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <AlertCircle className="h-6 w-6 mx-auto text-orange-500 mb-1" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">缺失</p>
                    <p className="text-lg font-bold text-orange-600">
                      {state.scanResults.flatMap(r => r.images).length - detectedImages.length}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
      </div>

      {/* Recent Upload History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">最近上传记录</CardTitle>
          <CardDescription>显示最近的文章上传记录</CardDescription>
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
                      <p className="text-xs text-gray-500">
                        {new Date(record.timestamp).toLocaleString()}
                      </p>
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
                        onClick={() => copyToClipboard(record.metadata.uploaded_url)}
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
                <Image className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>暂无上传记录</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最近上传记录</CardTitle>
          <CardDescription>显示最近上传的图片和处理状态</CardDescription>
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
                      <p className="text-xs text-gray-500">
                        {new Date(record.timestamp).toLocaleString()}
                      </p>
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
                        onClick={() => copyToClipboard(record.metadata.uploaded_url)}
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
                <Image className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>暂无上传记录</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
                {detectedImages.map((image) => (
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
                            alt="Image preview"
                            className="w-full h-32 object-cover rounded-md mb-2"
                            onError={(e) => {
                              // 如果加载失败，隐藏图片
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                        <div className="space-y-1">
                          <FilenameDisplay 
                            filePath={image.original_path}
                            className="font-medium text-sm"
                            maxLength={35}
                            showTooltip={true}
                          />
                          <div className="text-xs text-gray-500">
                            <FilenameDisplay 
                              filePath={image.original_path}
                              className=""
                              maxLength={35}
                              showFullPath={true}
                              showTooltip={true}
                            />
                          </div>
                          <p className="text-xs text-gray-500">
                            Line {image.markdown_line}, Col {image.markdown_column}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">
                              {image.exists ? formatFileSizeHuman(image.size) : "File not found"}
                            </span>
                            <Badge variant={image.exists ? "default" : "destructive"}>
                              {image.exists ? "可用" : "缺失"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImageModal(false)}>
              取消
            </Button>
            <Button
              onClick={handleUploadSelected}
              disabled={selectedCount === 0 || state.isProcessing || !ossConfig}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {state.isProcessing ? "处理中..." : `上传选中的图片 (${selectedCount})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* System Health Modal */}
      <Dialog open={showHealthModal} onOpenChange={setShowHealthModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>System Health Monitor</DialogTitle>
            <DialogDescription>
              Monitor system performance and health status
            </DialogDescription>
          </DialogHeader>
          
          <SystemHealthMonitor
            health={health}
            isLoading={healthLoading}
            onRefresh={refreshHealth}
          />
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHealthModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
