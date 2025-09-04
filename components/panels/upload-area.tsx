"use client"

import React, { useRef } from "react"
import { Upload, LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UploadAreaProps {
  /** 是否正在拖拽状态 */
  isDragging: boolean
  /** 拖拽进入事件处理器 */
  onDragOver: (e: React.DragEvent) => void
  /** 拖拽离开事件处理器 */
  onDragLeave: (e: React.DragEvent) => void
  /** 文件拖放事件处理器 */
  onDrop: (e: React.DragEvent) => void
  /** 按钮点击选择文件事件处理器 */
  onFileSelect: () => void
  /** 文件输入框变化事件处理器（可选，用于input元素） */
  onInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** 主标题文本 */
  title?: string
  /** 描述文本 */
  description?: string
  /** 按钮文本 */
  buttonText?: string
  /** 按钮是否禁用 */
  buttonDisabled?: boolean
  /** 自定义图标 */
  icon?: LucideIcon
  /** 图标大小 */
  iconSize?: "sm" | "md" | "lg"
  /** 文件类型限制（用于input元素的accept属性）*/
  acceptedFileTypes?: string
  /** 是否支持多文件选择 */
  multiple?: boolean
  /** 是否显示隐藏的文件输入框 */
  showFileInput?: boolean
  /** 额外的CSS类名 */
  className?: string
  /** 自定义内容（完全自定义上传区域内容）*/
  children?: React.ReactNode
}

/**
 * 可复用的上传区域组件
 * 支持拖拽上传和点击选择文件，可灵活配置各种属性
 */
export function UploadArea({
  isDragging,
  onDragOver,
  onDragLeave, 
  onDrop,
  onFileSelect,
  onInputChange,
  title = "拖拽文件到此处或点击选择",
  description = "支持多文件上传",
  buttonText = "选择文件",
  buttonDisabled = false,
  icon: Icon = Upload,
  iconSize = "lg",
  acceptedFileTypes = "*",
  multiple = true,
  showFileInput = false,
  className = "",
  children,
}: UploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 图标尺寸映射
  const iconSizeMap = {
    sm: "h-8 w-8",
    md: "h-10 w-10", 
    lg: "h-12 w-12"
  }

  const handleButtonClick = () => {
    if (showFileInput && fileInputRef.current) {
      fileInputRef.current.click()
    } else {
      onFileSelect()
    }
  }

  // 构建容器样式类名
  const containerClasses = [
    "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
    isDragging
      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
      : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500",
    className,
  ].join(" ")

  return (
    <div
      className={containerClasses}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children ? (
        children
      ) : (
        <>
          <Icon className={`${iconSizeMap[iconSize]} text-gray-400 mx-auto mb-4`} />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {title}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {description}
          </p>
          <Button onClick={handleButtonClick} disabled={buttonDisabled}>
            {buttonText}
          </Button>
        </>
      )}

      {/* 隐藏的文件输入框 */}
      {showFileInput && (
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={acceptedFileTypes}
          onChange={onInputChange}
          className="hidden"
        />
      )}
    </div>
  )
}

/**
 * 预设配置：图片上传区域
 */
export function ImageUploadArea(props: Omit<UploadAreaProps, 'title' | 'description' | 'buttonText' | 'acceptedFileTypes'>) {
  return (
    <UploadArea
      {...props}
      title="拖拽图片到此处或点击选择"
      description="支持 JPG、PNG、GIF、WebP 格式，单个文件最大 10MB"
      buttonText="选择图片"
      acceptedFileTypes="image/*"
    />
  )
}

/**
 * 预设配置：Markdown文件上传区域
 */
export function MarkdownUploadArea(props: Omit<UploadAreaProps, 'title' | 'description' | 'buttonText' | 'acceptedFileTypes'>) {
  return (
    <UploadArea
      {...props}
      title="拖拽 Markdown 文件到此处，或点击选择文件"
      description="支持 .md 和 .markdown 文件格式"
      buttonText="选择 MD 文件"
      acceptedFileTypes=".md,.markdown"
    />
  )
}

/**
 * 预设配置：通用文档上传区域
 */
export function DocumentUploadArea(props: Omit<UploadAreaProps, 'title' | 'description' | 'buttonText'>) {
  return (
    <UploadArea
      {...props}
      title="拖拽文档到此处或点击选择"
      description="支持多种文档格式"
      buttonText="选择文档"
    />
  )
}

export default UploadArea