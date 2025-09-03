"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertCircle, CheckCircle, Cloud, Database, Globe, Plus, Trash2, Download, Upload, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { configOperations, uploadOperations } from "@/lib/tauri-api"
import { OSSConfig, OSSProvider, OSSConnectionTest, ConfigValidation, ConfigItem, ConfigCollection } from "@/lib/types"
import type { SaveOptions } from "@/lib/types"
import { parseTauriError } from "@/lib/error-handler"
import { useAppState } from "@/lib/contexts/app-state-context"

// Calculate hash for core connection parameters only
function getCoreConfigHash(config: OSSConfig): string {
  const coreConfig = {
    provider: config.provider,
    endpoint: config.endpoint,
    access_key_id: config.access_key_id,
    access_key_secret: config.access_key_secret,
    bucket: config.bucket,
    region: config.region,
  }
  return btoa(JSON.stringify(coreConfig))
}

interface StorageConfigState {
  configs: ConfigItem[]  // 所有配置列表
  activeConfigId: string | null  // 当前活动配置ID
  config: OSSConfig | null  // 兼容旧代码：当前活动配置的 OSSConfig
  isLoading: boolean
  isTesting: boolean
  isValidating: boolean
  lastConnectionTest: OSSConnectionTest | null
  validationResult: ConfigValidation | null
  error: string | null
  lastTestedConfigHash: string | null
}

const providerTemplates = {
  [OSSProvider.AWS]: {
    name: "Amazon S3",
    icon: Cloud,
    regions: ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"],
    defaultEndpoint: "https://s3.amazonaws.com",
  },
  [OSSProvider.Aliyun]: {
    name: "阿里云 OSS",
    icon: Database,
    regions: ["oss-cn-hangzhou", "oss-cn-shanghai", "oss-cn-beijing", "oss-cn-shenzhen"],
    defaultEndpoint: "https://oss-cn-hangzhou.aliyuncs.com",
  },
  [OSSProvider.Tencent]: {
    name: "腾讯云 COS",
    icon: Globe,
    regions: ["ap-beijing", "ap-shanghai", "ap-guangzhou", "ap-chengdu"],
    defaultEndpoint: "cos.myqcloud.com",
  },
  [OSSProvider.Custom]: {
    name: "自定义 S3",
    icon: Cloud,
    regions: [],
    defaultEndpoint: "",
  },
}

export default function StoragePage() {
  const { state: appState } = useAppState()
  const [state, setState] = useState<StorageConfigState>({
    configs: [],
    activeConfigId: null,
    config: null,
    isLoading: true,
    isTesting: false,
    isValidating: false,
    lastConnectionTest: null,
    validationResult: null,
    error: null,
    lastTestedConfigHash: null,
  })

  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<'add' | 'edit'>('add')
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null)
  const [configName, setConfigName] = useState('')
  const [editConfig, setEditConfig] = useState<OSSConfig>({
    provider: OSSProvider.Aliyun,
    endpoint: "",
    access_key_id: "",
    access_key_secret: "",
    bucket: "",
    region: "",
    path_template: "images/{filename}",
    cdn_domain: undefined,
    compression_enabled: false,
    compression_quality: 80,
  })

  // Configuration change detection
  const currentConfigHash = getCoreConfigHash(editConfig)

  // 检查配置是否已变更（与上次测试或初始加载时的配置不同）
  const hasConfigChanged = state.lastTestedConfigHash != null &&
    state.lastTestedConfigHash !== currentConfigHash

  // Load configuration on component mount
  useEffect(() => {
    loadConfiguration()
  }, [])

  const loadConfiguration = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }))
      
      // 加载所有配置
      const collection = await configOperations.getAllConfigs()
      const activeConfig = collection.configs.find(c => c.is_active)
      
      setState(prev => ({
        ...prev,
        configs: collection.configs,
        activeConfigId: collection.active_config_id,
        config: activeConfig?.config || null,
        isLoading: false,
      }))
      
      if (activeConfig) {
        setEditConfig(activeConfig.config)

        // 设置基准配置哈希（即使没有缓存的连接状态）
        const originalConfigHash = getCoreConfigHash(activeConfig.config)

        // Try to load cached connection status
        try {
          const cachedStatus = await configOperations.getCachedConnectionStatus(activeConfig.config)
          if (cachedStatus) {
            setState(prev => ({
              ...prev,
              lastConnectionTest: cachedStatus,
              lastTestedConfigHash: originalConfigHash  // 使用原始配置哈希
            }))
          } else {
            // 没有缓存状态时，仍然设置基准配置哈希
            setState(prev => ({
              ...prev,
              lastTestedConfigHash: originalConfigHash
            }))
          }
        } catch (error) {
          console.warn('Failed to load cached connection status:', error)
          // 即使加载缓存失败，也要设置基准配置哈希
          setState(prev => ({
            ...prev,
            lastTestedConfigHash: originalConfigHash
          }))
        }
      } else {
        // 如果没有已保存的配置，设置一个空配置的基准哈希
        // 这样当用户开始编辑时，会立即检测到变更
        const emptyConfigHash = getCoreConfigHash(editConfig)
        setState(prev => ({
          ...prev,
          lastTestedConfigHash: emptyConfigHash
        }))
      }
    } catch (error) {
      const errorMessage = parseTauriError(error).message
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }))
    }
  }

  const handleCancelEdit = () => {
    if (sheetMode === 'add') {
      // 取消添加配置，恢复到默认配置
      const defaultConfig = {
        provider: OSSProvider.Aliyun,
        endpoint: "",
        access_key_id: "",
        access_key_secret: "",
        bucket: "",
        region: "",
        path_template: "images/{filename}",
        cdn_domain: undefined,
        compression_enabled: false,
        compression_quality: 80,
      }
      setEditConfig(defaultConfig)

      const defaultConfigHash = getCoreConfigHash(defaultConfig)
      setState(prev => ({
        ...prev,
        error: null,
        lastTestedConfigHash: defaultConfigHash,
        lastConnectionTest: null,
      }))
    } else {
      // 取消编辑，恢复到原始配置状态
      if (state.config) {
        setEditConfig(state.config)

        const originalConfigHash = getCoreConfigHash(state.config)
        setState(prev => ({
          ...prev,
          error: null,
          lastTestedConfigHash: originalConfigHash,
          lastConnectionTest: null,
        }))
      }
    }

    setIsSheetOpen(false)
  }

  const handleSaveConfig = async () => {
    try {
      setState(prev => ({ ...prev, isValidating: true, error: null }))

      // 验证配置名称
      if (!configName.trim()) {
        setState(prev => ({
          ...prev,
          error: '请输入配置名称',
          isValidating: false
        }))
        return
      }

      // Prepare save options for force revalidation if config changed
      const saveOptions: SaveOptions | undefined = hasConfigChanged ?
        { force_revalidate: true } : undefined

      // Validate configuration first
      const validation = await configOperations.validateOSSConfig(editConfig)
      setState(prev => ({ ...prev, validationResult: validation }))

      if (!validation.valid) {
        setState(prev => ({
          ...prev,
          error: `Configuration validation failed: ${validation.errors.join(', ')}`,
          isValidating: false
        }))
        return
      }

      // 创建或更新配置项
      const configItem: ConfigItem = {
        id: editingConfigId || await uploadOperations.generateUuid(),
        name: configName,
        config: editConfig,
        is_active: sheetMode === 'add' || state.configs.length === 0,
        created_at: sheetMode === 'add' ? new Date().toISOString() : 
          state.configs.find(c => c.id === editingConfigId)?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // 保存配置项
      await configOperations.saveConfigItem(configItem)
      
      // 重新加载配置列表
      await loadConfiguration()
      
      setState(prev => ({
        ...prev,
        isValidating: false,
        lastConnectionTest: validation.connection_test || null,
        lastTestedConfigHash: currentConfigHash // Update the hash after successful save
      }))

      // 关闭抽屉
      setIsSheetOpen(false)
    } catch (error) {
      const errorMessage = parseTauriError(error).message
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isValidating: false
      }))
    }
  }

  const handleTestConnection = async () => {
    try {
      setState(prev => ({ ...prev, isTesting: true, error: null }))
      const connectionTest = await configOperations.testOSSConnection(editConfig)

      // Check if connection test failed and set error accordingly
      const errorMessage = connectionTest.success ? null : (connectionTest.error || "连接测试失败")

      setState(prev => ({
        ...prev,
        lastConnectionTest: connectionTest,
        isTesting: false,
        error: errorMessage,
        lastTestedConfigHash: connectionTest.success ? currentConfigHash : prev.lastTestedConfigHash // Only update hash on successful test
      }))
    } catch (error) {
      const errorMessage = parseTauriError(error).message
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isTesting: false
      }))
    }
  }

  const handleExportConfig = async () => {
    try {
      const configJson = await configOperations.exportOSSConfig()

      // Create and download file
      const blob = new Blob([configJson], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `imgtoss-config-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      const errorMessage = parseTauriError(error).message
      setState(prev => ({ ...prev, error: errorMessage }))
    }
  }

  const handleImportConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const configJson = await file.text()
      await configOperations.importOSSConfig(configJson)
      await loadConfiguration() // Reload the configuration
    } catch (error) {
      const errorMessage = parseTauriError(error).message
      setState(prev => ({ ...prev, error: errorMessage }))
    }

    // Reset file input
    event.target.value = ''
  }

  const handleStartEdit = (configItem: ConfigItem) => {
    setEditConfig(configItem.config)
    setConfigName(configItem.name)
    setEditingConfigId(configItem.id)
    const originalConfigHash = getCoreConfigHash(configItem.config)
    setState(prev => ({
      ...prev,
      lastTestedConfigHash: originalConfigHash,
      lastConnectionTest: null,
      error: null
    }))
    setSheetMode('edit')
    setIsSheetOpen(true)
  }

  const handleStartAdd = () => {
    const defaultConfig = {
      provider: OSSProvider.Aliyun,
      endpoint: providerTemplates[OSSProvider.Aliyun].defaultEndpoint,
      access_key_id: "",
      access_key_secret: "",
      bucket: "",
      region: providerTemplates[OSSProvider.Aliyun].regions[0] || "",
      path_template: "images/{filename}",
      cdn_domain: undefined,
      compression_enabled: false,
      compression_quality: 80,
    }
    setEditConfig(defaultConfig)
    setConfigName('')
    setEditingConfigId(null)
    const defaultConfigHash = getCoreConfigHash(defaultConfig)
    setState(prev => ({
      ...prev,
      lastTestedConfigHash: defaultConfigHash,
      lastConnectionTest: null,
      error: null
    }))
    setSheetMode('add')
    setIsSheetOpen(true)
  }

  const handleProviderChange = (provider: OSSProvider) => {
    const template = providerTemplates[provider]
    setEditConfig(prev => ({
      ...prev,
      provider,
      endpoint: template.defaultEndpoint,
      region: template.regions[0] || "",
    }))
  }

  const handleDeleteConfig = async (configId: string) => {
    if (!confirm('确定要删除这个配置吗？')) {
      return
    }
    
    try {
      await configOperations.deleteConfigItem(configId)
      await loadConfiguration()
    } catch (error) {
      const errorMessage = parseTauriError(error).message
      setState(prev => ({
        ...prev,
        error: errorMessage,
      }))
    }
  }

  const handleSetActiveConfig = async (configId: string) => {
    try {
      await configOperations.setActiveConfig(configId)
      await loadConfiguration()
    } catch (error) {
      const errorMessage = parseTauriError(error).message
      setState(prev => ({
        ...prev,
        error: errorMessage,
      }))
    }
  }

  const getSaveButtonText = (configChanged?: boolean, isValidating?: boolean) => {
    if (isValidating) return "验证中..."
    if (configChanged) return "验证并保存"
    return "保存配置"
  }

  const getTestButtonStyle = (configChanged?: boolean) => {
    if (configChanged) return "border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100"
    return ""
  }

  // 渲染配置表单内容（可滚动部分）
  const renderConfigFormContent = () => (
    <div className="space-y-6 py-6 pl-2">
      {/* Error Display */}
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {/* 配置名称 */}
        <div className="space-y-2">
          <Label htmlFor="config-name">配置名称 *</Label>
          <Input
            id="config-name"
            placeholder="例如：个人存储、公司存储"
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            给这个配置起一个容易识别的名称
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="provider-type">存储类型</Label>
            <Select
              value={editConfig.provider}
              onValueChange={(value) => handleProviderChange(value as OSSProvider)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(providerTemplates).map(([key, template]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      <template.icon className="h-4 w-4" />
                      {template.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="endpoint">端点地址</Label>
            <Input
              id="endpoint"
              placeholder={editConfig.provider === OSSProvider.Tencent
                ? "例如：cos.myqcloud.com"
                : "例如：https://oss-cn-hangzhou.aliyuncs.com"
              }
              value={editConfig.endpoint}
              onChange={(e) => setEditConfig(prev => ({ ...prev, endpoint: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="access-key">访问密钥 (Access Key)</Label>
            <Input
              id="access-key"
              placeholder={editConfig.provider === OSSProvider.Tencent
                ? "输入SecretId"
                : "输入访问密钥"
              }
              value={editConfig.access_key_id}
              onChange={(e) => setEditConfig(prev => ({ ...prev, access_key_id: e.target.value }))}
            />
            {editConfig.provider === OSSProvider.Tencent && (
              <p className="text-xs text-muted-foreground">
                腾讯云使用SecretId作为访问密钥
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="secret-key">私有密钥 (Secret Key)</Label>
            <Input
              id="secret-key"
              type="password"
              placeholder={editConfig.provider === OSSProvider.Tencent
                ? "输入SecretKey"
                : "输入私有密钥"
              }
              value={editConfig.access_key_secret}
              onChange={(e) => setEditConfig(prev => ({ ...prev, access_key_secret: e.target.value }))}
            />
            {editConfig.provider === OSSProvider.Tencent && (
              <p className="text-xs text-muted-foreground">
                腾讯云使用SecretKey作为私有密钥
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="bucket">存储桶名称</Label>
            <Input
              id="bucket"
              placeholder={editConfig.provider === OSSProvider.Tencent
                ? "例如：mybucket-1234567890"
                : "输入存储桶名称"
              }
              value={editConfig.bucket}
              onChange={(e) => setEditConfig(prev => ({ ...prev, bucket: e.target.value }))}
            />
            {editConfig.provider === OSSProvider.Tencent && (
              <p className="text-xs text-muted-foreground">
                腾讯云COS存储桶格式：存储桶名称-APPID (如：mybucket-1234567890)
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="region">区域</Label>
            {providerTemplates[editConfig.provider].regions.length > 0 ? (
              <Select
                value={editConfig.region}
                onValueChange={(value) => setEditConfig(prev => ({ ...prev, region: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择区域" />
                </SelectTrigger>
                <SelectContent>
                  {providerTemplates[editConfig.provider].regions.map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="region"
                placeholder="输入区域"
                value={editConfig.region}
                onChange={(e) => setEditConfig(prev => ({ ...prev, region: e.target.value }))}
              />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="path-template">路径模板</Label>
          <Input
            id="path-template"
            placeholder="例如：images/{date}/{filename}"
            value={editConfig.path_template}
            onChange={(e) => setEditConfig(prev => ({ ...prev, path_template: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cdn-domain">CDN 域名 (可选)</Label>
          <Input
            id="cdn-domain"
            placeholder="例如：https://cdn.example.com"
            value={editConfig.cdn_domain || ""}
            onChange={(e) => setEditConfig(prev => ({ ...prev, cdn_domain: e.target.value || undefined }))}
          />
        </div>

        {/* Validation Results */}
        {state.validationResult && !state.validationResult.valid && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              配置验证失败：{state.validationResult.errors.join(', ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Connection Test Results */}
        {(() => {
          // 在添加模式下，只显示当前会话的测试结果 (state.lastConnectionTest)
          // 在编辑模式下，可以显示之前的测试结果作为参考
          const connectionTest = sheetMode === 'add'
            ? state.lastConnectionTest  // 添加模式：只显示当前测试结果
            : (state.lastConnectionTest || appState.lastConnectionTest)  // 编辑模式：优先显示当前测试，回退到应用状态

          if (!connectionTest) return null

          return (
            <Alert variant={connectionTest.success ? "default" : "destructive"}
              className={connectionTest.success ? "border-green-200 bg-green-50 text-green-800" : ""}>
              {connectionTest.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription className={connectionTest.success ? "text-green-800" : ""}>
                {connectionTest.success
                  ? `连接测试成功 (延迟: ${connectionTest.latency}ms)`
                  : `连接测试失败: ${connectionTest.error}`
                }
                {/* 显示 bucket 验证信息 */}
                {connectionTest.bucket_exists === false && (
                  <div className="mt-2">
                    <div className="text-sm font-medium">可用的存储桶：</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {connectionTest.available_buckets?.length
                        ? connectionTest.available_buckets.join(', ')
                        : '无法获取存储桶列表'
                      }
                    </div>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )
        })()}

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {editConfig.provider === OSSProvider.Tencent ? (
              <>
                腾讯云COS配置说明：
                <br />• 存储桶格式：bucket-name-appid（可在腾讯云控制台查看完整格式）
                <br />• SecretId/SecretKey：在腾讯云访问管理(CAM)中获取
                <br />• 确保密钥具有对应存储桶的读写权限
                <br />• 应用启动时将自动进行连接测试，无需每次手动测试
                <br />配置保存前会自动进行连接测试。
              </>
            ) : (
              <>
                请确保提供的访问密钥具有对应存储桶的读写权限。
                <br />• 应用启动时将自动进行连接测试，无需每次手动测试
                <br />配置保存前会自动进行连接测试。
              </>
            )}
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )

  // 渲染配置表单底部按钮（固定部分）
  const renderConfigFormFooter = () => (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={handleCancelEdit}>
        取消
      </Button>
      <Button
        variant="outline"
        onClick={handleTestConnection}
        disabled={state.isTesting}
        className={getTestButtonStyle(hasConfigChanged)}
      >
        {state.isTesting ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : null}
        测试连通性
      </Button>
      <Button
        onClick={handleSaveConfig}
        disabled={state.isValidating}
      >
        {state.isValidating ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : null}
        {getSaveButtonText(hasConfigChanged, state.isValidating)}
      </Button>
    </div>
  )

  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>加载配置中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">存储配置</h1>
          <p className="text-muted-foreground mt-2">配置和管理对象存储服务提供商</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 次要操作 */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".json"
              onChange={handleImportConfig}
              className="hidden"
              id="import-config"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('import-config')?.click()}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              导入
            </Button>
            {state.config && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportConfig}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                导出
              </Button>
            )}
          </div>

          {/* 主要操作 */}
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button
                onClick={handleStartAdd}
                className="flex items-center gap-2"
                size="default"
              >
                <Plus className="h-4 w-4" />
                添加配置
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[60vw] sm:max-w-[60vw] flex flex-col h-full overflow-hidden p-0">
              <SheetHeader className="flex-shrink-0 p-6 pb-0">
                <SheetTitle>
                  {sheetMode === 'add' ? '添加存储配置' : '编辑存储配置'}
                </SheetTitle>
                <SheetDescription>
                  配置对象存储服务提供商以开始使用图片上传功能
                </SheetDescription>
              </SheetHeader>

              {/* 可滚动的配置表单内容 */}
              <ScrollArea className="flex-1 px-6">
                <div className="pr-3">
                  {renderConfigFormContent()}
                </div>
              </ScrollArea>

              {/* 固定在底部的按钮区域 */}
              <div className="flex-shrink-0 border-t p-6 pt-4">
                <div className="pr-3">
                  {renderConfigFormFooter()}
                </div>
              </div>

            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Error Display */}
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Configuration List */}
      {state.configs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>配置列表</CardTitle>
            <CardDescription>管理您的所有存储配置</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {state.configs.map((configItem) => {
                const template = providerTemplates[configItem.config.provider]
                return (
                  <div
                    key={configItem.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      configItem.is_active ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <template.icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{configItem.name}</span>
                          {configItem.is_active && (
                            <Badge className="bg-green-500 text-white hover:bg-green-600 border-transparent">
                              当前使用
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {template.name} - {configItem.config.bucket}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!configItem.is_active && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetActiveConfig(configItem.id)}
                        >
                          设为活动
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStartEdit(configItem)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteConfig(configItem.id)}
                        disabled={configItem.is_active && state.configs.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Configuration Message */}
      {state.configs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Cloud className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">尚未配置存储服务</h3>
            <p className="text-muted-foreground text-center mb-4">
              请添加一个对象存储配置以开始使用图片上传功能
            </p>
            <Button onClick={handleStartAdd}>
              <Plus className="h-4 w-4 mr-2" />
              添加配置
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
