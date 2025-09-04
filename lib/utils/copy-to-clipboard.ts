import { toast } from "sonner"

/**
 * Copy text to clipboard with toast notification
 * @param text - Text to copy to clipboard
 * @param label - Optional label for the toast message (e.g., "图片链接", "文本")
 */
export async function copyToClipboardWithToast(text: string, label?: string): Promise<void> {
  try {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || !navigator?.clipboard) {
      throw new Error('Clipboard API not available')
    }
    
    await navigator.clipboard.writeText(text)
    
    const message = label ? `${label}已复制到剪贴板` : "已复制到剪贴板"
    toast.success(message)
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    
    const message = label ? `${label}复制失败，请手动复制` : "复制失败，请手动复制"
    toast.error(message)
  }
}

/**
 * Copy URL to clipboard with default success message
 * @param url - URL to copy
 */
export async function copyUrlToClipboard(url: string): Promise<void> {
  return copyToClipboardWithToast(url, "链接")
}

/**
 * Copy image URL to clipboard with specific success message
 * @param url - Image URL to copy
 */
export async function copyImageUrlToClipboard(url: string): Promise<void> {
  return copyToClipboardWithToast(url, "图片链接")
}