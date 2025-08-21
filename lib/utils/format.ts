/**
 * 格式化文件大小，智能选择单位
 * @param sizeInBytes 文件大小（字节）
 * @param precision 小数位数，默认1位
 * @returns 格式化后的文件大小字符串
 */
export function formatFileSize(sizeInBytes: number, precision: number = 1): string {
  if (sizeInBytes === 0) return '0 B'
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const base = 1024
  
  // 计算适合的单位级别
  let unitIndex = 0
  let size = sizeInBytes
  
  while (size >= base && unitIndex < units.length - 1) {
    size /= base
    unitIndex++
  }
  
  // 格式化数字
  const formattedSize = unitIndex === 0 
    ? size.toString() // 字节数不显示小数
    : size.toFixed(precision)
  
  return `${formattedSize} ${units[unitIndex]}`
}

/**
 * 格式化文件大小（更人性化的显示）
 * - 小于1KB: 显示字节
 * - 1KB-1023KB: 显示KB，保留1位小数
 * - 1MB以上: 显示MB，保留1位小数
 * - 1GB以上: 显示GB，保留2位小数
 */
export function formatFileSizeHuman(sizeInBytes: number): string {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`
  }
  
  const sizeInKB = sizeInBytes / 1024
  if (sizeInKB < 1024) {
    return `${sizeInKB.toFixed(1)} KB`
  }
  
  const sizeInMB = sizeInKB / 1024
  if (sizeInMB < 1024) {
    return `${sizeInMB.toFixed(1)} MB`
  }
  
  const sizeInGB = sizeInMB / 1024
  return `${sizeInGB.toFixed(2)} GB`
}

/**
 * 格式化数字，添加千位分隔符
 * @param num 要格式化的数字
 * @returns 格式化后的数字字符串
 */
export function formatNumber(num: number): string {
  return num.toLocaleString()
}

/**
 * 格式化日期时间
 * @param date 日期对象、时间戳或日期字符串
 * @param options 格式化选项
 * @returns 格式化后的日期字符串
 */
export function formatDateTime(
  date: Date | number | string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...options
  }
  
  const dateObj = new Date(date)
  return dateObj.toLocaleDateString('zh-CN', defaultOptions)
}

/**
 * 格式化相对时间（如：2小时前）
 * @param date 日期对象、时间戳或日期字符串
 * @returns 相对时间字符串
 */
export function formatRelativeTime(date: Date | number | string): string {
  const now = new Date()
  const targetDate = new Date(date)
  const diffInSeconds = Math.floor((now.getTime() - targetDate.getTime()) / 1000)
  
  if (diffInSeconds < 60) {
    return '刚刚'
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return `${diffInMinutes}分钟前`
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return `${diffInHours}小时前`
  }
  
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) {
    return `${diffInDays}天前`
  }
  
  if (diffInDays < 30) {
    const diffInWeeks = Math.floor(diffInDays / 7)
    return `${diffInWeeks}周前`
  }
  
  if (diffInDays < 365) {
    const diffInMonths = Math.floor(diffInDays / 30)
    return `${diffInMonths}个月前`
  }
  
  const diffInYears = Math.floor(diffInDays / 365)
  return `${diffInYears}年前`
}

/**
 * 格式化上传速度
 * @param bytesPerSecond 每秒字节数
 * @returns 格式化后的速度字符串
 */
export function formatUploadSpeed(bytesPerSecond: number): string {
  return `${formatFileSize(bytesPerSecond)}/s`
}

/**
 * 格式化百分比
 * @param value 0-100的数值
 * @param precision 小数位数
 * @returns 百分比字符串
 */
export function formatPercentage(value: number, precision: number = 1): string {
  return `${value.toFixed(precision)}%`
}