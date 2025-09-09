"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { thumbnailOperations } from "@/lib/tauri-api"
import { thumbnailCache } from "@/lib/utils/thumbnail-cache"
import type { UploadHistoryRecord } from "@/lib/types"
import { ImageIcon, Loader2, AlertCircle, RotateCcw } from "lucide-react"
import { Button } from "./button"

export interface ThumbnailImageProps {
  record: UploadHistoryRecord
  size?: number
  className?: string
  lazy?: boolean
  onClick?: () => void
}

interface ThumbnailImageState {
  src: string | null
  loading: boolean
  error: boolean
  inView: boolean
}

const ThumbnailImage = React.forwardRef<HTMLDivElement, ThumbnailImageProps>(
  ({ record, size = 200, className, lazy = true, onClick }, ref) => {
    const [state, setState] = React.useState<ThumbnailImageState>({
      src: null,
      loading: false,
      error: false,
      inView: false,
    })

    const containerRef = React.useRef<HTMLDivElement>(null)
    const observerRef = React.useRef<IntersectionObserver | null>(null)

    // 懒加载逻辑
    React.useEffect(() => {
      if (!lazy) {
        setState(prev => ({ ...prev, inView: true }))
        return
      }

      if (!containerRef.current) return

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const [entry] = entries
          if (entry.isIntersecting) {
            setState(prev => ({ ...prev, inView: true }))
            // 一旦进入视口就停止观察
            if (observerRef.current && containerRef.current) {
              observerRef.current.unobserve(containerRef.current)
            }
          }
        },
        {
          rootMargin: '50px', // 提前50px开始加载
          threshold: 0.1,
        }
      )

      observerRef.current.observe(containerRef.current)

      return () => {
        if (observerRef.current) {
          observerRef.current.disconnect()
        }
      }
    }, [lazy])

    // 加载缩略图
    const loadThumbnail = React.useCallback(async () => {
      if (!state.inView || state.loading || state.src) return

      setState(prev => ({ ...prev, loading: true, error: false }))

      try {
        // 使用缓存管理器加载缩略图
        const base64Data = await thumbnailCache.getThumbnail(
          record.id,
          record.uploaded_url,
          thumbnailOperations.getThumbnail,
          {
            timeout: 8000, // 增加超时到8秒
            maxRetries: 2, // 减少重试次数，避免阻塞太久
            retryDelay: 500, // 减少重试延迟
          }
        )
        
        setState(prev => ({
          ...prev,
          src: `data:image/jpeg;base64,${base64Data}`,
          loading: false,
          error: false,
        }))
      } catch (error) {
        console.error('Failed to load thumbnail:', error)
        setState(prev => ({
          ...prev,
          loading: false,
          error: true,
        }))
      }
    }, [state.inView, state.loading, state.src, record.id, record.uploaded_url])

    // 重试加载
    const retryLoad = React.useCallback(() => {
      setState(prev => ({ ...prev, src: null, error: false }))
      loadThumbnail()
    }, [loadThumbnail])

    // 当进入视口时开始加载
    React.useEffect(() => {
      if (state.inView && !state.src && !state.loading && !state.error) {
        loadThumbnail()
      }
    }, [state.inView, state.src, state.loading, state.error, loadThumbnail])

    return (
      <div
        ref={containerRef}
        className={cn(
          "relative overflow-hidden rounded-lg border bg-muted flex items-center justify-center w-full",
          onClick && "cursor-pointer hover:opacity-80 transition-opacity",
          className
        )}
        onClick={onClick}
        style={{ minHeight: '180px' }}
      >
        {/* 加载状态 */}
        {state.loading && (
          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">加载中...</span>
          </div>
        )}

        {/* 错误状态 */}
        {state.error && (
          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground p-2">
            <AlertCircle className="h-6 w-6" />
            <span className="text-xs text-center">加载失败</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                retryLoad()
              }}
              className="h-6 px-2 text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              重试
            </Button>
          </div>
        )}

        {/* 占位符状态 */}
        {!state.inView && lazy && (
          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
            <span className="text-xs">图片</span>
          </div>
        )}

        {/* 成功加载的图片 */}
        {state.src && (
          <img
            src={state.src}
            alt={record.image_name}
            className="w-full h-auto object-cover rounded-lg"
            style={{ 
              minHeight: '180px',
              maxHeight: '400px',
              objectFit: 'cover'
            }}
            onError={() => {
              setState(prev => ({ ...prev, error: true, src: null }))
            }}
          />
        )}


      </div>
    )
  }
)

ThumbnailImage.displayName = "ThumbnailImage"

export { ThumbnailImage }