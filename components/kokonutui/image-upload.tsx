"use client"

import type React from "react"

import { useState, useCallback, useRef } from "react"
import { Upload, X, ImageIcon, CheckCircle, AlertCircle, Trash2, Eye, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface UploadFile {
  id: string
  file: File
  preview: string
  status: "pending" | "uploading" | "success" | "error"
  progress: number
  url?: string
  error?: string
  size: string
  sha256?: string
}

export default function ImageUpload() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [storageProvider, setStorageProvider] = useState("aliyun")
  const [uploadPath, setUploadPath] = useState("images/")
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const generateId = () => Math.random().toString(36).substr(2, 9)

  const createUploadFile = (file: File): UploadFile => ({
    id: generateId(),
    file,
    preview: URL.createObjectURL(file),
    status: "pending",
    progress: 0,
    size: formatFileSize(file.size),
  })

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles)
    const imageFiles = fileArray.filter((file) => file.type.startsWith("image/"))

    if (imageFiles.length !== fileArray.length) {
      alert("只支持图片文件格式")
    }

    const uploadFiles = imageFiles.map(createUploadFile)
    setFiles((prev) => [...prev, ...uploadFiles])
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const droppedFiles = e.dataTransfer.files
      handleFiles(droppedFiles)
    },
    [handleFiles],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files)
      }
    },
    [handleFiles],
  )

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id)
      if (file?.preview) {
        URL.revokeObjectURL(file.preview)
      }
      return prev.filter((f) => f.id !== id)
    })
  }

  const clearAll = () => {
    files.forEach((file) => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview)
      }
    })
    setFiles([])
  }

  const simulateUpload = async (file: UploadFile) => {
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, status: "uploading" as const } : f)))

    for (let progress = 0; progress <= 100; progress += 10) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, progress } : f)))
    }

    // Simulate success or error
    const isSuccess = Math.random() > 0.1 // 90% success rate
    setFiles((prev) =>
      prev.map((f) =>
        f.id === file.id
          ? {
              ...f,
              status: isSuccess ? ("success" as const) : ("error" as const),
              url: isSuccess ? `https://cdn.example.com/${uploadPath}${file.file.name}` : undefined,
              error: isSuccess ? undefined : "上传失败，请重试",
              sha256: isSuccess ? "a1b2c3d4e5f6..." : undefined,
            }
          : f,
      ),
    )
  }

  const uploadAll = async () => {
    setIsUploading(true)
    const pendingFiles = files.filter((f) => f.status === "pending")

    // Upload files in batches of 3
    for (let i = 0; i < pendingFiles.length; i += 3) {
      const batch = pendingFiles.slice(i, i + 3)
      await Promise.all(batch.map(simulateUpload))
    }

    setIsUploading(false)
  }

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    // Could add toast notification here
  }

  const totalFiles = files.length
  const successFiles = files.filter((f) => f.status === "success").length
  const errorFiles = files.filter((f) => f.status === "error").length
  const uploadingFiles = files.filter((f) => f.status === "uploading").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">图片上传</h1>
          <p className="text-gray-600 dark:text-gray-400">批量上传图片到对象存储</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={storageProvider} onValueChange={setStorageProvider}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aliyun">阿里云 OSS</SelectItem>
              <SelectItem value="tencent">腾讯云 COS</SelectItem>
              <SelectItem value="aws">Amazon S3</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Upload Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">上传配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="upload-path">上传路径</Label>
              <Input
                id="upload-path"
                value={uploadPath}
                onChange={(e) => setUploadPath(e.target.value)}
                placeholder="images/"
              />
            </div>
            <div>
              <Label>存储提供商</Label>
              <Select value={storageProvider} onValueChange={setStorageProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aliyun">阿里云 OSS</SelectItem>
                  <SelectItem value="tencent">腾讯云 COS</SelectItem>
                  <SelectItem value="aws">Amazon S3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Area */}
      <Card>
        <CardContent className="p-6">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">拖拽图片到此处或点击选择</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">支持 JPG、PNG、GIF、WebP 格式，单个文件最大 10MB</p>
            <Button onClick={() => fileInputRef.current?.click()}>选择图片</Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      {/* Upload Statistics */}
      {totalFiles > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">总计</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalFiles}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">成功</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{successFiles}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">失败</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{errorFiles}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">上传中</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{uploadingFiles}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">上传队列 ({files.length})</CardTitle>
              <div className="flex gap-2">
                <Button
                  onClick={uploadAll}
                  disabled={isUploading || files.every((f) => f.status !== "pending")}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isUploading ? "上传中..." : "开始上传"}
                </Button>
                <Button variant="outline" onClick={clearAll}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  清空
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {files.map((file) => (
                <div key={file.id} className="flex items-center gap-4 p-3 border rounded-lg">
                  <img
                    src={file.preview || "/placeholder.svg"}
                    alt={file.file.name}
                    className="w-12 h-12 object-cover rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{file.file.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{file.size}</p>
                    {file.status === "uploading" && <Progress value={file.progress} className="mt-2" />}
                    {file.status === "success" && file.url && (
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="sm" variant="outline" onClick={() => copyUrl(file.url!)}>
                          <Copy className="h-3 w-3 mr-1" />
                          复制链接
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => window.open(file.url, "_blank")}>
                          <Eye className="h-3 w-3 mr-1" />
                          预览
                        </Button>
                      </div>
                    )}
                    {file.error && <p className="text-sm text-red-600 mt-1">{file.error}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        file.status === "success"
                          ? "default"
                          : file.status === "error"
                            ? "destructive"
                            : file.status === "uploading"
                              ? "secondary"
                              : "outline"
                      }
                    >
                      {file.status === "pending" && "待上传"}
                      {file.status === "uploading" && "上传中"}
                      {file.status === "success" && "成功"}
                      {file.status === "error" && "失败"}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => removeFile(file.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
