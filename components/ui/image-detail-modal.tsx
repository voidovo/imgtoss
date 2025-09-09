"use client"

import React, { useState, useEffect } from "react"
import { X, Copy, Calendar, FileImage, Upload, Download, ExternalLink } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog"
import { Button } from "./button"
import { Badge } from "./badge"
import { Separator } from "./separator"
import { copyImageUrlToClipboard } from "@/lib/utils/copy-to-clipboard"
import { formatFileSize, formatDateTime, formatRelativeTime } from "@/lib/utils/format"
import type { UploadHistoryRecord, UploadMode } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface ImageDetailModalProps {
  record: UploadHistoryRecord | null
  open: boolean
  onClose: () => void
  className?: string
}

export function ImageDetailModal({ record, open, onClose, className }: ImageDetailModalProps) {
  const [imageLoading, setImageLoading] = useState(true)
  const [imageError, setImageError] = useState(false)

  // 重置图片加载状态当记录改变时
  useEffect(() => {
    if (record) {
      setImageLoading(true)
      setImageError(false)
    }
  }, [record])

  // ESC键关闭模态框
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        onClose()
      }
    }

    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      // 防止背景滚动
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [open, onClose])

  const handleImageLoad = () => {
    setImageLoading(false)
    setImageError(false)
  }

  const handleImageError = () => {
    setImageLoading(false)
    setImageError(true)
  }

  const handleCopyLink = async () => {
    if (record?.uploaded_url) {
      await copyImageUrlToClipboard(record.uploaded_url)
    }
  }

  const getUploadModeLabel = (mode: UploadMode): string => {
    switch (mode) {
      case 'ImageUpload':
        return "图片上传"
      case 'ArticleUpload':
        return "文章上传"
      default:
        return "未知模式"
    }
  }

  const getUploadModeVariant = (mode: UploadMode): "default" | "secondary" | "destructive" | "outline" => {
    switch (mode) {
      case 'ImageUpload':
        return "default"
      case 'ArticleUpload':
        return "secondary"
      default:
        return "outline"
    }
  }

  if (!record) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className={cn(
          "max-w-4xl max-h-[90vh] overflow-hidden p-0",
          className
        )}
        // 点击遮罩关闭
        onPointerDownOutside={onClose}
      >
        <div className="flex flex-col h-full">
          {/* 头部 */}
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-semibold truncate pr-4">
                {record.image_name}
              </DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 shrink-0"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">关闭</span>
              </Button>
            </div>
          </DialogHeader>

          {/* 内容区域 */}
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
              {/* 图片显示区域 */}
              <div className="lg:col-span-2">
                <div className="relative bg-muted rounded-lg overflow-hidden">
                  <div className="aspect-video flex items-center justify-center min-h-[300px]">
                    {imageLoading && (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        <span className="text-sm">加载中...</span>
                      </div>
                    )}
                    
                    {imageError && (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileImage className="h-12 w-12" />
                        <span className="text-sm">图片加载失败</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setImageError(false)
                            setImageLoading(true)
                          }}
                        >
                          重试
                        </Button>
                      </div>
                    )}

                    {!imageError && (
                      <img
                        src={record.uploaded_url}
                        alt={record.image_name}
                        className={cn(
                          "max-w-full max-h-full object-contain transition-opacity duration-200",
                          imageLoading ? "opacity-0" : "opacity-100"
                        )}
                        onLoad={handleImageLoad}
                        onError={handleImageError}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* 元数据信息区域 */}
              <div className="space-y-6">
                {/* 基本信息 */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-base">基本信息</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <FileImage className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">文件名:</span>
                      <span className="text-sm font-mono truncate" title={record.image_name}>
                        {record.image_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Download className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">文件大小:</span>
                      <span className="text-sm">{formatFileSize(record.file_size)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">上传模式:</span>
                      <Badge variant={getUploadModeVariant(record.upload_mode)}>
                        {getUploadModeLabel(record.upload_mode)}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">上传时间:</span>
                      <div className="flex flex-col">
                        <span className="text-sm">{formatDateTime(record.timestamp)}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(record.timestamp)}
                        </span>
                      </div>
                    </div>

                    {record.source_file && (
                      <div className="flex items-start gap-2">
                        <FileImage className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span className="text-sm text-muted-foreground">来源文件:</span>
                        <span className="text-sm font-mono break-all" title={record.source_file}>
                          {record.source_file}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* 技术信息 */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-base">技术信息</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <span className="text-sm text-muted-foreground">云端链接:</span>
                      <span className="text-sm font-mono break-all text-blue-600 dark:text-blue-400">
                        {record.uploaded_url}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">校验和:</span>
                      <span className="text-sm font-mono text-muted-foreground">
                        {record.checksum.substring(0, 16)}...
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">记录ID:</span>
                      <span className="text-sm font-mono text-muted-foreground">
                        {record.id}
                      </span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* 操作按钮 */}
                <div className="space-y-3">
                  <Button
                    onClick={handleCopyLink}
                    className="w-full"
                    variant="default"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    复制链接
                  </Button>

                  <Button
                    onClick={() => window.open(record.uploaded_url, '_blank')}
                    className="w-full"
                    variant="outline"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    在新窗口打开
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}