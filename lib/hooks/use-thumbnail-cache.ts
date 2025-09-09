/**
 * 缩略图缓存管理 Hook
 * 提供缓存统计、清理和预加载功能
 */

import { useState, useEffect, useCallback } from 'react'
import { thumbnailCache, type CacheStats } from '@/lib/utils/thumbnail-cache'
import { thumbnailOperations } from '@/lib/tauri-api'
import type { UploadHistoryRecord } from '@/lib/types'

export interface UseThumbnailCacheOptions {
  enablePeriodicCleanup?: boolean
  cleanupInterval?: number // 毫秒
  enableAutoPreload?: boolean
  preloadThreshold?: number // 预加载阈值（记录数）
}

export interface ThumbnailCacheHookResult {
  stats: CacheStats
  clearCache: () => void
  preloadThumbnails: (records: UploadHistoryRecord[]) => Promise<void>
  cleanupBackendCache: () => Promise<number>
  isPreloading: boolean
  preloadProgress: number
}

/**
 * 缩略图缓存管理 Hook
 */
export function useThumbnailCache(
  options: UseThumbnailCacheOptions = {}
): ThumbnailCacheHookResult {
  const {
    enablePeriodicCleanup = true,
    cleanupInterval = 10 * 60 * 1000, // 10分钟
    enableAutoPreload = true,
    preloadThreshold = 20,
  } = options

  const [stats, setStats] = useState<CacheStats>(() => thumbnailCache.getCacheStats())
  const [isPreloading, setIsPreloading] = useState(false)
  const [preloadProgress, setPreloadProgress] = useState(0)

  // 更新统计信息
  const updateStats = useCallback(() => {
    setStats(thumbnailCache.getCacheStats())
  }, [])

  // 清理前端缓存
  const clearCache = useCallback(() => {
    thumbnailCache.clearCache()
    updateStats()
  }, [updateStats])

  // 清理后端缓存
  const cleanupBackendCache = useCallback(async () => {
    try {
      const cleanedCount = await thumbnailOperations.cleanupThumbnailCache()
      console.log(`清理了 ${cleanedCount} 个后端缓存文件`)
      return cleanedCount
    } catch (error) {
      console.error('清理后端缓存失败:', error)
      throw error
    }
  }, [])

  // 预加载缩略图
  const preloadThumbnails = useCallback(async (records: UploadHistoryRecord[]) => {
    if (records.length === 0) return

    setIsPreloading(true)
    setPreloadProgress(0)

    try {
      const total = records.length
      let completed = 0

      // 分批预加载，避免一次性加载太多
      const batchSize = 3 // 减少批次大小
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize)
        
        const promises = batch.map(async (record) => {
          try {
            await thumbnailCache.getThumbnail(
              record.id,
              record.uploaded_url,
              thumbnailOperations.getThumbnail,
              {
                timeout: 8000, // 预加载时使用更长的超时时间
                maxRetries: 2,
                retryDelay: 500,
              }
            )
            completed++
            setPreloadProgress((completed / total) * 100)
          } catch (error) {
            // 预加载失败不影响整体流程
            console.warn(`预加载缩略图失败 ${record.id}:`, error)
            completed++
            setPreloadProgress((completed / total) * 100)
          }
        })

        await Promise.allSettled(promises)
        
        // 批次间稍作延迟，避免过度占用资源
        if (i + batchSize < records.length) {
          await new Promise(resolve => setTimeout(resolve, 300)) // 增加延迟到300ms
        }
      }

      updateStats()
    } finally {
      setIsPreloading(false)
      setPreloadProgress(0)
    }
  }, [updateStats])

  // 定期更新统计信息
  useEffect(() => {
    const interval = setInterval(updateStats, 5000) // 每5秒更新一次
    return () => clearInterval(interval)
  }, [updateStats])

  // 定期清理
  useEffect(() => {
    if (!enablePeriodicCleanup) return

    const cleanup = async () => {
      try {
        // 清理前端过期缓存（由缓存管理器自动处理）
        
        // 清理后端缓存
        const cleanedCount = await cleanupBackendCache()
        if (cleanedCount > 0) {
          console.log(`定期清理：清理了 ${cleanedCount} 个后端缓存文件`)
        }
      } catch (error) {
        console.error('定期清理失败:', error)
      }
    }

    const interval = setInterval(cleanup, cleanupInterval)
    return () => clearInterval(interval)
  }, [enablePeriodicCleanup, cleanupInterval, cleanupBackendCache])

  // 自动预加载
  useEffect(() => {
    if (!enableAutoPreload) return

    // 监听页面可见性变化，当页面变为可见时触发预加载
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && stats.size < preloadThreshold) {
        // 可以在这里触发预加载逻辑
        // 但需要从外部传入记录数据，所以这里只是一个占位符
        console.log('页面变为可见，可以考虑预加载缩略图')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [enableAutoPreload, preloadThreshold, stats.size])

  return {
    stats,
    clearCache,
    preloadThumbnails,
    cleanupBackendCache,
    isPreloading,
    preloadProgress,
  }
}

/**
 * 简化版的缓存统计 Hook
 */
export function useThumbnailCacheStats(): CacheStats {
  const [stats, setStats] = useState<CacheStats>(() => thumbnailCache.getCacheStats())

  useEffect(() => {
    const updateStats = () => setStats(thumbnailCache.getCacheStats())
    const interval = setInterval(updateStats, 3000) // 每3秒更新一次
    return () => clearInterval(interval)
  }, [])

  return stats
}