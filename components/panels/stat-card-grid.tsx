"use client"

import React from "react"
import { LucideIcon, FileText, Image, CheckCircle, AlertCircle, ImageIcon, Upload } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface StatCardData {
  /** 统计项的唯一标识 */
  id: string
  /** 显示的图标 */
  icon: LucideIcon
  /** 统计项标签 */
  label: string
  /** 统计数值 */
  value: number | string
  /** 图标颜色（Tailwind CSS 类名）*/
  iconColor?: string
  /** 数值颜色（Tailwind CSS 类名）*/
  valueColor?: string
  /** 背景颜色（Tailwind CSS 类名）*/
  backgroundColor?: string
  /** 是否显示该卡片 */
  visible?: boolean
}

interface StatCardGridProps {
  /** 统计数据数组 */
  stats: StatCardData[]
  /** 网格列数配置 */
  columns?: {
    default?: number // 默认列数
    sm?: number     // 小屏幕列数
    md?: number     // 中等屏幕列数
    lg?: number     // 大屏幕列数
  }
  /** 卡片间距 */
  gap?: "sm" | "md" | "lg"
  /** 额外的 CSS 类名 */
  className?: string
  /** 卡片点击回调 */
  onCardClick?: (stat: StatCardData) => void
}

/**
 * 可复用的统计卡片网格组件
 * 用于展示各种统计信息的卡片布局
 */
export function StatCardGrid({
  stats,
  columns = { default: 2, md: 4 },
  gap = "md",
  className = "",
  onCardClick,
}: StatCardGridProps) {
  // 过滤可见的统计卡片
  const visibleStats = stats.filter(stat => stat.visible !== false)

  if (visibleStats.length === 0) {
    return null
  }

  // 构建网格类名
  const gridClasses = [
    "grid",
    columns.default && `grid-cols-${columns.default}`,
    columns.sm && `sm:grid-cols-${columns.sm}`,
    columns.md && `md:grid-cols-${columns.md}`,
    columns.lg && `lg:grid-cols-${columns.lg}`,
    gap === "sm" && "gap-2",
    gap === "md" && "gap-4", 
    gap === "lg" && "gap-6",
    className,
  ].filter(Boolean).join(" ")

  return (
    <div className={gridClasses}>
      {visibleStats.map((stat) => (
        <StatCard
          key={stat.id}
          stat={stat}
          onClick={onCardClick ? () => onCardClick(stat) : undefined}
        />
      ))}
    </div>
  )
}

interface StatCardProps {
  stat: StatCardData
  onClick?: () => void
}

function StatCard({ stat, onClick }: StatCardProps) {
  const {
    icon: Icon,
    label,
    value,
    iconColor = "text-blue-500",
    valueColor = "text-gray-900 dark:text-white",
    backgroundColor,
  } = stat

  return (
    <Card 
      className={onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
      onClick={onClick}
    >
      <CardContent className={`p-4 ${backgroundColor || ""}`}>
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconColor}`} />
          <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

/**
 * 用于文章上传页面的统计卡片配置生成器
 */
export function createArticleUploadStats({
  fileCount,
  imageCount,
  selectedCount,
  missingCount,
}: {
  fileCount: number
  imageCount: number
  selectedCount: number
  missingCount: number
}): StatCardData[] {
  return [
    {
      id: "files",
      icon: FileText,
      label: "文件",
      value: fileCount,
      iconColor: "text-blue-500",
      valueColor: "text-blue-600",
      backgroundColor: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      id: "images",
      icon: Image,
      label: "图片",
      value: imageCount,
      iconColor: "text-green-500",
      valueColor: "text-green-600", 
      backgroundColor: "bg-green-50 dark:bg-green-900/20",
    },
    {
      id: "selected",
      icon: CheckCircle,
      label: "已选择",
      value: selectedCount,
      iconColor: "text-purple-500",
      valueColor: "text-purple-600",
      backgroundColor: "bg-purple-50 dark:bg-purple-900/20",
    },
    {
      id: "missing",
      icon: AlertCircle,
      label: "缺失",
      value: missingCount,
      iconColor: "text-orange-500",
      valueColor: "text-orange-600",
      backgroundColor: "bg-orange-50 dark:bg-orange-900/20",
    },
  ]
}

/**
 * 用于图片上传页面的统计卡片配置生成器
 */
export function createImageUploadStats({
  totalFiles,
  successFiles,
  errorFiles,
  uploadingFiles,
}: {
  totalFiles: number
  successFiles: number
  errorFiles: number
  uploadingFiles: number
}): StatCardData[] {
  return [
    {
      id: "total",
      icon: ImageIcon,
      label: "总计",
      value: totalFiles,
      iconColor: "text-blue-500",
      valueColor: "text-gray-900 dark:text-white",
    },
    {
      id: "success",
      icon: CheckCircle,
      label: "成功",
      value: successFiles,
      iconColor: "text-green-500",
      valueColor: "text-green-600",
    },
    {
      id: "error",
      icon: AlertCircle,
      label: "失败",
      value: errorFiles,
      iconColor: "text-red-500",
      valueColor: "text-red-600",
    },
    {
      id: "uploading",
      icon: Upload,
      label: "上传中",
      value: uploadingFiles,
      iconColor: "text-blue-500",
      valueColor: "text-blue-600",
    },
  ]
}

export default StatCardGrid