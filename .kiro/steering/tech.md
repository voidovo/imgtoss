# 技术栈

## 前端技术栈
- **Next.js 15**: React 框架，使用 App Router，配置为静态导出 (`output: 'export'`)
- **TypeScript**: 启用严格类型检查，目标版本 ES2022
- **Tailwind CSS**: 实用优先的 CSS 框架，配备自定义设计系统
- **Radix UI**: 无头组件库，提供可访问的 UI 基础组件
- **React Hook Form + Zod**: 表单处理与模式验证
- **Next Themes**: 深色/浅色模式支持
- **Sonner**: Toast 通知组件

## 后端技术栈
- **Tauri 2**: 跨平台桌面应用框架
- **Rust**: 高性能后端，支持异步/等待 (Tokio 运行时)
- **Reqwest**: 用于云存储 API 调用的 HTTP 客户端
- **Serde**: JSON 序列化/反序列化
- **Tauri Stronghold**: 敏感配置的加密本地存储

## 测试与开发
- **Vitest**: 单元测试框架，支持 UI 模式
- **Testing Library**: React 组件测试
- **PNPM**: 包管理器

## 常用命令

### 开发
```bash
# 启动开发服务器
pnpm dev

# 运行 Tauri 开发模式
pnpm tauri dev

# 运行测试
pnpm test
pnpm test:ui

# 生产构建
pnpm build
pnpm tauri build
```

### 测试
```bash
# 运行所有测试
pnpm test:run

# 运行测试 UI
pnpm test:ui

# 运行特定测试文件
pnpm test filename.test.ts
```

## 构建配置
- **静态导出**: Next.js 配置为静态站点生成
- **资源优化**: 图片未优化以兼容 Tauri
- **打包目标**: 跨平台构建 (Windows, macOS, Linux)
- **CSP**: 为桌面应用安全配置的内容安全策略