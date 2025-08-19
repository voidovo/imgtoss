"use client"

import { useState, useMemo } from "react"
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
  ExternalLink,
  Calendar,
  FileImage,
  HardDrive,
  Hash,
  Clock,
  Eye,
  MoreHorizontal,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Mock data for demonstration
const mockHistoryData = [
  {
    id: "1",
    filename: "screenshot-2024-01-15.png",
    originalName: "Screenshot 2024-01-15 at 10.30.45.png",
    url: "https://cdn.example.com/images/screenshot-2024-01-15.png",
    provider: "AWS S3",
    size: "2.4 MB",
    uploadTime: "2024-01-15 10:31:22",
    sha256: "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
    status: "success",
    thumbnail: "/screenshot-of-code.png",
  },
  {
    id: "2",
    filename: "profile-avatar.jpg",
    originalName: "my-profile-photo.jpg",
    url: "https://cdn.example.com/images/profile-avatar.jpg",
    provider: "Cloudinary",
    size: "1.8 MB",
    uploadTime: "2024-01-14 15:22:10",
    sha256: "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567",
    status: "success",
    thumbnail: "/abstract-profile.png",
  },
  {
    id: "3",
    filename: "document-scan.pdf",
    originalName: "important-document.pdf",
    url: "https://cdn.example.com/files/document-scan.pdf",
    provider: "Google Cloud",
    size: "5.2 MB",
    uploadTime: "2024-01-13 09:15:33",
    sha256: "c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678",
    status: "failed",
    thumbnail: "/document-stack.png",
  },
  {
    id: "4",
    filename: "banner-image.webp",
    originalName: "website-banner-final.webp",
    url: "https://cdn.example.com/images/banner-image.webp",
    provider: "AWS S3",
    size: "890 KB",
    uploadTime: "2024-01-12 14:45:18",
    sha256: "d4e5f6789012345678901234567890abcdef1234567890abcdef123456789",
    status: "success",
    thumbnail: "/celebratory-banner.png",
  },
  {
    id: "5",
    filename: "presentation.pptx",
    originalName: "quarterly-review-presentation.pptx",
    url: "https://cdn.example.com/files/presentation.pptx",
    provider: "Cloudinary",
    size: "12.5 MB",
    uploadTime: "2024-01-11 11:20:45",
    sha256: "e5f6789012345678901234567890abcdef1234567890abcdef1234567890",
    status: "success",
    thumbnail: "/dynamic-presentation.png",
  },
]

export function HistoryRecords() {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProvider, setSelectedProvider] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [sortBy, setSortBy] = useState("uploadTime")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")

  // Filter and sort data
  const filteredData = useMemo(() => {
    const filtered = mockHistoryData.filter((item) => {
      const matchesSearch =
        item.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.originalName.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesProvider = selectedProvider === "all" || item.provider === selectedProvider
      const matchesStatus = selectedStatus === "all" || item.status === selectedStatus

      return matchesSearch && matchesProvider && matchesStatus
    })

    // Sort data
    filtered.sort((a, b) => {
      let aValue = a[sortBy as keyof typeof a]
      let bValue = b[sortBy as keyof typeof b]

      if (sortBy === "uploadTime") {
        aValue = new Date(aValue as string).getTime()
        bValue = new Date(bValue as string).getTime()
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

    return filtered
  }, [searchTerm, selectedProvider, selectedStatus, sortBy, sortOrder])

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(filteredData.map((item) => item.id))
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
    navigator.clipboard.writeText(text)
    // You could add a toast notification here
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            成功
          </Badge>
        )
      case "failed":
        return <Badge variant="destructive">失败</Badge>
      case "uploading":
        return <Badge variant="secondary">上传中</Badge>
      default:
        return <Badge variant="outline">未知</Badge>
    }
  }

  const getProviderBadge = (provider: string) => {
    const colors = {
      "AWS S3": "bg-orange-100 text-orange-800",
      Cloudinary: "bg-blue-100 text-blue-800",
      "Google Cloud": "bg-red-100 text-red-800",
    }

    return (
      <Badge variant="outline" className={colors[provider as keyof typeof colors] || "bg-gray-100 text-gray-800"}>
        {provider}
      </Badge>
    )
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
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            导出记录
          </Button>
          {selectedItems.length > 0 && (
            <Button variant="destructive" size="sm">
              <Trash2 className="h-4 w-4 mr-2" />
              删除选中 ({selectedItems.length})
            </Button>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总文件数</CardTitle>
            <FileImage className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockHistoryData.length}</div>
            <p className="text-xs text-muted-foreground">+2 较昨日</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">成功上传</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {mockHistoryData.filter((item) => item.status === "success").length}
            </div>
            <p className="text-xs text-muted-foreground">成功率 80%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总存储大小</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">22.8 MB</div>
            <p className="text-xs text-muted-foreground">+5.2 MB 本周</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">存储提供商</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">AWS S3, Cloudinary, GCP</p>
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
                  placeholder="搜索文件名或原始名称..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="存储提供商" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有提供商</SelectItem>
                <SelectItem value="AWS S3">AWS S3</SelectItem>
                <SelectItem value="Cloudinary">Cloudinary</SelectItem>
                <SelectItem value="Google Cloud">Google Cloud</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-full md:w-[120px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有状态</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
                <SelectItem value="uploading">上传中</SelectItem>
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
                <SelectItem value="uploadTime-desc">最新上传</SelectItem>
                <SelectItem value="uploadTime-asc">最早上传</SelectItem>
                <SelectItem value="filename-asc">文件名 A-Z</SelectItem>
                <SelectItem value="filename-desc">文件名 Z-A</SelectItem>
                <SelectItem value="size-desc">文件大小 ↓</SelectItem>
                <SelectItem value="size-asc">文件大小 ↑</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedItems.length === filteredData.length && filteredData.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>文件</TableHead>
                <TableHead>存储提供商</TableHead>
                <TableHead>文件大小</TableHead>
                <TableHead>上传时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>SHA256</TableHead>
                <TableHead className="w-12">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedItems.includes(item.id)}
                      onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <img
                        src={item.thumbnail || "/placeholder.svg"}
                        alt={item.filename}
                        className="w-10 h-10 rounded object-cover bg-muted"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{item.filename}</p>
                        <p className="text-sm text-muted-foreground truncate">{item.originalName}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{getProviderBadge(item.provider)}</TableCell>
                  <TableCell className="font-mono text-sm">{item.size}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{item.uploadTime}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                        {item.sha256.substring(0, 8)}...
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(item.sha256)}
                        className="h-6 w-6 p-0"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyToClipboard(item.url)}>
                          <Copy className="h-4 w-4 mr-2" />
                          复制链接
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(item.url, "_blank")}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          在新窗口打开
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Eye className="h-4 w-4 mr-2" />
                          预览
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="h-4 w-4 mr-2" />
                          删除记录
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredData.length === 0 && (
            <div className="text-center py-12">
              <FileImage className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">暂无记录</h3>
              <p className="text-muted-foreground">
                {searchTerm || selectedProvider !== "all" || selectedStatus !== "all"
                  ? "没有找到符合条件的记录"
                  : "还没有上传任何文件"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
