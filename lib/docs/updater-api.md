# 更新器 API 文档

## 概述

更新器 API 模块 (`lib/updater-api.ts`) 提供了与 Tauri 更新器插件的集成，支持应用程序的自动更新功能。

## 主要功能

- ✅ 检查应用更新
- ✅ 下载和安装更新
- ✅ 进度监控
- ✅ 错误处理
- ✅ 应用重启

## 快速开始

### 基本用法

```typescript
import { updaterOperations } from '@/lib';

// 检查更新
const updateInfo = await updaterOperations.checkForUpdates();

if (updateInfo.available) {
  console.log(`发现新版本: ${updateInfo.version}`);
  
  // 下载并安装更新
  await updaterOperations.downloadAndInstall();
  
  // 重启应用
  await updaterOperations.relaunchApp();
}
```

### 带进度监控的更新

```typescript
import { updaterAPI, UpdateStage } from '@/lib';

// 添加进度监听器
const unsubscribe = updaterAPI.onProgress((progress) => {
  console.log(`[${progress.stage}] ${progress.message} - ${progress.progress}%`);
  
  if (progress.stage === UpdateStage.Downloading && progress.bytesDownloaded) {
    console.log(`已下载: ${(progress.bytesDownloaded / 1024 / 1024).toFixed(2)} MB`);
  }
});

try {
  const updateInfo = await updaterAPI.checkForUpdates();
  
  if (updateInfo.available) {
    await updaterAPI.downloadAndInstall();
    await updaterAPI.relaunchApp();
  }
} finally {
  // 清理监听器
  unsubscribe();
}
```

## API 参考

### UpdaterAPI 类

#### 方法

##### `getCurrentVersion(): Promise<string>`
获取当前应用版本。

##### `checkForUpdates(): Promise<UpdateInfo>`
检查是否有可用更新。

**返回值:**
```typescript
interface UpdateInfo {
  currentVersion: string;  // 当前版本
  available: boolean;      // 是否有更新
  version?: string;        // 最新版本号
  date?: string;          // 发布日期
  body?: string;          // 更新说明
}
```

##### `downloadAndInstall(): Promise<void>`
下载并安装更新。需要先调用 `checkForUpdates()` 获取更新信息。

##### `relaunchApp(): Promise<void>`
重启应用以完成更新。

##### `onProgress(callback: (progress: UpdateProgress) => void): () => void`
添加进度监听器，返回取消监听的函数。

**进度对象:**
```typescript
interface UpdateProgress {
  stage: UpdateStage;      // 更新阶段
  progress: number;        // 进度百分比 (0-100)
  message: string;         // 状态描述
  error?: string;          // 错误信息
  bytesDownloaded?: number; // 已下载字节数
  totalBytes?: number;     // 总字节数
}
```

**更新阶段:**
```typescript
enum UpdateStage {
  Idle = 'idle',           // 空闲
  Checking = 'checking',   // 检查更新中
  Downloading = 'downloading', // 下载中
  Installing = 'installing',   // 安装中
  Completed = 'completed',     // 完成
  Error = 'error'             // 错误
}
```

### 便捷方法

```typescript
import { updaterOperations } from '@/lib';

// 所有方法都是 updaterAPI 实例方法的快捷方式
updaterOperations.getCurrentVersion()
updaterOperations.checkForUpdates()
updaterOperations.downloadAndInstall()
updaterOperations.relaunchApp()
updaterOperations.onProgress(callback)
```

## 错误处理

### 错误类型

```typescript
enum UpdaterErrorType {
  Network = 'network',           // 网络错误
  CheckFailed = 'check_failed',  // 检查更新失败
  DownloadFailed = 'download_failed', // 下载失败
  InstallFailed = 'install_failed',   // 安装失败
  Permission = 'permission',          // 权限错误
  Unknown = 'unknown'                 // 未知错误
}
```

### 错误处理示例

```typescript
import { updaterAPI, UpdaterErrorType } from '@/lib';

try {
  await updaterAPI.checkForUpdates();
} catch (error) {
  if (error.type === UpdaterErrorType.Network) {
    console.log('网络连接失败，请检查网络设置');
    
    if (error.recoverable) {
      // 可以重试的错误
      console.log('可以稍后重试');
    }
  }
}
```

## 高级用法

### 更新管理器

```typescript
import { UpdateManager } from '@/lib/examples/updater-usage-examples';

const updateManager = new UpdateManager();

// 设置进度回调
updateManager.setProgressCallback((progress) => {
  // 更新 UI
});

// 检查更新
const updateInfo = await updateManager.checkForUpdates();

if (updateInfo.available) {
  // 执行更新
  await updateManager.performUpdate();
  
  // 重启应用
  await updateManager.restartApp();
}

// 清理资源
updateManager.destroy();
```

### 重试机制

```typescript
import { updateWithRetry } from '@/lib/examples/updater-usage-examples';

// 最多重试 3 次
await updateWithRetry(3);
```

## 配置要求

### Tauri 配置

确保 `src-tauri/tauri.conf.json` 中配置了更新器插件：

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/your-org/your-app/releases/latest/download/latest.json"
      ],
      "dialog": true,
      "pubkey": "your-public-key"
    }
  }
}
```

### Rust 依赖

确保 `src-tauri/Cargo.toml` 中包含更新器插件：

```toml
[dependencies]
tauri-plugin-updater = "2"
```

### 前端依赖

确保安装了必要的 npm 包：

```bash
pnpm add @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

## 最佳实践

1. **错误处理**: 始终包装更新操作在 try-catch 块中
2. **进度反馈**: 为长时间运行的操作提供进度反馈
3. **用户确认**: 在执行更新前获得用户确认
4. **网络检查**: 在检查更新前验证网络连接
5. **资源清理**: 使用完毕后清理进度监听器

## 故障排除

### 常见问题

1. **检查更新失败**
   - 检查网络连接
   - 验证更新端点 URL
   - 确认应用签名配置

2. **下载失败**
   - 检查磁盘空间
   - 验证网络稳定性
   - 检查防火墙设置

3. **安装失败**
   - 确认应用权限
   - 检查文件系统权限
   - 验证更新包完整性

### 调试

启用详细日志记录：

```typescript
import { updaterAPI } from '@/lib';

updaterAPI.onProgress((progress) => {
  console.log('更新进度:', progress);
});
```

## 示例项目

查看 `lib/examples/updater-usage-examples.ts` 获取更多使用示例和最佳实践。