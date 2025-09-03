// Tauri 更新器 API 集成模块
// 提供版本检查、下载和安装更新的功能

import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { tauriAPI } from './tauri-api';
import { toast } from 'sonner';

// ============================================================================
// 更新器相关类型定义
// ============================================================================

/**
 * 更新信息接口
 */
export interface UpdateInfo {
    /** 当前应用版本 */
    currentVersion: string;
    /** 是否有更新可用 */
    available: boolean;
    /** 最新版本号 */
    version?: string;
    /** 发布日期 */
    date?: string;
    /** 更新说明 */
    body?: string;
}

/**
 * 更新进度接口
 */
export interface UpdateProgress {
    /** 更新阶段 */
    stage: UpdateStage;
    /** 进度百分比 (0-100) */
    progress: number;
    /** 当前状态描述 */
    message: string;
    /** 错误信息（如果有） */
    error?: string;
    /** 已下载字节数 */
    bytesDownloaded?: number;
    /** 总字节数 */
    totalBytes?: number;
    /** 下载速度（字节/秒） */
    downloadSpeed?: number;
}

/**
 * 更新阶段枚举
 */
export enum UpdateStage {
    /** 空闲状态 */
    Idle = 'idle',
    /** 检查更新中 */
    Checking = 'checking',
    /** 下载中 */
    Downloading = 'downloading',
    /** 安装中 */
    Installing = 'installing',
    /** 完成 */
    Completed = 'completed',
    /** 错误 */
    Error = 'error'
}

/**
 * 更新器错误类型
 */
export enum UpdaterErrorType {
    /** 网络错误 */
    Network = 'network',
    /** 检查更新失败 */
    CheckFailed = 'check_failed',
    /** 下载失败 */
    DownloadFailed = 'download_failed',
    /** 安装失败 */
    InstallFailed = 'install_failed',
    /** 权限错误 */
    Permission = 'permission',
    /** 未知错误 */
    Unknown = 'unknown'
}

/**
 * 更新器错误接口
 */
export interface UpdaterError {
    type: UpdaterErrorType;
    message: string;
    details?: string;
    recoverable: boolean;
}

// ============================================================================
// 更新器 API 类
// ============================================================================

/**
 * Tauri 更新器 API 封装类
 * 提供版本检查、下载和安装更新的功能
 */
export class UpdaterAPI {
    private currentUpdate: Update | null = null;
    private progressCallbacks: ((progress: UpdateProgress) => void)[] = [];
    private isUpdating = false;

    /**
     * 获取当前应用版本
     */
    async getCurrentVersion(): Promise<string> {
        try {
            return await tauriAPI.getAppVersion();
        } catch (error) {
            console.error('获取应用版本失败:', error);
            const errorType = this.analyzeError(error);
            const updaterError = this.createError(
                errorType,
                '获取应用版本失败',
                error instanceof Error ? error.message : String(error)
            );
            
            // 显示 toast 通知
            toast.error(updaterError.message, {
                description: '请重启应用后重试',
                duration: 5000,
            });
            
            throw updaterError;
        }
    }

    /**
     * 检查是否有可用更新
     */
    async checkForUpdates(): Promise<UpdateInfo> {
        try {
            this.notifyProgress({
                stage: UpdateStage.Checking,
                progress: 0,
                message: '正在检查更新...'
            });

            const currentVersion = await this.getCurrentVersion();

            // 使用 Tauri 更新器检查更新
            const update = await check();

            if (update) {
                this.currentUpdate = update;

                const updateInfo: UpdateInfo = {
                    currentVersion,
                    available: true,
                    version: update.version,
                    date: update.date,
                    body: update.body
                };

                this.notifyProgress({
                    stage: UpdateStage.Idle,
                    progress: 100,
                    message: `发现新版本 ${update.version}`
                });

                // 显示成功 toast
                toast.success(`发现新版本 ${update.version}`, {
                    description: '点击"立即更新"按钮开始更新',
                    duration: 5000,
                });

                return updateInfo;
            } else {
                this.notifyProgress({
                    stage: UpdateStage.Idle,
                    progress: 100,
                    message: '已是最新版本'
                });

                // 显示信息 toast
                toast.info('已是最新版本', {
                    description: '您正在使用最新版本的应用',
                    duration: 3000,
                });

                return {
                    currentVersion,
                    available: false
                };
            }
        } catch (error) {
            const errorType = this.analyzeError(error);
            const errorMessage = error instanceof Error ? error.message : String(error);

            this.notifyProgress({
                stage: UpdateStage.Error,
                progress: 0,
                message: '检查更新失败',
                error: errorMessage
            });

            const updaterError = this.createError(errorType, '检查更新失败', errorMessage);
            
            // 显示 toast 通知
            toast.error(updaterError.message, {
                description: updaterError.recoverable ? '您可以稍后重试' : '请联系技术支持',
                duration: 5000,
            });

            throw updaterError;
        }
    }

    /**
     * 下载并安装更新
     */
    async downloadAndInstall(): Promise<void> {
        if (!this.currentUpdate) {
            throw this.createError(
                UpdaterErrorType.Unknown,
                '没有可用的更新',
                '请先检查更新'
            );
        }

        if (this.isUpdating) {
            throw this.createError(
                UpdaterErrorType.Unknown,
                '更新正在进行中',
                '请等待当前更新完成'
            );
        }

        try {
            this.isUpdating = true;

            this.notifyProgress({
                stage: UpdateStage.Downloading,
                progress: 0,
                message: '开始下载更新...'
            });

            // 下载并安装更新，监听进度
            let totalBytes = 0;
            let downloadedBytes = 0;
            
            await this.currentUpdate.downloadAndInstall((event) => {
                switch (event.event) {
                    case 'Started':
                        totalBytes = event.data.contentLength || 0;
                        downloadedBytes = 0;
                        
                        this.notifyProgress({
                            stage: UpdateStage.Downloading,
                            progress: 0,
                            message: '开始下载更新...',
                            totalBytes: totalBytes,
                            bytesDownloaded: 0
                        });
                        break;

                    case 'Progress':
                        downloadedBytes += event.data.chunkLength;
                        
                        // 计算下载进度（占总进度的80%）
                        let downloadProgress = 0;
                        if (totalBytes > 0) {
                            downloadProgress = Math.min(80, (downloadedBytes / totalBytes) * 80);
                        } else {
                            // 如果无法获取总大小，使用累积下载量来估算进度
                            downloadProgress = Math.min(80, (downloadedBytes / 1024 / 1024) * 5); // 每MB约5%进度
                        }
                        
                        // 计算下载速度（简单估算）
                        const downloadSpeed = event.data.chunkLength; // 字节/秒（粗略估算）
                        
                        this.notifyProgress({
                            stage: UpdateStage.Downloading,
                            progress: downloadProgress,
                            message: `下载中... ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB${totalBytes > 0 ? ` / ${(totalBytes / 1024 / 1024).toFixed(2)} MB` : ''}`,
                            bytesDownloaded: downloadedBytes,
                            totalBytes: totalBytes > 0 ? totalBytes : undefined,
                            downloadSpeed: downloadSpeed
                        });
                        break;

                    case 'Finished':
                        this.notifyProgress({
                            stage: UpdateStage.Installing,
                            progress: 85,
                            message: '下载完成，正在安装更新...',
                            bytesDownloaded: downloadedBytes,
                            totalBytes: totalBytes > 0 ? totalBytes : undefined
                        });
                        
                        // 模拟安装进度
                        setTimeout(() => {
                            this.notifyProgress({
                                stage: UpdateStage.Installing,
                                progress: 95,
                                message: '正在安装更新，请稍候...'
                            });
                        }, 500);
                        break;
                }
            });

            this.notifyProgress({
                stage: UpdateStage.Completed,
                progress: 100,
                message: '更新安装完成'
            });

            // 显示成功 toast
            toast.success('更新安装完成！', {
                description: '点击"重启应用"按钮完成更新',
                duration: 8000,
            });

        } catch (error) {
            const errorType = this.analyzeError(error);
            const errorMessage = error instanceof Error ? error.message : String(error);

            this.notifyProgress({
                stage: UpdateStage.Error,
                progress: 0,
                message: '更新失败',
                error: errorMessage
            });

            const updaterError = this.createError(errorType, '下载或安装更新失败', errorMessage);
            
            // 显示 toast 通知
            toast.error(updaterError.message, {
                description: updaterError.recoverable ? '您可以点击重试按钮重新尝试' : '请联系技术支持',
                duration: 8000,
            });

            throw updaterError;
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * 重启应用以完成更新
     */
    async relaunchApp(): Promise<void> {
        try {
            // 显示成功 toast
            toast.success('正在重启应用...', {
                description: '应用将在几秒钟内重启',
                duration: 3000,
            });
            
            // 延迟一下让用户看到消息
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await relaunch();
        } catch (error) {
            const errorType = this.analyzeError(error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            const updaterError = this.createError(errorType, '重启应用失败', errorMessage);
            
            // 显示 toast 通知
            toast.error(updaterError.message, {
                description: '请手动重启应用以完成更新',
                duration: 8000,
            });
            
            throw updaterError;
        }
    }

    /**
     * 添加进度监听器
     */
    onProgress(callback: (progress: UpdateProgress) => void): () => void {
        this.progressCallbacks.push(callback);

        // 返回取消监听的函数
        return () => {
            const index = this.progressCallbacks.indexOf(callback);
            if (index > -1) {
                this.progressCallbacks.splice(index, 1);
            }
        };
    }

    /**
     * 获取当前更新状态
     */
    isUpdateInProgress(): boolean {
        return this.isUpdating;
    }

    /**
     * 获取当前可用的更新信息
     */
    getCurrentUpdate(): Update | null {
        return this.currentUpdate;
    }

    /**
     * 清除当前更新信息
     */
    clearCurrentUpdate(): void {
        this.currentUpdate = null;
    }

    /**
     * 检查网络连接状态
     */
    async checkNetworkConnection(): Promise<boolean> {
        try {
            // 尝试访问一个简单的网络资源来检查连接
            const response = await fetch('https://httpbin.org/status/200', {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-cache',
                signal: AbortSignal.timeout(5000) // 5秒超时
            });
            return true;
        } catch (error) {
            console.warn('网络连接检查失败:', error);
            return false;
        }
    }

    /**
     * 智能重试机制 - 根据错误类型决定重试策略
     */
    async smartRetry<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3,
        baseDelay: number = 1000
    ): Promise<T> {
        let lastError: any;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // 检查网络连接
                    const hasNetwork = await this.checkNetworkConnection();
                    if (!hasNetwork) {
                        throw this.createError(
                            UpdaterErrorType.Network,
                            '网络连接不可用',
                            '请检查网络连接后重试'
                        );
                    }
                    
                    // 指数退避延迟
                    const delay = baseDelay * Math.pow(2, attempt - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    toast.info(`正在重试... (${attempt}/${maxRetries})`, {
                        duration: 2000,
                    });
                }
                
                return await operation();
            } catch (error) {
                lastError = error;
                
                // 如果是不可恢复的错误，立即停止重试
                const errorType = this.analyzeError(error);
                if (errorType === UpdaterErrorType.Permission || 
                    errorType === UpdaterErrorType.InstallFailed) {
                    break;
                }
                
                // 如果是最后一次尝试，不再重试
                if (attempt === maxRetries) {
                    break;
                }
            }
        }
        
        throw lastError;
    }

    // ============================================================================
    // 私有方法
    // ============================================================================

    /**
     * 通知进度更新
     */
    private notifyProgress(progress: UpdateProgress): void {
        this.progressCallbacks.forEach(callback => {
            try {
                callback(progress);
            } catch (error) {
                console.error('进度回调执行失败:', error);
            }
        });
    }

    /**
     * 创建标准化的错误对象
     */
    private createError(
        type: UpdaterErrorType,
        message: string,
        details?: string
    ): UpdaterError {
        // 根据错误类型提供用户友好的错误消息
        const userFriendlyMessage = this.getUserFriendlyErrorMessage(type, message, details);
        
        return {
            type,
            message: userFriendlyMessage,
            details,
            recoverable: type === UpdaterErrorType.Network || 
                        type === UpdaterErrorType.CheckFailed || 
                        type === UpdaterErrorType.DownloadFailed
        };
    }

    /**
     * 获取用户友好的错误消息
     */
    private getUserFriendlyErrorMessage(
        type: UpdaterErrorType,
        originalMessage: string,
        details?: string
    ): string {
        switch (type) {
            case UpdaterErrorType.Network:
                if (details?.includes('timeout') || details?.includes('TIMEOUT')) {
                    return '网络连接超时，请检查网络连接后重试';
                }
                if (details?.includes('DNS') || details?.includes('resolve')) {
                    return '无法解析服务器地址，请检查网络设置';
                }
                if (details?.includes('connection refused') || details?.includes('ECONNREFUSED')) {
                    return '无法连接到更新服务器，请稍后重试';
                }
                return '网络连接失败，请检查网络连接后重试';

            case UpdaterErrorType.CheckFailed:
                if (details?.includes('404') || details?.includes('Not Found')) {
                    return '更新服务暂时不可用，请稍后重试';
                }
                if (details?.includes('403') || details?.includes('Forbidden')) {
                    return '无权限访问更新服务，请联系技术支持';
                }
                if (details?.includes('500') || details?.includes('Internal Server Error')) {
                    return '更新服务器内部错误，请稍后重试';
                }
                return '检查更新失败，请稍后重试';

            case UpdaterErrorType.DownloadFailed:
                if (details?.includes('disk space') || details?.includes('No space')) {
                    return '磁盘空间不足，请清理磁盘空间后重试';
                }
                if (details?.includes('permission') || details?.includes('Permission denied')) {
                    return '没有足够的权限下载更新，请以管理员身份运行';
                }
                if (details?.includes('checksum') || details?.includes('hash')) {
                    return '更新文件校验失败，请重新下载';
                }
                return '下载更新失败，请检查网络连接后重试';

            case UpdaterErrorType.InstallFailed:
                if (details?.includes('permission') || details?.includes('Permission denied')) {
                    return '没有足够的权限安装更新，请以管理员身份运行';
                }
                if (details?.includes('file in use') || details?.includes('busy')) {
                    return '应用程序正在使用中，请关闭所有相关进程后重试';
                }
                return '安装更新失败，请重启应用后重试';

            case UpdaterErrorType.Permission:
                return '权限不足，请以管理员身份运行应用程序';

            case UpdaterErrorType.Unknown:
            default:
                if (details?.includes('signature') || details?.includes('验证')) {
                    return '更新文件签名验证失败，请从官方渠道下载';
                }
                return originalMessage || '发生未知错误，请重试或联系技术支持';
        }
    }

    /**
     * 分析错误并确定错误类型
     */
    private analyzeError(error: any): UpdaterErrorType {
        const errorMessage = error?.message || error?.toString() || '';
        const errorDetails = error?.details || error?.cause?.toString() || '';
        const fullErrorText = `${errorMessage} ${errorDetails}`.toLowerCase();

        // 网络相关错误
        if (fullErrorText.includes('network') || 
            fullErrorText.includes('timeout') ||
            fullErrorText.includes('connection') ||
            fullErrorText.includes('dns') ||
            fullErrorText.includes('resolve') ||
            fullErrorText.includes('econnrefused') ||
            fullErrorText.includes('enotfound')) {
            return UpdaterErrorType.Network;
        }

        // 权限相关错误
        if (fullErrorText.includes('permission') ||
            fullErrorText.includes('access denied') ||
            fullErrorText.includes('unauthorized') ||
            fullErrorText.includes('forbidden')) {
            return UpdaterErrorType.Permission;
        }

        // 下载相关错误
        if (fullErrorText.includes('download') ||
            fullErrorText.includes('fetch') ||
            fullErrorText.includes('checksum') ||
            fullErrorText.includes('hash') ||
            fullErrorText.includes('disk space')) {
            return UpdaterErrorType.DownloadFailed;
        }

        // 安装相关错误
        if (fullErrorText.includes('install') ||
            fullErrorText.includes('extract') ||
            fullErrorText.includes('file in use') ||
            fullErrorText.includes('busy')) {
            return UpdaterErrorType.InstallFailed;
        }

        // 检查更新相关错误
        if (fullErrorText.includes('check') ||
            fullErrorText.includes('404') ||
            fullErrorText.includes('500') ||
            fullErrorText.includes('server error')) {
            return UpdaterErrorType.CheckFailed;
        }

        return UpdaterErrorType.Unknown;
    }
}

// ============================================================================
// 导出单例实例和便捷方法
// ============================================================================

/** 更新器 API 单例实例 */
export const updaterAPI = new UpdaterAPI();

/** 便捷的更新器操作方法 */
export const updaterOperations = {
    /** 获取当前版本 */
    getCurrentVersion: () => updaterAPI.getCurrentVersion(),

    /** 检查更新 */
    checkForUpdates: () => updaterAPI.checkForUpdates(),

    /** 下载并安装更新 */
    downloadAndInstall: () => updaterAPI.downloadAndInstall(),

    /** 重启应用 */
    relaunchApp: () => updaterAPI.relaunchApp(),

    /** 监听进度 */
    onProgress: (callback: (progress: UpdateProgress) => void) =>
        updaterAPI.onProgress(callback),

    /** 检查是否正在更新 */
    isUpdateInProgress: () => updaterAPI.isUpdateInProgress(),

    /** 获取当前更新 */
    getCurrentUpdate: () => updaterAPI.getCurrentUpdate(),

    /** 清除当前更新 */
    clearCurrentUpdate: () => updaterAPI.clearCurrentUpdate(),

    /** 检查网络连接 */
    checkNetworkConnection: () => updaterAPI.checkNetworkConnection(),

    /** 智能重试 */
    smartRetry: <T>(operation: () => Promise<T>, maxRetries?: number, baseDelay?: number) =>
        updaterAPI.smartRetry(operation, maxRetries, baseDelay)
};

// 默认导出更新器 API 类
export default UpdaterAPI;