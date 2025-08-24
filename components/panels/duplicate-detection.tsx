"use client"

import React, { useState, useEffect } from "react"
import { AlertTriangle, Copy, Eye, Clock, FileImage, CheckCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FilenameDisplay } from "@/components/ui/filename-display"
import { formatFileSizeHuman } from "@/lib/utils/format"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { tauriAPI } from "@/lib/tauri-api"
import type { DuplicateCheckResult, DuplicateInfo } from "@/lib/types"

interface DuplicateDetectionProps {
  imagePaths: string[]
  onDuplicatesDetected?: (duplicates: DuplicateCheckResult[]) => void
  onContinueWithDuplicates?: (duplicates: DuplicateCheckResult[]) => void
  onSkipDuplicates?: (nonDuplicates: string[]) => void
}

export default function DuplicateDetection({
  imagePaths,
  onDuplicatesDetected,
  onContinueWithDuplicates,
  onSkipDuplicates,
}: DuplicateDetectionProps) {
  const [isChecking, setIsChecking] = useState(false)
  const [duplicateResults, setDuplicateResults] = useState<DuplicateCheckResult[]>([])
  const [duplicateInfos, setDuplicateInfos] = useState<Map<string, DuplicateInfo>>(new Map())
  const [showDetails, setShowDetails] = useState<Set<string>>(new Set())

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const checkForDuplicates = async () => {
    if (imagePaths.length === 0) return

    setIsChecking(true)
    try {
      const results = await tauriAPI.checkDuplicatesBatch(imagePaths)
      setDuplicateResults(results)

      // Get detailed info for duplicates
      const duplicateInfoMap = new Map<string, DuplicateInfo>()
      for (const result of results) {
        if (result.is_duplicate) {
          try {
            const info = await tauriAPI.getDuplicateInfo(result.checksum)
            if (info) {
              duplicateInfoMap.set(result.checksum, info)
            }
          } catch (error) {
            console.error("Failed to get duplicate info:", error)
          }
        }
      }
      setDuplicateInfos(duplicateInfoMap)

      // Notify parent component
      const duplicates = results.filter(r => r.is_duplicate)
      if (duplicates.length > 0 && onDuplicatesDetected) {
        onDuplicatesDetected(duplicates)
      }
    } catch (error) {
      console.error("Failed to check for duplicates:", error)
    } finally {
      setIsChecking(false)
    }
  }

  const toggleDetails = (checksum: string) => {
    const newShowDetails = new Set(showDetails)
    if (newShowDetails.has(checksum)) {
      newShowDetails.delete(checksum)
    } else {
      newShowDetails.add(checksum)
    }
    setShowDetails(newShowDetails)
  }

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    // Could add toast notification here
  }

  const handleContinueWithDuplicates = () => {
    const duplicates = duplicateResults.filter(r => r.is_duplicate)
    if (onContinueWithDuplicates) {
      onContinueWithDuplicates(duplicates)
    }
  }

  const handleSkipDuplicates = () => {
    const nonDuplicatePaths = duplicateResults
      .filter(r => !r.is_duplicate)
      .map((_, index) => imagePaths[index])
      .filter(Boolean)
    
    if (onSkipDuplicates) {
      onSkipDuplicates(nonDuplicatePaths)
    }
  }

  useEffect(() => {
    if (imagePaths.length > 0) {
      checkForDuplicates()
    }
  }, [imagePaths])

  const duplicates = duplicateResults.filter(r => r.is_duplicate)
  const nonDuplicates = duplicateResults.filter(r => !r.is_duplicate)

  if (isChecking) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="text-gray-600 dark:text-gray-400">正在检查重复图片...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (duplicateResults.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {duplicates.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            发现 {duplicates.length} 个重复图片。这些图片之前已经上传过，您可以选择跳过或继续上传。
          </AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileImage className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">总计</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{duplicateResults.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">重复</span>
            </div>
            <p className="text-2xl font-bold text-orange-600">{duplicates.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">新图片</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{nonDuplicates.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Duplicate Details */}
      {duplicates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              重复图片详情
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {duplicates.map((duplicate, index) => {
                const info = duplicateInfos.get(duplicate.checksum)
                const imagePath = imagePaths[duplicateResults.indexOf(duplicate)]
                
                return (
                  <div key={duplicate.checksum} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive">重复</Badge>
                          <div className="font-medium text-gray-900 dark:text-white flex-1 min-w-0">
                            <FilenameDisplay
                              filePath={imagePath || 'Unknown'}
                              maxLength={40}
                              showTooltip={true}
                            />
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          校验和: {duplicate.checksum.substring(0, 16)}...
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleDetails(duplicate.checksum)}
                        >
                          {showDetails.has(duplicate.checksum) ? "隐藏详情" : "显示详情"}
                        </Button>
                      </div>
                    </div>

                    {showDetails.has(duplicate.checksum) && info && (
                      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">原始路径:</span>
                            <div className="text-gray-600 dark:text-gray-400">
                              <FilenameDisplay
                                filePath={info.original_path}
                                maxLength={50}
                                showFullPath={true}
                                showTooltip={true}
                              />
                            </div>
                          </div>
                          <div>
                            <span className="font-medium">文件大小:</span>
                            <p className="text-gray-600 dark:text-gray-400">
                              {formatFileSizeHuman(info.file_size)}
                            </p>
                          </div>
                          <div>
                            <span className="font-medium">上传时间:</span>
                            <p className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(info.upload_date)}
                            </p>
                          </div>
                          <div>
                            <span className="font-medium">已有链接:</span>
                            <div className="flex items-center gap-2 mt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyUrl(info.existing_url)}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                复制链接
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(info.existing_url, "_blank")}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                预览
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {duplicates.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={handleSkipDuplicates}>
            <X className="h-4 w-4 mr-2" />
            跳过重复图片 ({nonDuplicates.length} 个新图片)
          </Button>
          <Button onClick={handleContinueWithDuplicates}>
            <CheckCircle className="h-4 w-4 mr-2" />
            继续上传全部 ({duplicateResults.length} 个图片)
          </Button>
        </div>
      )}
    </div>
  )
}