# Tauri API Integration

This directory contains the TypeScript integration layer for the Tauri backend, providing type-safe communication between the Next.js frontend and Rust backend services.

## Overview

The integration consists of three main components:

1. **Type Definitions** (`types.ts`) - TypeScript interfaces matching Rust structs
2. **API Client** (`tauri-api.ts`) - Centralized client with typed methods for all Tauri commands
3. **Error Handling** (`error-handler.ts`) - Structured error handling and user-friendly error messages

## Quick Start

```typescript
import { tauriAPI, withErrorHandling, OSSProvider } from '@/lib';

// Scan markdown files for images
const results = await tauriAPI.scanMarkdownFiles(['/path/to/file.md']);

// Configure OSS storage
const config = {
  provider: OSSProvider.Aliyun,
  endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
  access_key_id: 'your-key',
  access_key_secret: 'your-secret',
  bucket: 'your-bucket',
  region: 'cn-hangzhou',
  path_template: 'images/{filename}',
  compression_enabled: true,
  compression_quality: 80,
};

await tauriAPI.saveOSSConfig(config);

// Upload images with error handling
try {
  const uploadResults = await withErrorHandling(
    () => tauriAPI.uploadImages(imageIds, config),
    'Image upload'
  );
  console.log('Upload successful:', uploadResults);
} catch (error) {
  console.error('Upload failed:', error);
}
```

## API Reference

### Core API Client

The `TauriAPI` class provides typed methods for all backend operations:

#### File Operations
- `scanMarkdownFiles(filePaths: string[]): Promise<ScanResult[]>`
- `getImageInfo(imagePath: string): Promise<ImageInfo>`
- `generateThumbnail(imagePath: string, size: number): Promise<number[]>`

#### Upload Operations
- `uploadImages(imageIds: string[], config: OSSConfig): Promise<UploadResult[]>`
- `getUploadProgress(taskId: string): Promise<UploadProgress | null>`
- `cancelUpload(taskId: string): Promise<void>`
- `retryUpload(taskId: string): Promise<void>`

#### Configuration Operations
- `saveOSSConfig(config: OSSConfig): Promise<void>`
- `loadOSSConfig(): Promise<OSSConfig | null>`
- `testOSSConnection(config: OSSConfig): Promise<OSSConnectionTest>`
- `validateOSSConfig(config: OSSConfig): Promise<ConfigValidation>`

#### History Operations
- `getUploadHistory(page?: number, pageSize?: number): Promise<PaginatedResult<HistoryRecord>>`
- `clearHistory(): Promise<void>`
- `exportHistory(): Promise<string>`
- `addHistoryRecord(...): Promise<string>`

### Error Handling

The error handling system provides structured error management:

```typescript
import { withErrorHandling, withRetry, TauriError, getUserFriendlyErrorMessage } from '@/lib';

// Basic error handling
try {
  const result = await withErrorHandling(
    () => tauriAPI.someOperation(),
    'Operation context'
  );
} catch (error) {
  if (error instanceof TauriError) {
    const userMessage = getUserFriendlyErrorMessage(error);
    console.log(userMessage.title, userMessage.message);
    console.log('Suggestions:', userMessage.suggestions);
  }
}

// Retry for recoverable operations
const result = await withRetry(
  () => tauriAPI.testOSSConnection(config),
  3, // max retries
  1000, // delay between retries
  'Connection test'
);
```

### Convenience Methods

For common operations, use the convenience method groups:

```typescript
import { fileOperations, configOperations, uploadOperations, historyOperations } from '@/lib';

// File operations
const scanResults = await fileOperations.scanMarkdownFiles(filePaths);
const imageInfo = await fileOperations.getImageInfo(imagePath);

// Configuration
await configOperations.saveOSSConfig(config);
const config = await configOperations.loadOSSConfig();

// Uploads
const results = await uploadOperations.uploadImages(imageIds, config);
const progress = await uploadOperations.getUploadProgress(taskId);

// History
const history = await historyOperations.getUploadHistory(1, 20);
const stats = await historyOperations.getHistoryStatistics();
```

## Type Safety

All operations are fully typed with TypeScript interfaces that match the Rust backend:

```typescript
interface OSSConfig {
  provider: OSSProvider;
  endpoint: string;
  access_key_id: string;
  access_key_secret: string;
  bucket: string;
  region: string;
  path_template: string;
  cdn_domain?: string;
  compression_enabled: boolean;
  compression_quality: number;
}

interface UploadResult {
  image_id: string;
  success: boolean;
  uploaded_url?: string;
  error?: string;
}
```

## Error Types

The system classifies errors into categories for appropriate handling:

- `VALIDATION` - Input validation errors (recoverable)
- `NETWORK` - Network connectivity issues (recoverable)
- `FILE_SYSTEM` - File access problems (recoverable)
- `SECURITY` - Security violations (non-recoverable)
- `SERVICE` - General service errors (recoverable)

## Testing

The integration includes comprehensive tests:

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui
```

## Examples

See `examples/tauri-usage-examples.ts` for complete usage examples including:

- Scanning markdown files
- Configuring OSS storage
- Uploading images with progress tracking
- Managing history and statistics
- File backup and recovery
- Complete workflow integration

## Architecture

```
Frontend (React/Next.js)
    ↓
Tauri API Client (TypeScript)
    ↓
Tauri Commands (Rust)
    ↓
Backend Services (Rust)
    ↓
Storage Layer (Local/Cloud)
```

The integration layer ensures type safety and provides structured error handling while maintaining the separation between frontend and backend concerns.

## Requirements Covered

This implementation addresses the following requirements from the specification:

- **1.1, 1.2, 1.3**: Integration of existing Tauri services with Next.js frontend
- **7.1, 7.2**: Proper error handling and user feedback throughout the system

The foundation is now ready for implementing the remaining tasks in the migration plan.