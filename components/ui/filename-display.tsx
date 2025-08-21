"use client"

import { useState } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface FilenameDisplayProps {
  filePath: string
  className?: string
  maxLength?: number
  showTooltip?: boolean
  showFullPath?: boolean
}

/**
 * 智能截断文件名，保留扩展名
 */
function truncateFilename(filename: string, maxLength: number): string {
  if (filename.length <= maxLength) {
    return filename
  }

  const lastDotIndex = filename.lastIndexOf('.')
  if (lastDotIndex === -1) {
    // 没有扩展名，直接截断
    return filename.substring(0, maxLength - 3) + '...'
  }

  const name = filename.substring(0, lastDotIndex)
  const ext = filename.substring(lastDotIndex)

  // 如果扩展名太长，直接截断整个文件名
  if (ext.length > maxLength / 2) {
    return filename.substring(0, maxLength - 3) + '...'
  }

  // 保留扩展名，截断文件名部分
  const availableLength = maxLength - ext.length - 3 // 3 for "..."
  if (availableLength <= 0) {
    return filename.substring(0, maxLength - 3) + '...'
  }

  return name.substring(0, availableLength) + '...' + ext
}

/**
 * 从文件路径提取文件名
 */
function extractFilename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}

export function FilenameDisplay({
  filePath,
  className = "",
  maxLength = 30,
  showTooltip = true,
  showFullPath = false
}: FilenameDisplayProps) {
  const fullPath = filePath
  const filename = showFullPath ? filePath : extractFilename(filePath)
  const displayName = truncateFilename(filename, maxLength)
  const shouldTruncate = filename.length > maxLength

  if (showTooltip && shouldTruncate) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-block truncate cursor-help ${className}`}>
              {displayName}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs break-all">{showFullPath ? fullPath : filename}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <span className={`inline-block truncate ${className}`}>
      {displayName}
    </span>
  )
}

/**
 * 简化版本，用于不需要 Tooltip 的场景
 */
export function SimpleFilenameDisplay({
  filePath,
  className = "",
  maxLength = 30,
  showFullPath = false
}: Omit<FilenameDisplayProps, 'showTooltip'>) {
  const filename = showFullPath ? filePath : extractFilename(filePath)
  const displayName = truncateFilename(filename, maxLength)

  return (
    <span className={`inline-block truncate ${className}`}>
      {displayName}
    </span>
  )
}

// 导出工具函数供其他地方使用
export { truncateFilename, extractFilename }