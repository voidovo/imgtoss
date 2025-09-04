"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Search, Download, Trash2, Copy, Calendar, FileImage, Upload } from "lucide-react"
import { tauriAPI } from "@/lib/tauri-api"
import { UploadHistoryRecord, UploadMode } from "@/lib/types"
import { copyToClipboardWithToast } from "@/lib/utils/copy-to-clipboard"
import { formatFileSizeHuman } from "@/lib/utils/format"
import { FilenameDisplay } from "@/components/ui/filename-display"

export default function HistoryPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [records, setRecords] = useState<UploadHistoryRecord[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterMode, setFilterMode] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const pageSize = 20

  // 加载历史记录
  const loadHistory = async (page = 1, search = "", mode = "all") => {
    try {
      setLoading(true)
      setError(null)
      
      const uploadMode = mode === "all" ? undefined : mode
      const result = await tauriAPI.searchHistory(
        search || undefined,
        uploadMode,
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

  // 搜索和筛选
  const handleSearch = () => {
    setCurrentPage(1)
    loadHistory(1, searchTerm, filterMode)
  }

  // 复制链接
  const handleCopyLink = async (url: string) => {
    await copyToClipboardWithToast(url)
  }

  // 删除记录
  const handleDeleteRecord = async (id: string) => {
    try {
      await tauriAPI.deleteImageHistoryRecord(id)
      // 重新加载当前页
      loadHistory(currentPage, searchTerm, filterMode)
    } catch (err) {
      console.error('Failed to delete record:', err)
      setError(`删除记录失败: ${err}`)
    }
  }

  // 清空历史记录
  const handleClearHistory = async () => {
    if (!confirm('确定要清空所有历史记录吗？此操作不可撤销。')) {
      return
    }
    
    try {
      await tauriAPI.clearImageHistory()
      setRecords([])
      setTotalRecords(0)
      setCurrentPage(1)
    } catch (err) {
      console.error('Failed to clear history:', err)
      setError(`清空历史记录失败: ${err}`)
    }
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

  // 获取上传模式显示文本
  const getModeText = (mode: UploadMode) => {
    switch (mode) {
      case UploadMode.ImageUpload:
        return "图片上传"
      case UploadMode.ArticleUpload:
        return "文章上传"
      default:
        return "未知"
    }
  }

  // 获取上传模式图标
  const getModeIcon = (mode: UploadMode) => {
    switch (mode) {
      case UploadMode.ImageUpload:
        return <FileImage className="h-4 w-4" />
      case UploadMode.ArticleUpload:
        return <Upload className="h-4 w-4" />
      default:
        return <FileImage className="h-4 w-4" />
    }
  }

  // 分页控制
  const totalPages = Math.ceil(totalRecords / pageSize)
  const hasNextPage = currentPage < totalPages
  const hasPrevPage = currentPage > 1

  const handleNextPage = () => {
    if (hasNextPage) {
      loadHistory(currentPage + 1, searchTerm, filterMode)
    }
  }

  const handlePrevPage = () => {
    if (hasPrevPage) {
      loadHistory(currentPage - 1, searchTerm, filterMode)
    }
  }

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
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>加载中...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">历史记录</h1>
          <p className="text-muted-foreground mt-1">管理和查看所有上传的文件记录</p>
        </div>
        <div className="flex gap-2">
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

      {/* 搜索和筛选 */}
      <Card>
        <CardHeader>
          <CardTitle>搜索和筛选</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="搜索文件名或链接..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Select value={filterMode} onValueChange={setFilterMode}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="上传模式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="ImageUpload">图片上传</SelectItem>
                <SelectItem value="ArticleUpload">文章上传</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSearch}>
              <Search className="h-4 w-4 mr-2" />
              搜索
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 错误提示 */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-red-600">{error}</div>
          </CardContent>
        </Card>
      )}

      {/* 历史记录列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>历史记录 ({totalRecords} 条)</span>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">暂无历史记录</p>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {getModeIcon(record.upload_mode)}
                      <Badge variant="secondary">
                        {getModeText(record.upload_mode)}
                      </Badge>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <FilenameDisplay
                          filePath={record.image_name}
                          className="font-medium"
                          maxLength={40}
                          showTooltip={true}
                        />
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(record.timestamp).toLocaleString()}
                        </span>
                        <span>{formatFileSizeHuman(record.file_size)}</span>
                        {record.source_file && (
                          <span>来源: {record.source_file.split('/').pop()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyLink(record.uploaded_url)}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      复制链接
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteRecord(record.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 分页控制 */}
      {totalPages > 1 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                第 {currentPage} 页，共 {totalPages} 页，总计 {totalRecords} 条记录
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={!hasPrevPage}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!hasNextPage}
                >
                  下一页
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}