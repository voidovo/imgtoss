"use client"

import React from "react"
import { Image, Copy } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FilenameDisplay } from "@/components/ui/filename-display"
import type { UploadHistoryRecord } from "@/lib/types"

interface HistoryRecordListProps {
  /** 历史记录数据 */
  records: UploadHistoryRecord[]
  /** 卡片标题 */
  title?: string
  /** 卡片描述 */
  description?: string
  /** 复制链接的回调函数 */
  onCopyLink?: (url: string) => void | Promise<void>
  /** 最大显示文件名长度 */
  maxFileNameLength?: number
  /** 是否显示空状态 */
  showEmptyState?: boolean
  /** 空状态文本 */
  emptyStateText?: string
  /** 自定义空状态组件 */
  emptyStateComponent?: React.ReactNode
  /** 额外的 CSS 类名 */
  className?: string
}

/**
 * 可复用的历史记录列表组件
 * 用于展示上传历史记录，支持多种配置选项
 */
export function HistoryRecordList({
  records,
  title = "最近上传记录",
  description,
  onCopyLink,
  maxFileNameLength = 25,
  showEmptyState = true,
  emptyStateText = "暂无上传记录",
  emptyStateComponent,
  className = "",
}: HistoryRecordListProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {records.length > 0 ? (
            records.map((record) => (
              <HistoryRecordItem
                key={record.id}
                record={record}
                onCopyLink={onCopyLink}
                maxFileNameLength={maxFileNameLength}
              />
            ))
          ) : showEmptyState ? (
            emptyStateComponent || <DefaultEmptyState text={emptyStateText} />
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

interface HistoryRecordItemProps {
  record: UploadHistoryRecord
  onCopyLink?: (url: string) => void | Promise<void>
  maxFileNameLength: number
}

function HistoryRecordItem({ record, onCopyLink, maxFileNameLength }: HistoryRecordItemProps) {
  const handleCopyClick = async () => {
    if (onCopyLink && record?.uploaded_url) {
      await onCopyLink(record.uploaded_url)
    }
  }

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
          <Image className="h-5 w-5 text-gray-500" />
        </div>
        <div>
          <p className="font-medium text-sm">
            <FilenameDisplay
              filePath={record.image_name || 'Unknown file'}
              maxLength={maxFileNameLength}
              showTooltip={true}
            />
          </p>
          <p className="text-xs text-gray-500">
            {new Date(record.timestamp).toLocaleString()}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge
          variant="default"
          className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
        >
          已上传
        </Badge>
        {record.uploaded_url && onCopyLink && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyClick}
          >
            <Copy className="h-3 w-3 mr-1" />
            复制链接
          </Button>
        )}
      </div>
    </div>
  )
}

function DefaultEmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-8 text-gray-500">
      <Image className="h-12 w-12 mx-auto mb-2 text-gray-300" />
      <p>{text}</p>
    </div>
  )
}

export default HistoryRecordList