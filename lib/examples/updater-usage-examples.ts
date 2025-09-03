// 更新器 API 使用示例
// 展示如何在实际应用中使用更新器功能

import { 
  updaterAPI, 
  updaterOperations, 
  UpdateStage, 
  UpdaterErrorType,
  type UpdateInfo,
  type UpdateProgress,
  type UpdaterError 
} from '../updater-api';

// ============================================================================
// 基础使用示例
// ============================================================================

/**
 * 示例 1: 检查更新的基本用法
 */
export async function basicUpdateCheck(): Promise<void> {
  try {
    console.log('开始检查更新...');
    
    // 检查是否有可用更新
    const updateInfo = await updaterOperations.checkForUpdates();
    
    if (updateInfo.available) {
      console.log(`发现新版本: ${updateInfo.version}`);
      console.log(`当前版本: ${updateInfo.currentVersion}`);
      console.log(`更新说明: ${updateInfo.body}`);
    } else {
      console.log('已是最新版本');
    }
  } catch (error) {
    console.error('检查更新失败:', error);
  }
}

/**
 * 示例 2: 带进度监控的更新下载
 */
export async function updateWithProgress(): Promise<void> {
  try {
    // 添加进度监听器
    const unsubscribe = updaterOperations.onProgress((progress: UpdateProgress) => {
      console.log(`[${progress.stage}] ${progress.message} - ${progress.progress}%`);
      
      if (progress.bytesDownloaded && progress.totalBytes) {
        const mbDownloaded = (progress.bytesDownloaded / 1024 / 1024).toFixed(2);
        const mbTotal = (progress.totalBytes / 1024 / 1024).toFixed(2);
        console.log(`下载进度: ${mbDownloaded}MB / ${mbTotal}MB`);
      }
    });

    // 检查更新
    const updateInfo = await updaterOperations.checkForUpdates();
    
    if (updateInfo.available) {
      console.log('开始下载并安装更新...');
      await updaterOperations.downloadAndInstall();
      
      console.log('更新安装完成，准备重启应用...');
      await updaterOperations.relaunchApp();
    }

    // 清理监听器
    unsubscribe();
  } catch (error) {
    console.error('更新过程失败:', error);
  }
}

// ============================================================================
// 高级使用示例
// ============================================================================

/**
 * 示例 3: 完整的更新流程管理
 */
export class UpdateManager {
  private isChecking = false;
  private progressCallback?: (progress: UpdateProgress) => void;
  private unsubscribeProgress?: () => void;

  /**
   * 设置进度回调
   */
  setProgressCallback(callback: (progress: UpdateProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * 检查更新
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    if (this.isChecking) {
      throw new Error('正在检查更新中，请稍候');
    }

    try {
      this.isChecking = true;
      
      // 设置进度监听
      if (this.progressCallback) {
        this.unsubscribeProgress = updaterAPI.onProgress(this.progressCallback);
      }

      const updateInfo = await updaterAPI.checkForUpdates();
      return updateInfo;
    } finally {
      this.isChecking = false;
      this.cleanup();
    }
  }

  /**
   * 执行更新
   */
  async performUpdate(): Promise<void> {
    if (updaterAPI.isUpdateInProgress()) {
      throw new Error('更新正在进行中');
    }

    const currentUpdate = updaterAPI.getCurrentUpdate();
    if (!currentUpdate) {
      throw new Error('没有可用的更新');
    }

    try {
      // 设置进度监听
      if (this.progressCallback) {
        this.unsubscribeProgress = updaterAPI.onProgress(this.progressCallback);
      }

      await updaterAPI.downloadAndInstall();
    } finally {
      this.cleanup();
    }
  }

  /**
   * 重启应用
   */
  async restartApp(): Promise<void> {
    await updaterAPI.relaunchApp();
  }

  /**
   * 获取当前版本
   */
  async getCurrentVersion(): Promise<string> {
    return await updaterAPI.getCurrentVersion();
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.unsubscribeProgress) {
      this.unsubscribeProgress();
      this.unsubscribeProgress = undefined;
    }
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.cleanup();
    updaterAPI.clearCurrentUpdate();
  }
}

/**
 * 示例 4: 错误处理和重试机制
 */
export async function updateWithRetry(maxRetries = 3): Promise<void> {
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const updateInfo = await updaterOperations.checkForUpdates();
      
      if (updateInfo.available) {
        await updaterOperations.downloadAndInstall();
        console.log('更新成功完成');
        return;
      } else {
        console.log('已是最新版本');
        return;
      }
    } catch (error) {
      retryCount++;
      
      if (error && typeof error === 'object' && 'type' in error) {
        const updaterError = error as UpdaterError;
        
        console.error(`更新失败 (尝试 ${retryCount}/${maxRetries}):`, updaterError.message);
        
        // 如果是不可恢复的错误，直接退出
        if (!updaterError.recoverable) {
          console.error('遇到不可恢复的错误，停止重试');
          throw error;
        }
        
        // 网络错误可以重试
        if (updaterError.type === UpdaterErrorType.Network && retryCount < maxRetries) {
          console.log(`等待 ${retryCount * 2} 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
          continue;
        }
      }
      
      if (retryCount >= maxRetries) {
        console.error('达到最大重试次数，更新失败');
        throw error;
      }
    }
  }
}

/**
 * 示例 5: React Hook 风格的更新器
 */
export function createUpdateHook() {
  let updateInfo: UpdateInfo | null = null;
  let isChecking = false;
  let isUpdating = false;
  let error: UpdaterError | null = null;
  let progress: UpdateProgress | null = null;

  const listeners: Array<() => void> = [];

  const notify = () => {
    listeners.forEach(listener => listener());
  };

  const checkForUpdates = async () => {
    if (isChecking) return;

    try {
      isChecking = true;
      error = null;
      notify();

      const unsubscribe = updaterAPI.onProgress((p) => {
        progress = p;
        notify();
      });

      updateInfo = await updaterAPI.checkForUpdates();
      unsubscribe();
    } catch (err) {
      error = err as UpdaterError;
    } finally {
      isChecking = false;
      notify();
    }
  };

  const downloadAndInstall = async () => {
    if (isUpdating) return;

    try {
      isUpdating = true;
      error = null;
      notify();

      const unsubscribe = updaterAPI.onProgress((p) => {
        progress = p;
        notify();
      });

      await updaterAPI.downloadAndInstall();
      unsubscribe();
    } catch (err) {
      error = err as UpdaterError;
    } finally {
      isUpdating = false;
      notify();
    }
  };

  const subscribe = (listener: () => void) => {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  };

  return {
    // 状态
    get updateInfo() { return updateInfo; },
    get isChecking() { return isChecking; },
    get isUpdating() { return isUpdating; },
    get error() { return error; },
    get progress() { return progress; },
    
    // 方法
    checkForUpdates,
    downloadAndInstall,
    relaunchApp: updaterAPI.relaunchApp.bind(updaterAPI),
    subscribe,
  };
}

// ============================================================================
// 实用工具函数
// ============================================================================

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * 格式化更新阶段描述
 */
export function formatUpdateStage(stage: UpdateStage): string {
  const stageMessages = {
    [UpdateStage.Idle]: '空闲',
    [UpdateStage.Checking]: '检查更新中',
    [UpdateStage.Downloading]: '下载中',
    [UpdateStage.Installing]: '安装中',
    [UpdateStage.Completed]: '完成',
    [UpdateStage.Error]: '错误',
  };

  return stageMessages[stage] || '未知状态';
}

/**
 * 获取用户友好的错误消息
 */
export function getUpdateErrorMessage(error: UpdaterError): string {
  const errorMessages = {
    [UpdaterErrorType.Network]: '网络连接失败，请检查网络设置',
    [UpdaterErrorType.CheckFailed]: '检查更新失败，请稍后重试',
    [UpdaterErrorType.DownloadFailed]: '下载更新失败，请检查网络连接',
    [UpdaterErrorType.InstallFailed]: '安装更新失败，请检查应用权限',
    [UpdaterErrorType.Permission]: '权限不足，请以管理员身份运行',
    [UpdaterErrorType.Unknown]: '发生未知错误，请联系技术支持',
  };

  return errorMessages[error.type] || error.message;
}

// ============================================================================
// 导出所有示例
// ============================================================================

export const updaterExamples = {
  basicUpdateCheck,
  updateWithProgress,
  updateWithRetry,
  UpdateManager,
  createUpdateHook,
  formatFileSize,
  formatUpdateStage,
  getUpdateErrorMessage,
};