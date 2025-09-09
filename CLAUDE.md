# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

imgtoss 是一个图像上传管理工具，结合了 Next.js 前端和 Tauri 后端的跨平台桌面应用。应用支持自动化上传图像至对象存储服务（OSS），并提供了 Markdown 文件中图片链接的批量替换功能。

## Architecture

### Frontend (Next.js)
- **Framework**: Next.js 15.2.4 with React 19
- **UI Library**: Radix UI components with Tailwind CSS
- **Theme System**: next-themes with dark/light mode support
- **Component Library**: Custom components in `components/kokonutui/` and reusable UI components in `components/ui/`
- **Build Output**: Static export (`output: 'export'`) for Tauri integration

### Backend (Tauri)
- **Framework**: Tauri v2 with Rust backend
- **App ID**: `com.kieran.imgtoss`
- **Key Dependencies**: 
  - `reqwest` - HTTP client for OSS operations
  - `image` - Image processing and thumbnail generation
  - `tokio` - Async runtime
  - `serde` - Serialization/deserialization
  - `uuid`, `chrono` - Data utilities
  - `sha2`, `hmac` - Cryptographic operations for OSS authentication
  - `tracing` - Structured logging
- **Main Services**: Located in `src-tauri/src/services/`
  - `config_service.rs` - Configuration management
  - `file_service.rs` - File operations
  - `history_service.rs` - Upload history tracking
  - `image_service.rs` - Image processing
  - `oss_service.rs` - Object storage integration
- **Commands**: Comprehensive Tauri command layer in `src-tauri/src/commands/` with validation, security checks, and progress monitoring
- **Models**: Data structures in `src-tauri/src/models/`

## Common Development Commands

### Frontend Development
```bash
# Development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

### Tauri Development
```bash
# Run Tauri in development mode
pnpm tauri dev

# Build Tauri app
pnpm tauri build
```

## Key Configuration Files

### Next.js Configuration
- **Static Export**: Configured for Tauri integration with `output: 'export'`
- **Image Optimization**: Disabled (`unoptimized: true`) for static export compatibility
- **Asset Prefix**: Dynamic based on environment for proper asset resolution

### Tauri Configuration
- **Dev Command**: `pnpm dev` (runs Next.js dev server)
- **Build Command**: `pnpm build` (builds Next.js static export)
- **Frontend Dist**: `../out` (Next.js static export output)
- **Dev URL**: `http://localhost:3000`
- **Window Size**: 1200x800px default
- **App Identifier**: `com.kieran.imgtoss`
- **Auto-updater**: Configured with GitHub releases endpoint
- **Security**: CSP enabled with asset protocol support

## Component Architecture

### Page Structure
- `app/` - Next.js App Router pages
  - `dashboard/` - Main dashboard interface
  - `image-upload/` - Image upload functionality
  - `history/` - Upload history view
  - `storage/` - Storage configuration

### Component Organization
- `components/kokonutui/` - Main application components
  - `dashboard.tsx` - Dashboard layout and content
  - `image-upload.tsx` - Upload interface
  - `history-records.tsx` - History management
  - `storage-config.tsx` - Storage configuration
  - `sidebar.tsx` - Navigation sidebar
- `components/ui/` - Reusable UI primitives (Radix UI based)

## Tauri Command Layer

The Tauri backend provides a comprehensive command API with the following categories:

### File and Scan Commands
- Image scanning and thumbnail generation
- Markdown file processing
- File validation and security checks

### Upload Commands
- Batch image upload with progress tracking
- Upload cancellation and retry functionality
- Real-time progress monitoring

### OSS Configuration Commands
- Storage service configuration
- Connection testing and validation
- Object listing and management

### File Operations Commands
- Markdown link replacement

### History and Progress Commands
- Upload history with pagination
- Progress monitoring and cleanup
- Statistics and export functionality

## Type System and API Architecture

### TypeScript Integration
- **Comprehensive Type Definitions**: All Rust structs mirrored in `lib/types.ts`
- **Centralized API Client**: `lib/tauri-api.ts` provides typed methods for all backend operations
- **Type Safety**: End-to-end type safety between React frontend and Rust backend
- **Error Handling**: Structured error types with recovery strategies

### API Communication Pattern
- **Tauri Commands**: Rust functions exposed via `#[tauri::command]` macro
- **Type Conversion**: Automatic serialization/deserialization via serde
- **Command Categories**: Organized into modules for file ops, uploads, config, history
- **Progress Monitoring**: Real-time progress updates via Tauri event system

### Key Service Interfaces
- **ConfigService**: OSS provider configuration and validation
- **ImageService**: File processing, thumbnail generation, duplicate detection
- **OSSService**: Multi-cloud storage operations (Aliyun, Tencent, AWS S3)
- **HistoryService**: Upload tracking with SQLite persistence
- **FileService**: Markdown parsing and link replacement

## Security Features

### Input Validation
- Path traversal prevention
- UUID format validation
- File extension and size limits
- Rate limiting on sensitive operations

### Error Handling
- Comprehensive error types in `src-tauri/src/utils/error.rs`
- Sanitized error messages
- Proper error propagation between frontend and backend

## Development Notes

### Styling
- Uses Tailwind CSS with CSS custom properties for theming
- Dark/light mode support via `next-themes`
- Component styling follows shadcn/ui patterns

### State Management
- **React Context**: App-wide state via `lib/contexts/app-state-context.tsx`
- **Custom Hooks**: Specialized hooks in `lib/hooks/` for:
  - `use-progress-monitoring.ts` - Real-time upload progress
  - `use-app-config.ts` - Configuration management
  - `use-app-notifications.ts` - Toast notifications
  - `use-app-sync.ts` - State synchronization
  - `use-user-preferences.ts` - User settings persistence
- **Tauri Integration**: Direct communication with backend via typed API calls
- **Error Recovery**: State recovery utilities in `lib/utils/state-recovery.ts`

## Advanced Features

### Duplicate Detection and Management
- **SHA256 Checksums**: Automatic duplicate detection based on file content
- **Intelligent Handling**: Skip re-upload of existing files with same checksum
- **History Integration**: Link duplicate files to existing upload records
- **Component**: `components/kokonutui/duplicate-detection.tsx` for UI management

### System Health Monitoring
- **Real-time Monitoring**: Track system performance, memory usage, disk space
- **Health Status**: Visual indicators (Healthy/Warning/Critical) in UI
- **Component**: `components/ui/system-health-monitor.tsx` for status display
- **Error Tracking**: Comprehensive error logging and recovery suggestions

### Progress and Notification System
- **Real-time Progress**: Live upload progress with speed and ETA calculations
- **Toast Notifications**: Success/error notifications via `components/ui/notification-system.tsx`
- **Cancellation Support**: Ability to cancel ongoing uploads with proper cleanup
- **Retry Logic**: Automatic retry for failed uploads with exponential backoff

### Multi-Provider Storage Support
- **Provider Abstraction**: Unified interface supporting multiple cloud providers
- **Configuration Validation**: Test connections before saving configurations
- **Custom Endpoints**: Support for S3-compatible storage providers
- **Regional Support**: Multi-region configuration for optimal performance

## Development Workflow

### File Structure Understanding
```
lib/
├── contexts/          # React context providers for app state
├── hooks/            # Custom React hooks for specific functionality
├── utils/            # Utility functions and helpers
├── __tests__/        # Frontend test suites
├── tauri-api.ts      # Centralized API client
└── types.ts          # TypeScript definitions matching Rust structs

src-tauri/src/
├── commands/         # Tauri command handlers (API endpoints)
├── services/         # Business logic layer
├── models/           # Data structures and types
└── utils/            # Rust utility functions
```

### Command Development Pattern
1. **Define Types**: Add Rust structs in `src-tauri/src/models/`
2. **Implement Service**: Business logic in `src-tauri/src/services/`
3. **Create Command**: Tauri command in `src-tauri/src/commands/`
4. **Mirror Types**: TypeScript types in `lib/types.ts`
5. **API Method**: Add typed method to `lib/tauri-api.ts`
6. **Frontend Usage**: Use via React hooks and context

### Package Manager
- Uses `pnpm` as the package manager
- Lock file: `pnpm-lock.yaml`

### Testing
- **Frontend Tests**: Vitest with jsdom environment for React component testing
  - Run tests: `pnpm test` (watch mode) or `pnpm test:run` (single run)
  - UI mode: `pnpm test:ui`
  - Test files located in `lib/__tests__/` with comprehensive coverage of:
    - Tauri integration, state management, progress monitoring
    - Upload workflows, duplicate detection, history integration
- **Backend Tests**: Rust test suite in `src-tauri/src/commands/tests.rs`
  - 56+ test cases covering validation, security, and functionality
  - Run tests: `cargo test` (from `src-tauri/` directory)
  - Tests cover command validation, file operations, and error handling

### Quality Assurance and CI/CD
- **Pre-commit Checks**: Use `./pre-commit-check.sh` for local validation
  - `./pre-commit-check.sh --rust-only` - Rust-only checks
  - `./pre-commit-check.sh --quick` - Quick mode, skips time-consuming checks
  - Currently enabled: Rust formatting (`cargo fmt --check`), Clippy analysis
- **GitHub Actions**: Automated workflows in `.github/workflows/`
  - `build.yml` - Multi-platform builds (Linux, macOS ARM, Windows)
  - `test.yml` - Continuous integration testing
  - Automated releases with security scanning and performance testing

### Debugging and Troubleshooting
- **Tauri Development**: Use `pnpm tauri dev` for hot-reload development
- **Rust Logs**: Backend uses `tracing` for structured logging
- **Frontend DevTools**: Standard React DevTools work in development
- **Build Issues**: Check `src-tauri/target/` for Rust compilation errors
- **Asset Loading**: Verify `next.config.mjs` asset prefix configuration for production builds