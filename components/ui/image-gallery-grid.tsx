"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ThumbnailImage } from "./thumbnail-image"
import { useThumbnailCache } from "@/lib/hooks/use-thumbnail-cache"
import type { UploadHistoryRecord } from "@/lib/types"
import { Loader2, ImageIcon } from "lucide-react"

export interface ImageGalleryGridProps {
  records: UploadHistoryRecord[]
  loading?: boolean
  onImageClick?: (record: UploadHistoryRecord) => void
  className?: string
}

export interface ImageGalleryItemProps {
  record: UploadHistoryRecord
  onClick?: () => void
  className?: string
}

const ImageGalleryItem = React.forwardRef<HTMLDivElement, ImageGalleryItemProps>(
  ({ record, onClick, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "group relative overflow-hidden rounded-lg border bg-card transition-all duration-200",
          "hover:shadow-md hover:border-primary/20",
          onClick && "cursor-pointer",
          className
        )}
        onClick={onClick}
      >
        {/* 缩略图容器 - 自适应高度 */}
        <div className="relative">
          <ThumbnailImage
            record={record}
            size={280}
            lazy={true}
            onClick={onClick}
            className="w-full border-0 rounded-t-lg"
          />
        </div>
        
        {/* 图片信息区域 - 固定在底部 */}
        <div className="p-3 bg-card border-t">
          <div className="text-foreground">
            <div className="text-sm font-medium truncate mb-1">
              {record.image_name}
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>{formatFileSize(record.file_size)}</span>
              <span>{formatUploadMode(record.upload_mode)}</span>
            </div>
          </div>
        </div>

        {/* 悬停效果 */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-200 pointer-events-none rounded-lg" />
      </div>
    )
  }
)

ImageGalleryItem.displayName = "ImageGalleryItem"

const ImageGalleryGrid = React.forwardRef<HTMLDivElement, ImageGalleryGridProps>(
  ({ records, loading = false, onImageClick, className }, ref) => {
    const { preloadThumbnails, isPreloading, preloadProgress } = useThumbnailCache({
      enableAutoPreload: true,
      preloadThreshold: 10,
    })

    const handleImageClick = React.useCallback(
      (record: UploadHistoryRecord) => {
        onImageClick?.(record)
      },
      [onImageClick]
    )

    // 当记录加载完成后，预加载缩略图
    React.useEffect(() => {
      if (records.length > 0 && !loading) {
        // 延迟预加载，让首屏渲染先完成
        const timer = setTimeout(() => {
          preloadThumbnails(records)
        }, 500)
        
        return () => clearTimeout(timer)
      }
    }, [records, loading, preloadThumbnails])

    // 加载状态
    if (loading) {
      return (
        <div
          ref={ref}
          className={cn(
            "flex items-center justify-center min-h-[500px]",
            className
          )}
        >
          <div className="flex flex-col items-center gap-6 text-muted-foreground">
            <div className="relative">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-medium text-foreground">正在加载图片</p>
              <p className="text-sm">请稍候，正在获取您的图片记录...</p>
            </div>
            {/* 加载骨架屏预览 */}
            <div 
              className="w-full gap-4 mt-8"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'
              }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-muted rounded-lg animate-pulse"
                  style={{
                    animationDelay: `${i * 100}ms`,
                    animationDuration: '1.5s'
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )
    }

    // 空状态
    if (!records || records.length === 0) {
      return (
        <div
          ref={ref}
          className={cn(
            "flex items-center justify-center min-h-[500px]",
            className
          )}
        >
          <div className="flex flex-col items-center gap-6 text-muted-foreground max-w-md text-center">
            <div className="relative">
              <ImageIcon className="h-16 w-16 text-muted-foreground/40" />
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                <span className="text-xs text-muted-foreground">0</span>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-xl font-semibold text-foreground">还没有上传记录</h3>
              <div className="space-y-2 text-sm">
                <p>您还没有上传任何图片。开始上传图片来创建您的第一条记录吧！</p>
                <div className="flex flex-col gap-1 text-xs">
                  <span>• 支持拖拽上传多张图片</span>
                  <span>• 支持 Markdown 文章中的图片处理</span>
                  <span>• 自动生成缩略图便于浏览</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => window.location.href = '/image-upload'}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                上传图片
              </button>
              <button
                onClick={() => window.location.href = '/article-upload'}
                className="px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-accent transition-colors"
              >
                处理文章
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div
        ref={ref}
        className={cn(
          "w-full gap-4",
          className
        )}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gridAutoRows: 'min-content',
          alignItems: 'start'
        }}
      >
        {records.map((record) => (
          <ImageGalleryItem
            key={record.id}
            record={record}
            onClick={() => handleImageClick(record)}
            className="transition-transform duration-200 hover:scale-[1.02] w-full"
          />
        ))}
      </div>
    )
  }
)

ImageGalleryGrid.displayName = "ImageGalleryGrid"

// 工具函数
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatUploadMode(mode: string): string {
  switch (mode) {
    case 'ImageUpload':
      return '图片上传'
    case 'ArticleUpload':
      return '文章上传'
    default:
      return mode
  }
}

export { ImageGalleryGrid, ImageGalleryItem }