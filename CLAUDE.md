# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ImgToss 是一个图像上传管理工具，结合了 Next.js 前端和 Tauri 后端的跨平台桌面应用。应用支持自动化上传图像至对象存储服务（OSS），并提供了 Markdown 文件中图片链接的批量替换功能。

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
- Backup and restore functionality
- File operation rollback

### History and Progress Commands
- Upload history with pagination
- Progress monitoring and cleanup
- Statistics and export functionality

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
- React hooks for local state
- Tauri commands for backend communication
- No external state management library currently used

### Package Manager
- Uses `pnpm` as the package manager
- Lock file: `pnpm-lock.yaml`

### Testing
- Comprehensive test suite in `src-tauri/src/commands/tests.rs`
- 56+ test cases covering validation, security, and functionality
- Run tests with standard Rust testing: `cargo test`