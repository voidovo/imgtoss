"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { AlertCircle, CheckCircle, Cloud, Database, Globe, Key, Plus, Settings, Trash2, TestTube } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface StorageProvider {
  id: string
  name: string
  type: "aws-s3" | "aliyun-oss" | "tencent-cos" | "qiniu-kodo" | "upyun" | "custom"
  config: {
    accessKey: string
    secretKey: string
    bucket: string
    region: string
    endpoint?: string
    customDomain?: string
  }
  isDefault: boolean
  isActive: boolean
  lastTested?: Date
  status: "connected" | "error" | "untested"
}

const providerTemplates = {
  "aws-s3": {
    name: "Amazon S3",
    icon: Cloud,
    regions: ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"],
    fields: ["accessKey", "secretKey", "bucket", "region"],
  },
  "aliyun-oss": {
    name: "阿里云 OSS",
    icon: Database,
    regions: ["oss-cn-hangzhou", "oss-cn-shanghai", "oss-cn-beijing", "oss-cn-shenzhen"],
    fields: ["accessKey", "secretKey", "bucket", "region", "endpoint"],
  },
  "tencent-cos": {
    name: "腾讯云 COS",
    icon: Globe,
    regions: ["ap-beijing", "ap-shanghai", "ap-guangzhou", "ap-chengdu"],
    fields: ["accessKey", "secretKey", "bucket", "region"],
  },
  "qiniu-kodo": {
    name: "七牛云 Kodo",
    icon: Key,
    regions: ["华东", "华北", "华南", "北美"],
    fields: ["accessKey", "secretKey", "bucket", "region", "customDomain"],
  },
  upyun: {
    name: "又拍云",
    icon: Settings,
    regions: ["自动选择", "电信", "联通", "移动"],
    fields: ["accessKey", "secretKey", "bucket", "region"],
  },
  custom: {
    name: "自定义 S3",
    icon: Cloud,
    regions: [],
    fields: ["accessKey", "secretKey", "bucket", "endpoint", "customDomain"],
  },
}

export function StorageConfig() {
  const [providers, setProviders] = useState<StorageProvider[]>([
    {
      id: "1",
      name: "AWS S3 Production",
      type: "aws-s3",
      config: {
        accessKey: "AKIA***************",
        secretKey: "***************",
        bucket: "my-images-bucket",
        region: "us-east-1",
      },
      isDefault: true,
      isActive: true,
      lastTested: new Date(),
      status: "connected",
    },
    {
      id: "2",
      name: "阿里云 OSS 备用",
      type: "aliyun-oss",
      config: {
        accessKey: "LTAI***************",
        secretKey: "***************",
        bucket: "backup-images",
        region: "oss-cn-hangzhou",
        endpoint: "oss-cn-hangzhou.aliyuncs.com",
      },
      isDefault: false,
      isActive: true,
      status: "untested",
    },
  ])

  const [selectedProvider, setSelectedProvider] = useState<string>("")
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newProvider, setNewProvider] = useState<Partial<StorageProvider>>({
    type: "aws-s3",
    config: {
      accessKey: "",
      secretKey: "",
      bucket: "",
      region: "",
    },
    isDefault: false,
    isActive: true,
    status: "untested",
  })

  const handleAddProvider = () => {
    if (
      newProvider.name &&
      newProvider.config?.accessKey &&
      newProvider.config?.secretKey &&
      newProvider.config?.bucket
    ) {
      const provider: StorageProvider = {
        id: Date.now().toString(),
        name: newProvider.name,
        type: newProvider.type!,
        config: newProvider.config as StorageProvider["config"],
        isDefault: providers.length === 0,
        isActive: true,
        status: "untested",
      }
      setProviders([...providers, provider])
      setNewProvider({
        type: "aws-s3",
        config: { accessKey: "", secretKey: "", bucket: "", region: "" },
        isDefault: false,
        isActive: true,
        status: "untested",
      })
      setIsAddingNew(false)
    }
  }

  const handleTestConnection = async (providerId: string) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === providerId ? { ...p, status: "connected", lastTested: new Date() } : p)),
    )
  }

  const handleSetDefault = (providerId: string) => {
    setProviders((prev) =>
      prev.map((p) => ({
        ...p,
        isDefault: p.id === providerId,
      })),
    )
  }

  const handleDeleteProvider = (providerId: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== providerId))
  }

  const getStatusColor = (status: StorageProvider["status"]) => {
    switch (status) {
      case "connected":
        return "text-green-600"
      case "error":
        return "text-red-600"
      default:
        return "text-gray-500"
    }
  }

  const getStatusIcon = (status: StorageProvider["status"]) => {
    switch (status) {
      case "connected":
        return CheckCircle
      case "error":
        return AlertCircle
      default:
        return TestTube
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">存储配置</h1>
          <p className="text-muted-foreground mt-2">配置和管理对象存储服务提供商</p>
        </div>
        <Button onClick={() => setIsAddingNew(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          添加存储
        </Button>
      </div>

      {/* Storage Providers List */}
      <div className="grid gap-4">
        {providers.map((provider) => {
          const template = providerTemplates[provider.type]
          const StatusIcon = getStatusIcon(provider.status)

          return (
            <Card key={provider.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <template.icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-lg">{provider.name}</CardTitle>
                      <CardDescription>{template.name}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {provider.isDefault && <Badge variant="default">默认</Badge>}
                    <div className={`flex items-center gap-1 ${getStatusColor(provider.status)}`}>
                      <StatusIcon className="h-4 w-4" />
                      <span className="text-sm">
                        {provider.status === "connected"
                          ? "已连接"
                          : provider.status === "error"
                            ? "连接失败"
                            : "未测试"}
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">存储桶</Label>
                    <p className="font-mono">{provider.config.bucket}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">区域</Label>
                    <p>{provider.config.region}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">访问密钥</Label>
                    <p className="font-mono">{provider.config.accessKey}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">最后测试</Label>
                    <p>{provider.lastTested ? provider.lastTested.toLocaleDateString() : "从未"}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={provider.isActive}
                        onCheckedChange={(checked) => {
                          setProviders((prev) =>
                            prev.map((p) => (p.id === provider.id ? { ...p, isActive: checked } : p)),
                          )
                        }}
                      />
                      <Label className="text-sm">启用</Label>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleTestConnection(provider.id)}>
                      <TestTube className="h-4 w-4 mr-1" />
                      测试连接
                    </Button>
                    {!provider.isDefault && (
                      <Button variant="outline" size="sm" onClick={() => handleSetDefault(provider.id)}>
                        设为默认
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setSelectedProvider(provider.id)}>
                      编辑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteProvider(provider.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Add New Provider Dialog */}
      {isAddingNew && (
        <Card>
          <CardHeader>
            <CardTitle>添加存储提供商</CardTitle>
            <CardDescription>配置新的对象存储服务</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="provider-name">配置名称</Label>
                <Input
                  id="provider-name"
                  placeholder="例如：AWS S3 生产环境"
                  value={newProvider.name || ""}
                  onChange={(e) => setNewProvider((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-type">存储类型</Label>
                <Select
                  value={newProvider.type}
                  onValueChange={(value) =>
                    setNewProvider((prev) => ({
                      ...prev,
                      type: value as StorageProvider["type"],
                      config: { accessKey: "", secretKey: "", bucket: "", region: "" },
                    }))
                  }
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
            </div>

            {newProvider.type && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="access-key">访问密钥 (Access Key)</Label>
                  <Input
                    id="access-key"
                    placeholder="输入访问密钥"
                    value={newProvider.config?.accessKey || ""}
                    onChange={(e) =>
                      setNewProvider((prev) => ({
                        ...prev,
                        config: { ...prev.config!, accessKey: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secret-key">私有密钥 (Secret Key)</Label>
                  <Input
                    id="secret-key"
                    type="password"
                    placeholder="输入私有密钥"
                    value={newProvider.config?.secretKey || ""}
                    onChange={(e) =>
                      setNewProvider((prev) => ({
                        ...prev,
                        config: { ...prev.config!, secretKey: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bucket">存储桶名称</Label>
                  <Input
                    id="bucket"
                    placeholder="输入存储桶名称"
                    value={newProvider.config?.bucket || ""}
                    onChange={(e) =>
                      setNewProvider((prev) => ({
                        ...prev,
                        config: { ...prev.config!, bucket: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="region">区域</Label>
                  {providerTemplates[newProvider.type!].regions.length > 0 ? (
                    <Select
                      value={newProvider.config?.region || ""}
                      onValueChange={(value) =>
                        setNewProvider((prev) => ({
                          ...prev,
                          config: { ...prev.config!, region: value },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择区域" />
                      </SelectTrigger>
                      <SelectContent>
                        {providerTemplates[newProvider.type!].regions.map((region) => (
                          <SelectItem key={region} value={region}>
                            {region}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="region"
                      placeholder="输入区域或留空"
                      value={newProvider.config?.region || ""}
                      onChange={(e) =>
                        setNewProvider((prev) => ({
                          ...prev,
                          config: { ...prev.config!, region: e.target.value },
                        }))
                      }
                    />
                  )}
                </div>
              </div>
            )}

            {/* Advanced Options */}
            {newProvider.type && ["aliyun-oss", "custom"].includes(newProvider.type) && (
              <div className="space-y-2">
                <Label htmlFor="endpoint">自定义端点 (可选)</Label>
                <Input
                  id="endpoint"
                  placeholder="例如：oss-cn-hangzhou.aliyuncs.com"
                  value={newProvider.config?.endpoint || ""}
                  onChange={(e) =>
                    setNewProvider((prev) => ({
                      ...prev,
                      config: { ...prev.config!, endpoint: e.target.value },
                    }))
                  }
                />
              </div>
            )}

            {newProvider.type === "qiniu-kodo" && (
              <div className="space-y-2">
                <Label htmlFor="custom-domain">自定义域名 (可选)</Label>
                <Input
                  id="custom-domain"
                  placeholder="例如：img.example.com"
                  value={newProvider.config?.customDomain || ""}
                  onChange={(e) =>
                    setNewProvider((prev) => ({
                      ...prev,
                      config: { ...prev.config!, customDomain: e.target.value },
                    }))
                  }
                />
              </div>
            )}

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                请确保提供的访问密钥具有对应存储桶的读写权限。配置保存后建议立即测试连接。
              </AlertDescription>
            </Alert>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsAddingNew(false)}>
                取消
              </Button>
              <Button onClick={handleAddProvider}>添加配置</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Global Settings */}
      <Card>
        <CardHeader>
          <CardTitle>全局设置</CardTitle>
          <CardDescription>配置上传行为和默认选项</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="upload-timeout">上传超时 (秒)</Label>
              <Input id="upload-timeout" type="number" defaultValue="300" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="retry-count">重试次数</Label>
              <Input id="retry-count" type="number" defaultValue="3" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>自动重命名重复文件</Label>
                <p className="text-sm text-muted-foreground">当文件名冲突时自动添加时间戳</p>
              </div>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>上传后自动复制链接</Label>
                <p className="text-sm text-muted-foreground">上传完成后自动复制图片链接到剪贴板</p>
              </div>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>启用上传进度通知</Label>
                <p className="text-sm text-muted-foreground">显示系统通知提醒上传状态</p>
              </div>
              <Switch />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
