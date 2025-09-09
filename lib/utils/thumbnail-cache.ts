/**
 * 前端缩略图缓存管理器
 * 实现内存缓存、并发控制、超时处理和重试机制
 */

export interface ThumbnailCacheItem {
  data: string // base64 数据
  timestamp: number // 缓存时间戳
  size: number // 数据大小（字节）
}

export interface ThumbnailLoadOptions {
  timeout?: number // 超时时间（毫秒）
  maxRetries?: number // 最大重试次数
  retryDelay?: number // 重试延迟（毫秒）
}

export interface ConcurrencyConfig {
  maxConcurrent: number // 最大并发数
  queueTimeout: number // 队列超时时间
}

export interface CacheStats {
  size: number // 缓存项数量
  memoryUsage: number // 内存使用量（字节）
  hitRate: number // 命中率
  totalRequests: number // 总请求数
  cacheHits: number // 缓存命中数
}

/**
 * 缩略图缓存管理器
 */
export class ThumbnailCacheManager {
  private cache = new Map<string, ThumbnailCacheItem>()
  private loadingPromises = new Map<string, Promise<string>>()
  private concurrentRequests = new Set<string>()
  private requestQueue: Array<{
    key: string
    resolve: (value: string) => void
    reject: (error: Error) => void
    timestamp: number
  }> = []
  
  // 统计信息
  private stats = {
    totalRequests: 0,
    cacheHits: 0,
  }
  
  // 配置
  private readonly maxCacheSize: number
  private readonly maxMemoryUsage: number // 字节
  private readonly concurrencyConfig: ConcurrencyConfig
  private readonly defaultOptions: Required<ThumbnailLoadOptions>
  
  constructor(
    maxCacheSize = 100,
    maxMemoryUsageMB = 50,
    concurrencyConfig: ConcurrencyConfig = {
      maxConcurrent: 12, // 增加并发数到12
      queueTimeout: 45000, // 增加队列超时到45秒
    }
  ) {
    this.maxCacheSize = maxCacheSize
    this.maxMemoryUsage = maxMemoryUsageMB * 1024 * 1024 // 转换为字节
    this.concurrencyConfig = concurrencyConfig
    this.defaultOptions = {
      timeout: 5000, // 5秒超时
      maxRetries: 3,
      retryDelay: 1000, // 1秒重试延迟
    }
    
    // 启动定期清理任务
    this.startPeriodicCleanup()
  }
  
  /**
   * 获取缓存的缩略图
   */
  async getThumbnail(
    recordId: string,
    imageUrl: string,
    loader: (recordId: string, imageUrl: string) => Promise<string>,
    options?: ThumbnailLoadOptions
  ): Promise<string> {
    const cacheKey = this.getCacheKey(recordId, imageUrl)
    const opts = { ...this.defaultOptions, ...options }
    
    this.stats.totalRequests++
    
    // 检查缓存
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      this.stats.cacheHits++
      return cached.data
    }
    
    // 检查是否正在加载
    const existingPromise = this.loadingPromises.get(cacheKey)
    if (existingPromise) {
      return existingPromise
    }
    
    // 创建加载 Promise
    const loadPromise = this.loadWithConcurrencyControl(
      cacheKey,
      recordId,
      imageUrl,
      loader,
      opts
    )
    
    this.loadingPromises.set(cacheKey, loadPromise)
    
    try {
      const result = await loadPromise
      return result
    } finally {
      this.loadingPromises.delete(cacheKey)
    }
  }
  
  /**
   * 并发控制的加载方法
   */
  private async loadWithConcurrencyControl(
    cacheKey: string,
    recordId: string,
    imageUrl: string,
    loader: (recordId: string, imageUrl: string) => Promise<string>,
    options: Required<ThumbnailLoadOptions>
  ): Promise<string> {
    // 检查并发限制
    if (this.concurrentRequests.size >= this.concurrencyConfig.maxConcurrent) {
      return this.queueRequest(cacheKey, recordId, imageUrl, loader, options)
    }
    
    return this.executeLoad(cacheKey, recordId, imageUrl, loader, options)
  }
  
  /**
   * 将请求加入队列
   */
  private async queueRequest(
    cacheKey: string,
    recordId: string,
    imageUrl: string,
    loader: (recordId: string, imageUrl: string) => Promise<string>,
    options: Required<ThumbnailLoadOptions>
  ): Promise<string> {
    console.log(`缩略图请求进入队列: ${recordId}, 当前队列长度: ${this.requestQueue.length}, 并发数: ${this.concurrentRequests.size}`)
    
    return new Promise((resolve, reject) => {
      const queueItem = {
        key: cacheKey,
        resolve: (value: string) => resolve(value),
        reject: (error: Error) => reject(error),
        timestamp: Date.now(),
      }
      
      this.requestQueue.push(queueItem)
      
      // 设置队列超时
      const timeoutId = setTimeout(() => {
        const index = this.requestQueue.indexOf(queueItem)
        if (index !== -1) {
          this.requestQueue.splice(index, 1)
          console.warn(`缩略图请求队列超时: ${recordId}`)
          reject(new Error(`缩略图请求队列超时: ${recordId}`))
        }
      }, this.concurrencyConfig.queueTimeout)
      
      // 当请求完成时清除超时
      const originalResolve = queueItem.resolve
      const originalReject = queueItem.reject
      
      queueItem.resolve = (value: string) => {
        clearTimeout(timeoutId)
        originalResolve(value)
      }
      
      queueItem.reject = (error: Error) => {
        clearTimeout(timeoutId)
        originalReject(error)
      }
      
      // 尝试处理队列
      this.processQueue(loader, options)
    })
  }
  
  /**
   * 处理请求队列
   */
  private async processQueue(
    loader: (recordId: string, imageUrl: string) => Promise<string>,
    options: Required<ThumbnailLoadOptions>
  ) {
    while (
      this.requestQueue.length > 0 &&
      this.concurrentRequests.size < this.concurrencyConfig.maxConcurrent
    ) {
      const queueItem = this.requestQueue.shift()
      if (!queueItem) break
      
      // 检查是否已超时
      if (Date.now() - queueItem.timestamp > this.concurrencyConfig.queueTimeout) {
        queueItem.reject(new Error('请求队列超时'))
        continue
      }
      
      // 从缓存键解析参数
      const [recordId, imageUrl] = this.parseCacheKey(queueItem.key)
      
      try {
        const result = await this.executeLoad(
          queueItem.key,
          recordId,
          imageUrl,
          loader,
          options
        )
        queueItem.resolve(result)
      } catch (error) {
        queueItem.reject(error as Error)
      }
    }
  }
  
  /**
   * 执行实际的加载操作
   */
  private async executeLoad(
    cacheKey: string,
    recordId: string,
    imageUrl: string,
    loader: (recordId: string, imageUrl: string) => Promise<string>,
    options: Required<ThumbnailLoadOptions>
  ): Promise<string> {
    this.concurrentRequests.add(cacheKey)
    console.log(`开始加载缩略图: ${recordId}, 当前并发数: ${this.concurrentRequests.size}`)
    
    try {
      const startTime = Date.now()
      const result = await this.loadWithRetry(recordId, imageUrl, loader, options)
      const loadTime = Date.now() - startTime
      
      console.log(`缩略图加载成功: ${recordId}, 耗时: ${loadTime}ms`)
      
      // 缓存结果
      this.setCache(cacheKey, result)
      
      return result
    } catch (error) {
      console.error(`缩略图加载失败: ${recordId}`, error)
      throw error
    } finally {
      this.concurrentRequests.delete(cacheKey)
      console.log(`缩略图加载完成: ${recordId}, 当前并发数: ${this.concurrentRequests.size}`)
      
      // 继续处理队列
      this.processQueue(loader, options)
    }
  }
  
  /**
   * 带重试的加载方法
   */
  private async loadWithRetry(
    recordId: string,
    imageUrl: string,
    loader: (recordId: string, imageUrl: string) => Promise<string>,
    options: Required<ThumbnailLoadOptions>
  ): Promise<string> {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        // 设置超时
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('缩略图加载超时')), options.timeout)
        })
        
        const loadPromise = loader(recordId, imageUrl)
        const result = await Promise.race([loadPromise, timeoutPromise])
        
        return result
      } catch (error) {
        lastError = error as Error
        
        // 如果不是最后一次尝试，等待后重试
        if (attempt < options.maxRetries) {
          await this.delay(options.retryDelay * Math.pow(2, attempt)) // 指数退避
        }
      }
    }
    
    throw lastError || new Error('缩略图加载失败')
  }
  
  /**
   * 从缓存获取数据
   */
  private getFromCache(key: string): ThumbnailCacheItem | null {
    const item = this.cache.get(key)
    if (!item) return null
    
    // 检查是否过期（30分钟）
    const maxAge = 30 * 60 * 1000
    if (Date.now() - item.timestamp > maxAge) {
      this.cache.delete(key)
      return null
    }
    
    return item
  }
  
  /**
   * 设置缓存
   */
  private setCache(key: string, data: string) {
    const size = this.estimateDataSize(data)
    const item: ThumbnailCacheItem = {
      data,
      timestamp: Date.now(),
      size,
    }
    
    // 检查缓存大小限制
    this.ensureCacheCapacity(size)
    
    this.cache.set(key, item)
  }
  
  /**
   * 确保缓存容量
   */
  private ensureCacheCapacity(newItemSize: number) {
    // 检查数量限制
    while (this.cache.size >= this.maxCacheSize) {
      this.evictOldestItem()
    }
    
    // 检查内存限制
    let currentMemoryUsage = this.getCurrentMemoryUsage()
    while (currentMemoryUsage + newItemSize > this.maxMemoryUsage && this.cache.size > 0) {
      this.evictOldestItem()
      currentMemoryUsage = this.getCurrentMemoryUsage()
    }
  }
  
  /**
   * 淘汰最旧的缓存项
   */
  private evictOldestItem() {
    let oldestKey: string | null = null
    let oldestTimestamp = Date.now()
    
    for (const [key, item] of this.cache.entries()) {
      if (item.timestamp < oldestTimestamp) {
        oldestTimestamp = item.timestamp
        oldestKey = key
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }
  
  /**
   * 获取当前内存使用量
   */
  private getCurrentMemoryUsage(): number {
    let total = 0
    for (const item of this.cache.values()) {
      total += item.size
    }
    return total
  }
  
  /**
   * 估算数据大小
   */
  private estimateDataSize(base64Data: string): number {
    // Base64 编码大约比原始数据大 33%
    return Math.ceil((base64Data.length * 3) / 4)
  }
  
  /**
   * 生成缓存键
   */
  private getCacheKey(recordId: string, imageUrl: string): string {
    return `${recordId}:${imageUrl}`
  }
  
  /**
   * 解析缓存键
   */
  private parseCacheKey(cacheKey: string): [string, string] {
    const [recordId, imageUrl] = cacheKey.split(':', 2)
    return [recordId, imageUrl]
  }
  
  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  
  /**
   * 启动定期清理任务
   */
  private startPeriodicCleanup() {
    // 每5分钟清理一次过期缓存
    setInterval(() => {
      this.cleanupExpiredItems()
    }, 5 * 60 * 1000)
  }
  
  /**
   * 清理过期的缓存项
   */
  private cleanupExpiredItems() {
    const maxAge = 30 * 60 * 1000 // 30分钟
    const now = Date.now()
    
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > maxAge) {
        this.cache.delete(key)
      }
    }
  }
  
  /**
   * 手动清理缓存
   */
  clearCache() {
    this.cache.clear()
    this.loadingPromises.clear()
    this.concurrentRequests.clear()
    this.requestQueue.length = 0
    
    // 重置统计信息
    this.stats.totalRequests = 0
    this.stats.cacheHits = 0
  }
  
  /**
   * 获取缓存统计信息
   */
  getCacheStats(): CacheStats {
    const memoryUsage = this.getCurrentMemoryUsage()
    const hitRate = this.stats.totalRequests > 0 
      ? this.stats.cacheHits / this.stats.totalRequests 
      : 0
    
    return {
      size: this.cache.size,
      memoryUsage,
      hitRate,
      totalRequests: this.stats.totalRequests,
      cacheHits: this.stats.cacheHits,
    }
  }
  
  /**
   * 预加载缩略图
   */
  async preloadThumbnails(
    records: Array<{ id: string; uploaded_url: string }>,
    loader: (recordId: string, imageUrl: string) => Promise<string>,
    options?: ThumbnailLoadOptions
  ): Promise<void> {
    const promises = records.map(record => 
      this.getThumbnail(record.id, record.uploaded_url, loader, options)
        .catch(error => {
          console.warn(`预加载缩略图失败 ${record.id}:`, error)
          return null
        })
    )
    
    await Promise.allSettled(promises)
  }
}

// 导出单例实例
export const thumbnailCache = new ThumbnailCacheManager()