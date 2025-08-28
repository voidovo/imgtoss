"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Search,
  Download,
  Trash2,
  Copy,
  Calendar,
  FileImage,
  HardDrive,
  Hash,
  Clock,
  Eye,
  MoreHorizontal,
  Loader2,
  RefreshCw,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FilenameDisplay } from "@/components/ui/filename-display"
import { formatFileSizeHuman } from "@/lib/utils/format"
import { historyOperations } from "@/lib/tauri-api"
import type { HistoryRecord, PaginatedResult, HistoryStatistics } from "@/lib/types"
import { copyToClipboardWithToast, copyImageUrlToClipboard } from "@/lib/utils/copy-to-clipboard"

// Helper function to extract filename from file path
function extractFilename(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

// Helper function to format date
function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return dateString;
  }
}

export function HistoryRecords() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [sortBy, setSortBy] = useState("timestamp")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(20)

  // Data state
  const [historyData, setHistoryData] = useState<PaginatedResult<HistoryRecord> | null>(null)
  const [statistics, setStatistics] = useState<HistoryStatistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)



  // Load history data
  const loadHistoryData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Determine success filter
      const successOnly = selectedStatus === "success" ? true :
        selectedStatus === "failed" ? false : undefined;

      // Use search if there's a search term, otherwise use regular pagination
      const result = searchTerm.trim()
        ? await historyOperations.searchHistory(
          searchTerm,
          undefined, // operation_type - 不再需要，后端默认过滤上传
          successOnly,
          undefined, // start_date
          undefined, // end_date
          currentPage,
          pageSize
        )
        : await historyOperations.getUploadHistory(currentPage, pageSize);

      setHistoryData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history data');
    } finally {
      setLoading(false);
    }
  };

  // Load statistics
  const loadStatistics = async () => {
    try {
      const stats = await historyOperations.getHistoryStatistics();
      setStatistics(stats);
    } catch (err) {
      console.error('Failed to load statistics:', err);
    }
  };



  // Load data on component mount and when filters change
  useEffect(() => {
    loadHistoryData();
  }, [searchTerm, selectedStatus, currentPage]);

  // Load statistics on mount
  useEffect(() => {
    loadStatistics();
  }, []);



  // Handle search with debouncing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        loadHistoryData();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Sort and filter data locally (for display purposes)
  const processedData = useMemo(() => {
    if (!historyData?.items) return [];

    let processed = [...historyData.items];

    // Sort data
    processed.sort((a, b) => {
      let aValue: any = a[sortBy as keyof HistoryRecord];
      let bValue: any = b[sortBy as keyof HistoryRecord];

      if (sortBy === "timestamp") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return processed;
  }, [historyData, sortBy, sortOrder]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(processedData.map((item) => item.id))
    } else {
      setSelectedItems([])
    }
  }

  const handleSelectItem = (itemId: string, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, itemId])
    } else {
      setSelectedItems(selectedItems.filter((id) => id !== itemId))
    }
  }

  const copyToClipboard = (text: string) => {
    copyToClipboardWithToast(text)
  }

  const copyImageUrl = (url: string) => {
    copyImageUrlToClipboard(url)
  }

  const handleExportHistory = async () => {
    try {
      await historyOperations.exportHistoryToFile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export history');
    }
  };

  const handleClearHistory = async () => {
    if (confirm('Are you sure you want to clear all history? This action cannot be undone.')) {
      try {
        await historyOperations.clearHistory();
        await loadHistoryData();
        await loadStatistics();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to clear history');
      }
    }
  };

  const getStatusBadge = (success: boolean) => {
    if (success) {
      return (
        <Badge variant="default" className="bg-green-100 text-green-800">
          成功
        </Badge>
      )
    } else {
      return <Badge variant="destructive">失败</Badge>
    }
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">历史记录</h1>
            <p className="text-muted-foreground mt-1">管理和查看所有上传的文件记录</p>
          </div>
          <Button onClick={loadHistoryData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            重试
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <div className="text-red-600 mb-4">错误: {error}</div>
              <Button onClick={loadHistoryData}>重新加载</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">历史记录</h1>
          <p className="text-muted-foreground mt-1">管理和查看所有上传的文件记录</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportHistory}>
            <Download className="h-4 w-4 mr-2" />
            导出记录
          </Button>
          {selectedItems.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleClearHistory}>
              <Trash2 className="h-4 w-4 mr-2" />
              删除选中 ({selectedItems.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={loadHistoryData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总图片数</CardTitle>
            <FileImage className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics?.total_images_processed || 0}</div>
            <p className="text-xs text-muted-foreground">已上传图片总数</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">成功操作</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {statistics?.successful_operations || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              成功率 {statistics ? Math.round(statistics.success_rate) : 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总处理大小</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatFileSizeHuman(statistics?.total_size_processed || 0)}</div>
            <p className="text-xs text-muted-foreground">累计上传大小</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">操作记录</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics?.total_records || 0}</div>
            <p className="text-xs text-muted-foreground">历史记录总数</p>
          </CardContent>
        </Card>
      </div>



      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索文件名..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-full md:w-[120px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有状态</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={`${sortBy}-${sortOrder}`}
              onValueChange={(value) => {
                const [field, order] = value.split("-")
                setSortBy(field)
                setSortOrder(order as "asc" | "desc")
              }}
            >
              <SelectTrigger className="w-full md:w-[140px]">
                <SelectValue placeholder="排序" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="timestamp-desc">最新时间</SelectItem>
                <SelectItem value="timestamp-asc">最早时间</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>加载历史记录中...</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">
                      <Checkbox
                        checked={selectedItems.length === processedData.length && processedData.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>文件</TableHead>
                    <TableHead>文件大小</TableHead>
                    <TableHead>上传时间</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>复制链接</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedItems.includes(item.id)}
                          onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">
                            <FilenameDisplay
                              filePath={item.files.length > 0 ? item.files[0] : 'No files'}
                              maxLength={30}
                              showTooltip={true}
                            />
                          </div>
                          {item.files.length > 1 && (
                            <p className="text-sm text-muted-foreground">
                              +{item.files.length - 1} 个文件
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{formatFileSizeHuman(item.total_size || 0)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{formatDate(item.timestamp)}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(item.success)}</TableCell>
                      <TableCell>
                        {item.success && item.metadata?.uploaded_url ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyImageUrl(item.metadata.uploaded_url)}
                            className="h-8 gap-2"
                          >
                            <Copy className="h-4 w-4" />
                            复制链接
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">无链接</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {processedData.length === 0 && (
                <div className="text-center py-12">
                  <FileImage className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">暂无记录</h3>
                  <p className="text-muted-foreground">
                    {searchTerm || selectedStatus !== "all"
                      ? "没有找到符合条件的记录"
                      : "还没有任何上传记录"}
                  </p>
                </div>
              )}

              {/* Pagination */}
              {historyData && historyData.total > pageSize && (
                <div className="flex items-center justify-between px-6 py-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    显示 {((currentPage - 1) * pageSize) + 1} 到 {Math.min(currentPage * pageSize, historyData.total)} 条，
                    共 {historyData.total} 条记录
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      上一页
                    </Button>
                    <span className="text-sm">
                      第 {currentPage} 页，共 {Math.ceil(historyData.total / pageSize)} 页
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={!historyData.has_more}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}