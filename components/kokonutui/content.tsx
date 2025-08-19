"use client"

import { useState } from "react"
import { FileText, Upload, CheckCircle } from "lucide-react"
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

interface DetectedImage {
  id: string
  path: string
  name: string
  size: string
  preview: string
  status: "local" | "uploaded"
}

export default function Content() {
  const [isScanned, setIsScanned] = useState(true) // Set to true for demo
  const [showImageModal, setShowImageModal] = useState(false)
  const [selectedImages, setSelectedImages] = useState<string[]>([])

  // Mock detected images data
  const [detectedImages] = useState<DetectedImage[]>([
    {
      id: "1",
      path: "./images/screenshot1.png",
      name: "screenshot1.png",
      size: "245 KB",
      preview: "/screenshot-of-code.png",
      status: "local",
    },
    {
      id: "2",
      path: "./images/diagram.jpg",
      name: "diagram.jpg",
      size: "156 KB",
      preview: "/abstract-profile.png",
      status: "local",
    },
    {
      id: "3",
      path: "./images/chart.png",
      name: "chart.png",
      size: "89 KB",
      preview: "/document-stack.png",
      status: "local",
    },
    {
      id: "4",
      path: "./images/banner.jpg",
      name: "banner.jpg",
      size: "312 KB",
      preview: "/celebratory-banner.png",
      status: "local",
    },
  ])

  const handleImageSelect = (imageId: string, checked: boolean) => {
    if (checked) {
      setSelectedImages((prev) => [...prev, imageId])
    } else {
      setSelectedImages((prev) => prev.filter((id) => id !== imageId))
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedImages(detectedImages.map((img) => img.id))
    } else {
      setSelectedImages([])
    }
  }

  const handleUploadSelected = () => {
    console.log("Uploading selected images:", selectedImages)
    setShowImageModal(false)
    // Here you would implement the actual upload logic
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
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
                <Button onClick={() => setIsScanned(true)}>选择 MD 文件</Button>
              </div>

              {isScanned && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">检测到的图片 ({detectedImages.length})</h4>
                    <Button onClick={() => setShowImageModal(true)} className="bg-blue-600 hover:bg-blue-700">
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
                          <span className="text-sm">{image.path}</span>
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
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">上传统计</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">今日上传</span>
                  <span className="font-medium">12 张</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">本月上传</span>
                  <span className="font-medium">156 张</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">存储用量</span>
                  <span className="font-medium">2.3 GB</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">存储状态</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">阿里云 OSS</span>
                  <Badge
                    variant="default"
                    className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  >
                    已连接
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">腾讯云 COS</span>
                  <Badge variant="secondary">未配置</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Amazon S3</span>
                  <Badge variant="secondary">未配置</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近上传记录</CardTitle>
          <CardDescription>显示最近上传的图片和处理状态</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div>
                  <p className="font-medium text-sm">screenshot1.png</p>
                  <p className="text-xs text-gray-500">2024-01-20 14:30</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  已上传
                </Badge>
                <Button variant="outline" size="sm">
                  复制链接
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div>
                  <p className="font-medium text-sm">diagram.jpg</p>
                  <p className="text-xs text-gray-500">2024-01-20 14:28</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  已上传
                </Badge>
                <Button variant="outline" size="sm">
                  复制链接
                </Button>
              </div>
            </div>
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
                checked={selectedImages.length === detectedImages.length}
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all" className="text-sm font-medium">
                全选 ({selectedImages.length}/{detectedImages.length})
              </label>
            </div>

            <ScrollArea className="h-96">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-4">
                {detectedImages.map((image) => (
                  <div key={image.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`image-${image.id}`}
                        checked={selectedImages.includes(image.id)}
                        onCheckedChange={(checked) => handleImageSelect(image.id, checked as boolean)}
                      />
                      <div className="flex-1 min-w-0">
                        <img
                          src={image.preview || "/placeholder.svg"}
                          alt={image.name}
                          className="w-full h-32 object-cover rounded-md mb-2"
                        />
                        <div className="space-y-1">
                          <p className="font-medium text-sm truncate">{image.name}</p>
                          <p className="text-xs text-gray-500">{image.path}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">{image.size}</span>
                            <Badge variant="secondary">本地</Badge>
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
              disabled={selectedImages.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              上传选中的图片 ({selectedImages.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
