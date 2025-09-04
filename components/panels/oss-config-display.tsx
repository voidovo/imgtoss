"use client"

import React from "react"
import { Settings, Database, Globe, Key, Folder, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { OSSConfig } from "@/lib/types"
import { OSSProvider } from "@/lib/types"

// OSS 供应商显示名称映射
const providerDisplayNames = {
  [OSSProvider.Aliyun]: "阿里云 OSS",
  [OSSProvider.Tencent]: "腾讯云 COS",
  [OSSProvider.AWS]: "Amazon S3",
  [OSSProvider.Custom]: "自定义 S3",
}

// OSS 供应商图标映射
const providerIcons = {
  [OSSProvider.Aliyun]: Database,
  [OSSProvider.Tencent]: Database,
  [OSSProvider.AWS]: Database,
  [OSSProvider.Custom]: Globe,
}

interface ConfigFieldProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | undefined
  fallback?: string
  sensitive?: boolean
}

function ConfigField({ icon: Icon, label, value, fallback = "未设置", sensitive = false }: ConfigFieldProps) {
  const displayValue = value || fallback
  const maskedValue = sensitive && value ? "••••••••" : displayValue

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-gray-500" />
        <span className="font-medium text-gray-600 dark:text-gray-400 text-sm">{label}:</span>
      </div>
      <div className={`mt-1 ${value ? 'font-mono text-sm' : 'text-sm text-gray-500'}`}>
        {maskedValue}
      </div>
    </div>
  )
}

interface OSSConfigDisplayProps {
  /** OSS 配置对象 */
  config: OSSConfig | null
  /** 是否显示敏感信息（如密钥）*/
  showSensitiveInfo?: boolean
  /** 配置标题 */
  title?: string
  /** 配置不存在时的提示文本 */
  noConfigText?: string
  /** 配置按钮文本 */
  configButtonText?: string
  /** 点击配置按钮的回调 */
  onConfigClick?: () => void
  /** 网格布局列数配置 */
  columns?: {
    default?: number
    sm?: number
    md?: number
    lg?: number
  }
  /** 是否显示为警告样式（无配置时）*/
  showAsAlert?: boolean
  /** 额外的 CSS 类名 */
  className?: string
  /** 自定义配置项 */
  customFields?: Array<{
    key: string
    label: string
    icon?: React.ComponentType<{ className?: string }>
    value?: string
    sensitive?: boolean
  }>
}

/**
 * 可复用的 OSS 配置展示组件
 * 用于显示对象存储服务的配置信息
 */
export function OSSConfigDisplay({
  config,
  showSensitiveInfo = false,
  title = "存储配置",
  noConfigText = "未找到 OSS 配置。请先配置您的对象存储设置。",
  configButtonText = "配置存储",
  onConfigClick,
  columns = { default: 1, md: 3 },
  showAsAlert = true,
  className = "",
  customFields = [],
}: OSSConfigDisplayProps) {
  // 如果没有配置，显示提示信息
  if (!config) {
    return showAsAlert ? (
      <Alert className={className}>
        <Settings className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>{noConfigText}</span>
          {onConfigClick && (
            <Button
              size="sm"
              variant="outline"
              onClick={onConfigClick}
            >
              {configButtonText}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    ) : (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <Settings className="h-12 w-12 mx-auto mb-2 text-gray-300" />
        <p className="mb-4">{noConfigText}</p>
        {onConfigClick && (
          <Button
            variant="outline"
            onClick={onConfigClick}
          >
            {configButtonText}
          </Button>
        )}
      </div>
    )
  }

  // 构建网格布局类名
  const gridClasses = [
    "grid gap-4 text-sm",
    columns.default && `grid-cols-${columns.default}`,
    columns.sm && `sm:grid-cols-${columns.sm}`,
    columns.md && `md:grid-cols-${columns.md}`,
    columns.lg && `lg:grid-cols-${columns.lg}`,
  ].filter(Boolean).join(" ")

  const ProviderIcon = providerIcons[config.provider]

  return (
    <div className={`p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg ${className}`}>
      {title && (
        <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{title}</h4>
      )}
      <div className={gridClasses}>
        {/* 基本配置信息 */}
        <ConfigField
          icon={ProviderIcon}
          label="供应商"
          value={providerDisplayNames[config.provider]}
        />
        
        <ConfigField
          icon={Database}
          label="存储桶"
          value={config.bucket}
        />

        <ConfigField
          icon={MapPin}
          label="区域"
          value={config.region}
          fallback="默认"
        />
      </div>
    </div>
  )
}

/**
 * 简化版的 OSS 配置展示组件
 * 只显示最基本的配置信息
 */
export function SimpleOSSConfigDisplay({ 
  config,
  className = "",
}: { 
  config: OSSConfig | null
  className?: string 
}) {
  if (!config) return null

  return (
    <OSSConfigDisplay
      config={config}
      columns={{ default: 3, md: 3 }}
      showAsAlert={false}
      className={className}
    />
  )
}

/**
 * 详细版的 OSS 配置展示组件
 * 显示所有配置信息，包括敏感信息
 */
export function DetailedOSSConfigDisplay({
  config,
  onConfigClick,
  className = "",
}: {
  config: OSSConfig | null
  onConfigClick?: () => void
  className?: string
}) {
  return (
    <OSSConfigDisplay
      config={config}
      showSensitiveInfo={true}
      title="详细配置信息"
      onConfigClick={onConfigClick}
      columns={{ default: 1, sm: 2, md: 3, lg: 4 }}
      className={className}
    />
  )
}

export default OSSConfigDisplay