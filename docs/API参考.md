# API 参考文档

ImgToss 提供了完整的 API 接口，包括 Tauri 命令接口和可选的 HTTP API。本文档详细说明了所有可用的 API 端点、参数和响应格式。

## API 概览

### Tauri Commands API

ImgToss 的核心功能通过 Tauri Commands 暴露，前端通过 `@tauri-apps/api` 调用：

```typescript
import { invoke } from '@tauri-apps/api/tauri';

// 调用 Tauri 命令
const result = await invoke<ResponseType>('command_name', parameters);
```

### HTTP API (可选)

ImgToss 也提供本地 HTTP API 服务，默认运行在 `http://localhost:37259`：

```bash
# 启用 HTTP API 服务
# 设置 → 高级 → 启用 HTTP API: ✅

# 基础 URL
BASE_URL="http://localhost:37259/api"
```

## 文件操作 API

### 验证文件路径

验证指定路径的文件是否存在且可读。

**Tauri Command**: `validate_file_path`

```typescript
interface FileValidation {
  exists: boolean;
  isReadable: boolean;
  fileSize: number;
  lastModified: string;
  mimeType: string | null;
}

const validation = await invoke<FileValidation>('validate_file_path', {
  filePath: '/path/to/image.jpg'
});
```

**HTTP API**: `POST /api/files/validate`

```bash
curl -X POST http://localhost:37259/api/files/validate \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/path/to/image.jpg"}'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "exists": true,
    "isReadable": true,
    "fileSize": 1024576,
    "lastModified": "2024-01-30T14:30:22Z",
    "mimeType": "image/jpeg"
  }
}
```

### 扫描 Markdown 图片

扫描 Markdown 文档中的本地图片引用。

**Tauri Command**: `scan_markdown_images`

```typescript
interface MarkdownImage {
  id: string;
  altText: string;
  originalPath: string;
  resolvedPath: string;
  exists: boolean;
  fileSize: number;
  dimensions: {
    width: number;
    height: number;
  } | null;
  sha256: string | null;
  thumbnailPath: string | null;
}

interface ScanResult {
  totalImages: number;
  validImages: number;
  invalidImages: number;
  images: MarkdownImage[];
}

const result = await invoke<ScanResult>('scan_markdown_images', {
  filePath: '/path/to/document.md'
});
```

**HTTP API**: `POST /api/files/scan-markdown`

```bash
curl -X POST http://localhost:37259/api/files/scan-markdown \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/path/to/document.md"}'
```

### 获取文件信息

获取文件的详细信息和元数据。

**Tauri Command**: `get_file_info`

```typescript
interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  mimeType: string;
  createdAt: string;
  modifiedAt: string;
  sha256: string;
  dimensions: {
    width: number;
    height: number;
  } | null;
  exifData: Record<string, any> | null;
}

const fileInfo = await invoke<FileInfo>('get_file_info', {
  filePath: '/path/to/image.jpg'
});
```

## 上传操作 API

### 上传单个图片

上传单个图片文件到云存储。

**Tauri Command**: `upload_image`

```typescript
interface UploadResult {
  id: string;
  originalPath: string;
  uploadUrl: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  uploadTime: string;
  storageProvider: string;
  thumbnailUrl: string | null;
}

const result = await invoke<UploadResult>('upload_image', {
  filePath: '/path/to/image.jpg',
  configId: 'storage-config-uuid',
  customName?: 'custom-filename',
  customPath?: 'custom/path/'
});
```

**HTTP API**: `POST /api/upload/image`

```bash
curl -X POST http://localhost:37259/api/upload/image \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/image.jpg" \
  -F "configId=storage-config-uuid" \
  -F "customName=custom-filename" \
  -F "customPath=custom/path/"
```

### 批量上传图片

批量上传多个图片文件。

**Tauri Command**: `upload_batch_images`

```typescript
interface BatchUploadOptions {
  files: string[];
  configId: string;
  concurrency?: number;
  skipDuplicates?: boolean;
  customPath?: string;
  namingPattern?: string;
}

interface BatchUploadResult {
  totalFiles: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  results: UploadResult[];
  errors: Array<{
    filePath: string;
    error: string;
  }>;
}

const result = await invoke<BatchUploadResult>('upload_batch_images', {
  files: ['/path/to/img1.jpg', '/path/to/img2.png'],
  configId: 'storage-config-uuid',
  concurrency: 3,
  skipDuplicates: true
});
```

### 获取上传进度

监控批量上传的实时进度。

**Tauri Event**: `upload-progress`

```typescript
import { listen } from '@tauri-apps/api/event';

interface UploadProgress {
  batchId: string;
  currentFile: number;
  totalFiles: number;
  currentFileName: string;
  currentProgress: number; // 0-1
  overallProgress: number; // 0-1
  uploadSpeed: number; // bytes per second
  eta: number; // estimated time remaining in seconds
  bytesUploaded: number;
  totalBytes: number;
}

const unlisten = await listen<UploadProgress>('upload-progress', (event) => {
  const progress = event.payload;
  console.log(`进度: ${(progress.overallProgress * 100).toFixed(1)}%`);
  console.log(`速度: ${formatBytes(progress.uploadSpeed)}/s`);
  console.log(`预计剩余: ${progress.eta}s`);
});

// 取消监听
unlisten();
```

### 取消上传

取消正在进行的上传操作。

**Tauri Command**: `cancel_upload`

```typescript
const result = await invoke<boolean>('cancel_upload', {
  batchId: 'upload-batch-uuid'
});
```

## 存储配置 API

### 获取存储配置列表

获取所有已配置的存储服务。

**Tauri Command**: `get_storage_configs`

```typescript
interface StorageConfig {
  id: string;
  name: string;
  provider: 'AliyunOSS' | 'TencentCOS' | 'AWSS3' | 'CustomS3';
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  customPath: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const configs = await invoke<StorageConfig[]>('get_storage_configs');
```

**HTTP API**: `GET /api/configs/storage`

```bash
curl -X GET http://localhost:37259/api/configs/storage
```

### 保存存储配置

创建或更新存储配置。

**Tauri Command**: `save_storage_config`

```typescript
interface StorageConfigInput {
  id?: string; // 更新时提供
  name: string;
  provider: 'AliyunOSS' | 'TencentCOS' | 'AWSS3' | 'CustomS3';
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  customPath?: string;
  isDefault?: boolean;
}

const savedConfig = await invoke<StorageConfig>('save_storage_config', {
  config: {
    name: '阿里云OSS-主要',
    provider: 'AliyunOSS',
    endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
    region: 'cn-hangzhou',
    bucket: 'my-images-bucket',
    accessKey: 'your-access-key',
    secretKey: 'your-secret-key',
    customPath: 'images/{year}/{month}/',
    isDefault: true
  }
});
```

### 测试存储连接

测试存储配置的连接状态。

**Tauri Command**: `test_storage_connection`

```typescript
interface ConnectionTestResult {
  success: boolean;
  message: string;
  details: {
    networkReachable: boolean;
    authenticationValid: boolean;
    bucketAccessible: boolean;
    uploadPermission: boolean;
    responseTime: number;
  };
  error?: string;
}

const testResult = await invoke<ConnectionTestResult>('test_storage_connection', {
  configId: 'storage-config-uuid'
});

// 或者测试临时配置
const testResult = await invoke<ConnectionTestResult>('test_storage_connection', {
  config: {
    provider: 'AliyunOSS',
    endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
    // ... 其他配置参数
  }
});
```

### 删除存储配置

删除指定的存储配置。

**Tauri Command**: `delete_storage_config`

```typescript
const success = await invoke<boolean>('delete_storage_config', {
  configId: 'storage-config-uuid'
});
```

## 历史记录 API

### 获取上传历史

获取上传历史记录，支持分页和筛选。

**Tauri Command**: `get_upload_history`

```typescript
interface HistoryQuery {
  page?: number;
  pageSize?: number;
  sortBy?: 'uploadTime' | 'fileName' | 'fileSize';
  sortOrder?: 'asc' | 'desc';
  filter?: {
    startDate?: string;
    endDate?: string;
    storageProvider?: string;
    fileType?: string;
    status?: 'success' | 'failed' | 'duplicate';
    searchTerm?: string;
  };
}

interface HistoryRecord {
  id: string;
  fileName: string;
  originalPath: string;
  uploadUrl: string;
  fileSize: number;
  sha256: string;
  uploadTime: string;
  storageProvider: string;
  configName: string;
  status: 'success' | 'failed' | 'duplicate';
  thumbnailUrl: string | null;
  metadata: Record<string, any>;
}

interface HistoryResponse {
  records: HistoryRecord[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
}

const history = await invoke<HistoryResponse>('get_upload_history', {
  page: 1,
  pageSize: 20,
  sortBy: 'uploadTime',
  sortOrder: 'desc',
  filter: {
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    storageProvider: 'AliyunOSS'
  }
});
```

**HTTP API**: `GET /api/history`

```bash
curl -X GET "http://localhost:37259/api/history?page=1&pageSize=20&sortBy=uploadTime&sortOrder=desc&filter.startDate=2024-01-01"
```

### 搜索历史记录

全文搜索历史记录。

**Tauri Command**: `search_upload_history`

```typescript
interface SearchOptions {
  query: string;
  page?: number;
  pageSize?: number;
  includeContent?: boolean; // 是否搜索文件内容
  fuzzyMatch?: boolean;     // 是否模糊匹配
}

const searchResult = await invoke<HistoryResponse>('search_upload_history', {
  query: 'screenshot',
  page: 1,
  pageSize: 10,
  fuzzyMatch: true
});
```

### 导出历史记录

导出历史记录数据。

**Tauri Command**: `export_upload_history`

```typescript
interface ExportOptions {
  format: 'json' | 'csv' | 'xlsx';
  filter?: HistoryQuery['filter'];
  includeFields?: string[];
  outputPath?: string;
}

const exportResult = await invoke<{
  success: boolean;
  filePath: string;
  recordCount: number;
}>('export_upload_history', {
  format: 'json',
  filter: {
    startDate: '2024-01-01',
    endDate: '2024-01-31'
  },
  outputPath: '/path/to/export.json'
});
```

### 删除历史记录

删除指定的历史记录。

**Tauri Command**: `delete_history_record`

```typescript
// 删除单条记录
const success = await invoke<boolean>('delete_history_record', {
  recordId: 'history-record-uuid'
});

// 批量删除
const result = await invoke<{
  deletedCount: number;
  failedCount: number;
}>('batch_delete_history_records', {
  recordIds: ['id1', 'id2', 'id3']
});

// 按条件删除
const result = await invoke<{
  deletedCount: number;
}>('delete_history_by_filter', {
  filter: {
    endDate: '2023-12-31', // 删除2023年之前的记录
    status: 'failed'       // 只删除失败的记录
  }
});
```

## 应用设置 API

### 获取应用配置

获取应用的全局设置。

**Tauri Command**: `get_app_settings`

```typescript
interface AppSettings {
  general: {
    language: string;
    theme: 'auto' | 'light' | 'dark';
    startMinimized: boolean;
    autoStart: boolean;
  };
  upload: {
    maxConcurrency: number;
    defaultRetryCount: number;
    retryInterval: number;
    autoSkipDuplicates: boolean;
    defaultNamingPattern: string;
  };
  storage: {
    defaultConfigId: string | null;
    cacheDuration: number;
    thumbnailSize: number;
    autoCleanupInterval: number;
  };
  network: {
    timeout: number;
    proxy: {
      enabled: boolean;
      type: 'http' | 'socks5';
      host: string;
      port: number;
      username?: string;
      password?: string;
    };
  };
  privacy: {
    clearExifData: boolean;
    clearGpsData: boolean;
    anonymousUsage: boolean;
  };
}

const settings = await invoke<AppSettings>('get_app_settings');
```

### 更新应用配置

更新应用设置。

**Tauri Command**: `update_app_settings`

```typescript
const updatedSettings = await invoke<AppSettings>('update_app_settings', {
  settings: {
    general: {
      theme: 'dark',
      language: 'zh-CN'
    },
    upload: {
      maxConcurrency: 3,
      autoSkipDuplicates: true
    }
    // 只需要提供要更新的字段
  }
});
```

## 系统信息 API

### 获取应用信息

获取应用版本和系统信息。

**Tauri Command**: `get_app_info`

```typescript
interface AppInfo {
  version: string;
  buildTime: string;
  gitCommit: string;
  platform: {
    os: string;
    arch: string;
    version: string;
  };
  runtime: {
    node: string;
    tauri: string;
    rust: string;
  };
  paths: {
    config: string;
    data: string;
    cache: string;
    logs: string;
  };
}

const appInfo = await invoke<AppInfo>('get_app_info');
```

### 获取系统状态

获取系统资源使用状态。

**Tauri Command**: `get_system_status`

```typescript
interface SystemStatus {
  memory: {
    total: number;
    used: number;
    available: number;
    percentage: number;
  };
  disk: {
    total: number;
    used: number;
    available: number;
    percentage: number;
  };
  network: {
    connected: boolean;
    connectionType: 'wifi' | 'ethernet' | 'cellular' | 'unknown';
    uploadSpeed: number;
    downloadSpeed: number;
  };
  performance: {
    cpuUsage: number;
    activeUploads: number;
    cacheSize: number;
  };
}

const status = await invoke<SystemStatus>('get_system_status');
```

## 错误处理

### 错误码定义

所有 API 调用可能返回以下错误类型：

```typescript
interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

// 常见错误码
enum ErrorCode {
  // 文件相关
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_NOT_READABLE = 'FILE_NOT_READABLE', 
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_FORMAT = 'INVALID_FILE_FORMAT',
  
  // 网络相关
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  
  // 存储相关
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  BUCKET_NOT_FOUND = 'BUCKET_NOT_FOUND',
  ACCESS_DENIED = 'ACCESS_DENIED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  
  // 配置相关
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  INVALID_CONFIG = 'INVALID_CONFIG',
  
  // 系统相关
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DISK_FULL = 'DISK_FULL',
  MEMORY_LIMIT = 'MEMORY_LIMIT'
}
```

### 错误处理示例

```typescript
try {
  const result = await invoke<UploadResult>('upload_image', {
    filePath: '/path/to/image.jpg',
    configId: 'invalid-config-id'
  });
} catch (error) {
  if (typeof error === 'string') {
    // Tauri 错误通常是字符串格式
    console.error('上传失败:', error);
    
    if (error.includes('CONFIG_NOT_FOUND')) {
      // 处理配置不存在的情况
      showError('存储配置不存在，请检查配置设置');
    } else if (error.includes('FILE_NOT_FOUND')) {
      // 处理文件不存在的情况  
      showError('文件不存在，请检查文件路径');
    } else {
      // 通用错误处理
      showError('上传失败，请重试');
    }
  }
}
```

## 示例代码

### 完整的上传工作流程

```typescript
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

async function uploadImagesWorkflow() {
  try {
    // 1. 获取存储配置
    const configs = await invoke<StorageConfig[]>('get_storage_configs');
    const defaultConfig = configs.find(c => c.isDefault) || configs[0];
    
    if (!defaultConfig) {
      throw new Error('未找到可用的存储配置');
    }
    
    // 2. 测试存储连接
    const testResult = await invoke<ConnectionTestResult>('test_storage_connection', {
      configId: defaultConfig.id
    });
    
    if (!testResult.success) {
      throw new Error(`存储连接测试失败: ${testResult.message}`);
    }
    
    // 3. 扫描 Markdown 文件中的图片
    const scanResult = await invoke<ScanResult>('scan_markdown_images', {
      filePath: '/path/to/document.md'
    });
    
    console.log(`发现 ${scanResult.totalImages} 张图片，其中 ${scanResult.validImages} 张可用`);
    
    // 4. 过滤出有效的图片
    const validImages = scanResult.images.filter(img => img.exists);
    const imagePaths = validImages.map(img => img.resolvedPath);
    
    // 5. 监听上传进度
    const unlisten = await listen<UploadProgress>('upload-progress', (event) => {
      const progress = event.payload;
      updateProgressBar(progress.overallProgress);
      updateStatusText(`正在上传: ${progress.currentFileName} (${progress.currentFile}/${progress.totalFiles})`);
    });
    
    // 6. 开始批量上传
    const uploadResult = await invoke<BatchUploadResult>('upload_batch_images', {
      files: imagePaths,
      configId: defaultConfig.id,
      concurrency: 3,
      skipDuplicates: true
    });
    
    // 7. 处理上传结果
    console.log(`上传完成: 成功 ${uploadResult.successCount}，失败 ${uploadResult.failedCount}，跳过 ${uploadResult.skippedCount}`);
    
    if (uploadResult.errors.length > 0) {
      console.error('上传错误:', uploadResult.errors);
    }
    
    // 8. 替换 Markdown 中的链接
    if (uploadResult.successCount > 0) {
      const replacements = uploadResult.results.map(result => ({
        originalPath: result.originalPath,
        newUrl: result.uploadUrl
      }));
      
      await invoke<boolean>('replace_markdown_links', {
        filePath: '/path/to/document.md',
        replacements: replacements
      });
      
      console.log('Markdown 链接替换完成');
    }
    
    // 9. 清理监听器
    unlisten();
    
  } catch (error) {
    console.error('工作流程执行失败:', error);
    throw error;
  }
}

// 进度条更新函数
function updateProgressBar(progress: number) {
  const progressBar = document.getElementById('progress-bar') as HTMLProgressElement;
  if (progressBar) {
    progressBar.value = progress * 100;
  }
}

// 状态文本更新函数
function updateStatusText(text: string) {
  const statusElement = document.getElementById('status-text');
  if (statusElement) {
    statusElement.textContent = text;
  }
}
```

### React Hook 示例

```typescript
import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

export function useImageUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<string>('');
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);

  // 监听上传进度
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      unlisten = await listen<UploadProgress>('upload-progress', (event) => {
        const progressData = event.payload;
        setProgress(progressData.overallProgress);
        setCurrentFile(progressData.currentFileName);
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // 上传图片函数
  const uploadImages = useCallback(async (
    files: string[], 
    configId: string
  ): Promise<BatchUploadResult> => {
    setIsUploading(true);
    setProgress(0);
    setCurrentFile('');
    setUploadResults([]);

    try {
      const result = await invoke<BatchUploadResult>('upload_batch_images', {
        files,
        configId,
        concurrency: 3,
        skipDuplicates: true
      });

      setUploadResults(result.results);
      return result;
    } finally {
      setIsUploading(false);
      setProgress(0);
      setCurrentFile('');
    }
  }, []);

  return {
    isUploading,
    progress,
    currentFile,
    uploadResults,
    uploadImages
  };
}
```

通过这个 API 参考文档，开发者可以充分了解 ImgToss 提供的所有接口，实现自定义的图片管理功能或集成到其他应用中。所有 API 都经过类型定义，确保开发过程中的类型安全。