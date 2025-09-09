"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Download, Trash2, Grid3X3, List, RefreshCw, HardDrive, Gauge } from "lucide-react"
import { tauriAPI } from "@/lib/tauri-api"
import { UploadHistoryRecord } from "@/lib/types"
import { ImageGalleryGrid } from "@/components/ui/image-gallery-grid"
import { ImageDetailModal } from "@/components/ui/image-detail-modal"
import { useThumbnailCache } from "@/lib/hooks/use-thumbnail-cache"

export default function HistoryPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [records, setRecords] = useState<UploadHistoryRecord[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [selectedRecord, setSelectedRecord] = useState<UploadHistoryRecord | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [viewMode, setViewMode] = useState<'gallery' | 'list'>('gallery')
  const [showCacheStats, setShowCacheStats] = useState(false)
  const pageSize = 40 // 调整为每页40条记录（4列×10行）

  // 缓存管理
  const { 
    stats, 
    clearCache, 
    cleanupBackendCache, 
    isPreloading, 
    preloadProgress 
  } = useThumbnailCache({
    enablePeriodicCleanup: true,
    cleanupInterval: 10 * 60 * 1000, // 10分钟
  })

  // 加载历史记录
  const loadHistory = async (page = 1) => {
    try {
      setLoading(true)
      setError(null)
      
      const result = await tauriAPI.searchHistory(
        undefined, // searchTerm
        undefined, // uploadMode
        undefined, // startDate
        undefined, // endDate
        page,
        pageSize
      )
      
      setRecords(result.items)
      setTotalRecords(result.total)
      setCurrentPage(page)
    } catch (err) {
      console.error('Failed to load history:', err)
      setError(`加载历史记录失败: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  // 初始加载
  useEffect(() => {
    loadHistory()
  }, [])

  // 处理图片点击
  const handleImageClick = (record: UploadHistoryRecord) => {
    setSelectedRecord(record)
    setShowDetailModal(true)
  }

  // 关闭详情模态框
  const handleCloseModal = () => {
    setShowDetailModal(false)
    setSelectedRecord(null)
  }

  // 切换视图模式
  const toggleViewMode = () => {
    setViewMode(viewMode === 'gallery' ? 'list' : 'gallery')
  }

  // 刷新历史记录
  const handleRefresh = () => {
    setError(null)
    loadHistory(currentPage)
  }

  // 清空历史记录
  const handleClearHistory = async () => {
    if (!confirm('确定要清空所有历史记录吗？此操作不可撤销。')) {
      return
    }
    
    try {
      setError(null)
      await tauriAPI.clearImageHistory()
      setRecords([])
      setTotalRecords(0)
      setCurrentPage(1)
      // 关闭可能打开的详情模态框
      setShowDetailModal(false)
      setSelectedRecord(null)
      // 清理缓存
      clearCache()
    } catch (err) {
      console.error('Failed to clear history:', err)
      setError(`清空历史记录失败: ${err}`)
    }
  }

  // 清理缓存
  const handleClearCache = async () => {
    if (!confirm('确定要清理缩略图缓存吗？这将删除所有本地缓存的缩略图。')) {
      return
    }
    
    try {
      setError(null)
      // 清理前端缓存
      clearCache()
      // 清理后端缓存
      const cleanedCount = await cleanupBackendCache()
      alert(`缓存清理完成！清理了 ${cleanedCount} 个缓存文件。`)
    } catch (err) {
      console.error('Failed to clear cache:', err)
      setError(`清理缓存失败: ${err}`)
    }
  }

  // 格式化文件大小
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // 导出历史记录
  const handleExportHistory = async () => {
    try {
      await tauriAPI.exportHistoryToFile()
    } catch (err) {
      console.error('Failed to export history:', err)
      setError(`导出历史记录失败: ${err}`)
    }
  }



  // 分页控制
  const totalPages = Math.ceil(totalRecords / pageSize)
  const hasNextPage = currentPage < totalPages
  const hasPrevPage = currentPage > 1

  const handleNextPage = async () => {
    if (hasNextPage && !loading) {
      await loadHistory(currentPage + 1)
    }
  }

  const handlePrevPage = async () => {
    if (hasPrevPage && !loading) {
      await loadHistory(currentPage - 1)
    }
  }

  const handlePageJump = async (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage && !loading) {
      await loadHistory(page)
    }
  }

  // 初始加载状态
  if (loading && records.length === 0) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">历史记录</h1>
            <p className="text-muted-foreground mt-1">管理和查看所有上传的文件记录</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-16">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-6 text-primary" />
              <div className="space-y-2">
                <p className="text-lg font-medium">正在加载历史记录</p>
                <p className="text-sm text-muted-foreground">请稍候，正在获取您的上传记录...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-none w-full">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">历史记录</h1>
          <p className="text-muted-foreground mt-1">管理和查看所有上传的文件记录</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button variant="outline" onClick={toggleViewMode}>
            {viewMode === 'gallery' ? (
              <>
                <List className="h-4 w-4 mr-2" />
                列表视图
              </>
            ) : (
              <>
                <Grid3X3 className="h-4 w-4 mr-2" />
                画廊视图
              </>
            )}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setShowCacheStats(!showCacheStats)}
            className={showCacheStats ? 'bg-accent' : ''}
          >
            <Gauge className="h-4 w-4 mr-2" />
            缓存统计
          </Button>
          <Button variant="outline" onClick={handleClearCache}>
            <HardDrive className="h-4 w-4 mr-2" />
            清理缓存
          </Button>
          <Button variant="outline" onClick={handleExportHistory}>
            <Download className="h-4 w-4 mr-2" />
            导出
          </Button>
          <Button variant="destructive" onClick={handleClearHistory}>
            <Trash2 className="h-4 w-4 mr-2" />
            清空
          </Button>
        </div>
      </div>

      {/* 缓存统计面板 */}
      {showCacheStats && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardHeader>
            <CardTitle className="text-blue-800 dark:text-blue-200 flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              缓存统计信息
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {stats.size}
                </div>
                <div className="text-sm text-muted-foreground">缓存项数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatBytes(stats.memoryUsage)}
                </div>
                <div className="text-sm text-muted-foreground">内存使用</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {(stats.hitRate * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">命中率</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {stats.totalRequests}
                </div>
                <div className="text-sm text-muted-foreground">总请求数</div>
              </div>
            </div>
            {isPreloading && (
              <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    预加载进度
                  </span>
                  <span className="text-sm text-blue-600 dark:text-blue-400">
                    {preloadProgress.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                  <div 
                    className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${preloadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 错误提示 */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <div className="text-red-600 dark:text-red-400">
                  <svg className="h-5 w-5 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-red-800 dark:text-red-200">加载失败</p>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadHistory(currentPage)}
                disabled={loading}
                className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '重试'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 历史记录内容 */}
      <Card className="w-full max-w-none">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>历史记录</span>
              {totalRecords > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({totalRecords} 条)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>加载中</span>
                </div>
              )}
              {viewMode === 'gallery' && totalRecords > 0 && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  画廊模式
                </span>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          {viewMode === 'gallery' ? (
            <ImageGalleryGrid
              records={records}
              loading={loading && records.length === 0}
              onImageClick={handleImageClick}
              className="min-h-[400px] w-full max-w-none"
            />
          ) : (
            // 保留原有的列表视图作为备选
            <div className="text-center py-12">
              <p className="text-muted-foreground">列表视图功能待实现</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 分页控制 */}
      {totalRecords > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* 分页信息 */}
              <div className="text-sm text-muted-foreground">
                {totalRecords > 0 ? (
                  <>
                    显示第 {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalRecords)} 条，
                    共 {totalRecords} 条记录
                  </>
                ) : (
                  '暂无记录'
                )}
              </div>
              
              {/* 分页控件 */}
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevPage}
                    disabled={!hasPrevPage || loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '上一页'}
                  </Button>
                  
                  {/* 页码显示 */}
                  <div className="flex items-center gap-1">
                    {/* 第一页 */}
                    {currentPage > 3 && (
                      <>
                        <Button
                          variant={1 === currentPage ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageJump(1)}
                          disabled={loading}
                          className="w-8 h-8 p-0"
                        >
                          1
                        </Button>
                        {currentPage > 4 && <span className="text-muted-foreground">...</span>}
                      </>
                    )}
                    
                    {/* 当前页附近的页码 */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const startPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4))
                      const page = startPage + i
                      
                      if (page > totalPages) return null
                      
                      return (
                        <Button
                          key={page}
                          variant={page === currentPage ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageJump(page)}
                          disabled={loading}
                          className="w-8 h-8 p-0"
                        >
                          {page}
                        </Button>
                      )
                    })}
                    
                    {/* 最后一页 */}
                    {currentPage < totalPages - 2 && (
                      <>
                        {currentPage < totalPages - 3 && <span className="text-muted-foreground">...</span>}
                        <Button
                          variant={totalPages === currentPage ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageJump(totalPages)}
                          disabled={loading}
                          className="w-8 h-8 p-0"
                        >
                          {totalPages}
                        </Button>
                      </>
                    )}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextPage}
                    disabled={!hasNextPage || loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '下一页'}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 图片详情模态框 */}
      <ImageDetailModal
        record={selectedRecord}
        open={showDetailModal}
        onClose={handleCloseModal}
      />
    </div>
  )
}