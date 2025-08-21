"use client"

// 腾讯云 COS 连接调试组件
// 用于测试和调试腾讯云 COS 连接问题

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, CheckCircle, Loader2, Bug, Settings } from 'lucide-react';

interface TencentCOSConfig {
    provider: 'Tencent';
    endpoint: string;
    access_key_id: string; // APPID
    access_key_secret: string; // SecretKey
    bucket: string;
    region: string;
    path_template: string;
    compression_enabled: boolean;
    compression_quality: number;
}

export function TencentCOSDebug() {
    const [config, setConfig] = useState<TencentCOSConfig>({
        provider: 'Tencent',
        endpoint: 'https://cos.myqcloud.com',
        access_key_id: '', // APPID
        access_key_secret: '', // SecretKey
        bucket: '',
        region: 'ap-beijing',
        path_template: 'images/{filename}',
        compression_enabled: false,
        compression_quality: 80,
    });

    const [isDebugging, setIsDebugging] = useState(false);
    const [debugResult, setDebugResult] = useState<string | null>(null);
    const [debugError, setDebugError] = useState<string | null>(null);

    const handleInputChange = (field: keyof TencentCOSConfig, value: string | boolean | number) => {
        setConfig(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleDebugConnection = async () => {
        if (!config.bucket || !config.access_key_id || !config.access_key_secret || !config.region) {
            setDebugError('请填写所有必需的配置项');
            return;
        }

        setIsDebugging(true);
        setDebugResult(null);
        setDebugError(null);

        try {
            const result = await invoke<string>('debug_tencent_cos_connection', { config });
            setDebugResult(result);
        } catch (error) {
            setDebugError(error as string);
        } finally {
            setIsDebugging(false);
        }
    };

    const handleTestConnection = async () => {
        if (!config.bucket || !config.access_key_id || !config.access_key_secret || !config.region) {
            setDebugError('请填写所有必需的配置项');
            return;
        }

        setIsDebugging(true);
        setDebugResult(null);
        setDebugError(null);

        try {
            const result = await invoke('test_oss_connection', { config });
            setDebugResult('连接测试成功: ' + JSON.stringify(result, null, 2));
        } catch (error) {
            setDebugError('连接测试失败: ' + (error as string));
        } finally {
            setIsDebugging(false);
        }
    };

    const commonRegions = [
        { value: 'ap-beijing', label: '北京' },
        { value: 'ap-shanghai', label: '上海' },
        { value: 'ap-guangzhou', label: '广州' },
        { value: 'ap-chengdu', label: '成都' },
        { value: 'ap-chongqing', label: '重庆' },
        { value: 'ap-hongkong', label: '香港' },
        { value: 'ap-singapore', label: '新加坡' },
    ];

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center gap-2">
                <Bug className="h-6 w-6" />
                <h1 className="text-2xl font-bold">腾讯云 COS 连接调试</h1>
            </div>

            <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                    此工具用于调试腾讯云 COS 连接问题。请确保您的网络连接正常，并且已正确配置腾讯云账户信息。
                </AlertDescription>
            </Alert>

            {/* 配置表单 */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        腾讯云 COS 配置
                    </CardTitle>
                    <CardDescription>
                        请填写您的腾讯云 COS 配置信息。注意：这里需要的是 SecretID 和 SecretKey，不是 APPID。
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="bucket">存储桶名称 *</Label>
                            <Input
                                id="bucket"
                                value={config.bucket}
                                onChange={(e) => handleInputChange('bucket', e.target.value)}
                                placeholder="my-bucket"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="secretid">SecretID *</Label>
                            <Input
                                id="secretid"
                                value={config.access_key_id}
                                onChange={(e) => handleInputChange('access_key_id', e.target.value)}
                                placeholder="AKID..."
                            />
                            <p className="text-xs text-muted-foreground">
                                腾讯云 API 密钥的 SecretID，可在访问管理控制台获取
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="secret">SecretKey *</Label>
                        <Input
                            id="secret"
                            type="password"
                            value={config.access_key_secret}
                            onChange={(e) => handleInputChange('access_key_secret', e.target.value)}
                            placeholder="您的 SecretKey"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="region">地域 *</Label>
                        <select
                            id="region"
                            value={config.region}
                            onChange={(e) => handleInputChange('region', e.target.value)}
                            className="w-full px-3 py-2 border border-input bg-background rounded-md"
                        >
                            {commonRegions.map((region) => (
                                <option key={region.value} value={region.value}>
                                    {region.label} ({region.value})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <Button
                            onClick={handleDebugConnection}
                            disabled={isDebugging}
                            className="flex items-center gap-2"
                        >
                            {isDebugging ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Bug className="h-4 w-4" />
                            )}
                            完整调试
                        </Button>

                        <Button
                            onClick={handleTestConnection}
                            disabled={isDebugging}
                            variant="outline"
                            className="flex items-center gap-2"
                        >
                            {isDebugging ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <CheckCircle className="h-4 w-4" />
                            )}
                            快速测试
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 调试结果 */}
            {debugResult && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-5 w-5" />
                            调试成功
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <textarea
                            value={debugResult}
                            readOnly
                            className="min-h-[200px] font-mono text-sm w-full rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </CardContent>
                </Card>
            )}

            {/* 错误信息 */}
            {debugError && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="h-5 w-5" />
                            调试失败
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                                <pre className="whitespace-pre-wrap text-sm">{debugError}</pre>
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                </Card>
            )}

            {/* 帮助信息 */}
            <Card>
                <CardHeader>
                    <CardTitle>常见问题解决方案</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h4 className="font-medium mb-2">DNS 解析失败</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• 检查网络连接是否正常</li>
                            <li>• 确认防火墙没有阻止 HTTPS 连接</li>
                            <li>• 尝试更换 DNS 服务器（如 8.8.8.8）</li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-medium mb-2">认证失败 (403 错误)</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• 检查 SecretID 是否正确</li>
                            <li>• 检查 SecretKey 是否正确</li>
                            <li>• 确认 API 密钥有访问 COS 服务的权限</li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-medium mb-2">存储桶不存在 (404 错误)</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• 检查存储桶名称格式：应为 bucketname-appid</li>
                            <li>• 确认存储桶在指定地域中</li>
                            <li>• 检查存储桶名称中的 APPID 是否正确</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}