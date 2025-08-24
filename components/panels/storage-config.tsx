"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { AlertCircle, AlertTriangle, CheckCircle, Cloud, Database, Globe, Key, Plus, Settings, Trash2, TestTube, Download, Upload, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { configOperations } from "@/lib/tauri-api"
import { OSSConfig, OSSProvider, OSSConnectionTest, ConfigValidation } from "@/lib/types"
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
  config: OSSConfig | null
  isLoading: boolean
  isTesting: boolean
  isValidating: boolean
  lastConnectionTest: OSSConnectionTest | null
  validationResult: ConfigValidation | null
  error: string | null
  lastTestedConfigHash: string | null // New: track last tested configuration
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

export function StorageConfig() {
  const { state: appState } = useAppState()
  const [state, setState] = useState<StorageConfigState>({
    config: null,
    isLoading: true,
    isTesting: false,
    isValidating: false,
    lastConnectionTest: null,
    validationResult: null,
    error: null,
    lastTestedConfigHash: null,
  })

  const [isEditing, setIsEditing] = useState(false)
  const [editConfig, setEditConfig] = useState<OSSConfig>({
    provider: OSSProvider.Aliyun,
    endpoint: "",
    access_key_id: "",
    access_key_secret: "",
    bucket: "",
    region: "",
    path_template: "images/{filename}",
    cdn_domain: undefined,
    compression_enabled: true,
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
      const config = await configOperations.loadOSSConfig()
      setState(prev => ({
        ...prev,
        config,
        isLoading: false,
      }))
      if (config) {
        setEditConfig(config)
        
        // 设置基准配置哈希（即使没有缓存的连接状态）
        const originalConfigHash = getCoreConfigHash(config)
        
        // Try to load cached connection status
        try {
          const cachedStatus = await configOperations.getCachedConnectionStatus(config)
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
    // 撤销编辑，恢复到原始配置状态
    if (state.config) {
      // 如果有已保存的配置，恢复到原始配置
      setEditConfig(state.config)
      
      // 恢复基准配置哈希到原始配置
      const originalConfigHash = getCoreConfigHash(state.config)
      setState(prev => ({
        ...prev,
        error: null,
        lastTestedConfigHash: originalConfigHash,
        // 如果在编辑过程中进行了手动测试，清除这些结果
        // 只保留来自AppState的自动测试结果
        lastConnectionTest: null, // 清除组件本地的测试结果
      }))
    } else {
      // 如果没有已保存的配置，恢复到默认配置
      const defaultConfig = {
        provider: OSSProvider.Aliyun,
        endpoint: "",
        access_key_id: "",
        access_key_secret: "",
        bucket: "",
        region: "",
        path_template: "images/{filename}",
        cdn_domain: undefined,
        compression_enabled: true,
        compression_quality: 80,
      }
      setEditConfig(defaultConfig)
      
      // 恢复到默认配置的基准哈希
      const defaultConfigHash = getCoreConfigHash(defaultConfig)
      setState(prev => ({
        ...prev,
        error: null,
        lastTestedConfigHash: defaultConfigHash,
        lastConnectionTest: null, // 清除编辑过程中的测试结果
      }))
    }
    
    // 退出编辑模式
    setIsEditing(false)
  }

  const handleSaveConfig = async () => {
    try {
      setState(prev => ({ ...prev, isValidating: true, error: null }))

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

      // Save configuration with force revalidation if needed
      await configOperations.saveOSSConfig(editConfig, saveOptions)
      setState(prev => ({
        ...prev,
        config: editConfig,
        isValidating: false,
        lastConnectionTest: validation.connection_test || null,
        lastTestedConfigHash: currentConfigHash // Update the hash after successful save
      }))
      setIsEditing(false)
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

  const handleProviderChange = (provider: OSSProvider) => {
    const template = providerTemplates[provider]
    setEditConfig(prev => ({
      ...prev,
      provider,
      endpoint: template.defaultEndpoint,
      region: template.regions[0] || "",
    }))
  }

  const getStatusColor = (success?: boolean, configChanged?: boolean) => {
    if (configChanged) return "text-amber-600"
    if (success === undefined) return "text-gray-500"
    return success ? "text-green-600" : "text-red-600"
  }

  const getStatusIcon = (success?: boolean, configChanged?: boolean) => {
    if (configChanged) return AlertTriangle
    if (success === undefined) return TestTube
    return success ? CheckCircle : AlertCircle
  }

  const getStatusText = (success?: boolean, configChanged?: boolean) => {
    if (configChanged) return "配置已变更，需重新测试"
    if (success === undefined) return "启动时将自动测试连通性"
    return success ? "连接成功" : "连接失败"
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

  // Helper to get connection status for display  
  const getDisplayConnectionStatus = () => {
    // Prioritize manual test results (state.lastConnectionTest) over automatic test results (appState.lastConnectionTest)
    const connectionTest = state.lastConnectionTest || appState.lastConnectionTest
    
    // Debug logging
    console.log('StorageConfig - Connection status debug:', {
      appStateTest: appState.lastConnectionTest,
      localStateTest: state.lastConnectionTest,
      selectedTest: connectionTest,
      success: connectionTest?.success,
      hasConfigChanged,
    })
    
    if (connectionTest) {
      return {
        success: connectionTest.success,
        hasConfigChanged: state.lastConnectionTest ? false : hasConfigChanged
      }
    }
    
    return {
      success: undefined,
      hasConfigChanged: false
    }
  }

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
            onClick={() => document.getElementById('import-config')?.click()}
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            导入配置
          </Button>
          {state.config && (
            <Button
              variant="outline"
              onClick={handleExportConfig}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              导出配置
            </Button>
          )}
          <Button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {state.config ? "编辑配置" : "添加配置"}
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Current Configuration Display */}
      {state.config && !isEditing && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(() => {
                  const template = providerTemplates[state.config.provider]
                  const displayStatus = getDisplayConnectionStatus()
                  const StatusIcon = getStatusIcon(displayStatus.success, displayStatus.hasConfigChanged)
                  return (
                    <>
                      <template.icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-lg">当前存储配置</CardTitle>
                        <CardDescription>{template.name}</CardDescription>
                      </div>
                    </>
                  )
                })()}
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1 ${getStatusColor(getDisplayConnectionStatus().success, getDisplayConnectionStatus().hasConfigChanged)}`}>
                  {(() => {
                    const displayStatus = getDisplayConnectionStatus()
                    const StatusIcon = getStatusIcon(displayStatus.success, displayStatus.hasConfigChanged)
                    return <StatusIcon className="h-4 w-4" />
                  })()}
                  <span className="text-sm">
                    {getStatusText(getDisplayConnectionStatus().success, getDisplayConnectionStatus().hasConfigChanged)}
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-center">
              <div>
                <Label className="text-xs text-muted-foreground">存储桶</Label>
                <p className="font-mono">{state.config.bucket}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">区域</Label>
                <p>{state.config.region}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">路径模板</Label>
                <p className="font-mono">{state.config.path_template}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={state.config.compression_enabled}
                    disabled
                  />
                  <Label className="text-sm">压缩启用</Label>
                </div>
                <span className="text-sm text-muted-foreground">
                  压缩质量: {state.config.compression_quality}%
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  编辑配置
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Configuration Message */}
      {!state.config && !isEditing && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Cloud className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">尚未配置存储服务</h3>
            <p className="text-muted-foreground text-center mb-4">
              请添加一个对象存储配置以开始使用图片上传功能
            </p>
            <Button onClick={() => setIsEditing(true)}>
              <Plus className="h-4 w-4 mr-2" />
              添加配置
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Configuration Editor */}
      {isEditing && (
        <Card>
          <CardHeader>
            <CardTitle>{state.config ? "编辑存储配置" : "添加存储配置"}</CardTitle>
            <CardDescription>配置对象存储服务提供商</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>启用图片压缩</Label>
                  <p className="text-sm text-muted-foreground">上传前自动压缩图片以节省存储空间</p>
                </div>
                <Switch
                  checked={editConfig.compression_enabled}
                  onCheckedChange={(checked) => setEditConfig(prev => ({ ...prev, compression_enabled: checked }))}
                />
              </div>

              {editConfig.compression_enabled && (
                <div className="space-y-2">
                  <Label htmlFor="compression-quality">压缩质量 ({editConfig.compression_quality}%)</Label>
                  <Input
                    id="compression-quality"
                    type="range"
                    min="10"
                    max="100"
                    step="10"
                    value={editConfig.compression_quality}
                    onChange={(e) => setEditConfig(prev => ({ ...prev, compression_quality: parseInt(e.target.value) }))}
                  />
                </div>
              )}
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
              // Prioritize manual test results (state.lastConnectionTest) over automatic test results (appState.lastConnectionTest)
              const connectionTest = state.lastConnectionTest || appState.lastConnectionTest
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

            <div className="flex justify-end gap-2 pt-4">
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
                ) : (
                  <></>
                )}
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
          </CardContent>
        </Card>
      )}

    </div>
  )
}
