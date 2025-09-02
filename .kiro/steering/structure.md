# 项目结构

## 根目录布局
```
imgtoss/
├── app/                    # Next.js App Router 页面
├── components/             # React 组件
├── lib/                    # 共享工具和 API
├── src-tauri/             # Tauri Rust 后端
├── docs/                  # VitePress 文档
├── public/                # 静态资源
└── styles/                # 全局 CSS
```

## 前端架构 (`app/`)
- **App Router 结构**: 每个文件夹代表一个路由
- **页面组件**: `page.tsx` 文件定义路由组件
- **布局系统**: `layout.tsx` 中的共享布局

主要路由:
- `/` - 仪表板/首页
- `/article-upload` - Markdown 文件处理
- `/image-upload` - 直接图片上传
- `/storage` - 云存储配置
- `/history` - 上传历史和记录

## 组件组织 (`components/`)
```
components/
├── panels/                # 主要应用面板
│   ├── layout.tsx        # 应用布局包装器
│   ├── sidebar.tsx       # 导航侧边栏
│   ├── top-nav.tsx       # 顶部导航
│   └── *.tsx             # 功能特定面板
├── ui/                   # 可重用 UI 组件 (基于 Radix)
├── theme-provider.tsx    # 主题上下文
└── theme-toggle.tsx      # 深色/浅色模式切换
```

## 库结构 (`lib/`)
```
lib/
├── contexts/             # React 上下文状态管理
├── hooks/                # 自定义 React hooks
├── utils/                # 工具函数
├── tauri-api.ts         # Tauri 命令包装器
├── types.ts             # TypeScript 类型定义
└── index.ts             # 库导出
```

## 后端架构 (`src-tauri/src/`)
```
src-tauri/src/
├── commands/             # Tauri 命令处理器
├── services/             # 业务逻辑服务
│   ├── config_service.rs # 配置管理
│   ├── file_service.rs   # 文件操作
│   ├── image_service.rs  # 图片处理
│   ├── oss_service.rs    # 云存储集成
│   └── history_service.rs # 上传历史
├── models/               # 数据结构
├── utils/                # 工具函数
└── lib.rs               # 主应用入口
```

## 关键约定

### 文件命名
- **React 组件**: PascalCase (例如: `ImageUpload.tsx`)
- **页面**: 小写加连字符 (例如: `image-upload/page.tsx`)
- **工具函数**: camelCase (例如: `formatFileSize.ts`)
- **Rust 文件**: snake_case (例如: `config_service.rs`)

### 导入模式
- 使用 `@/` 别名进行根级导入
- 分组导入: 外部库、内部模块、相对导入
- 工具函数优先使用命名导出而非默认导出

### 状态管理
- **全局状态**: React Context (`AppStateProvider`)
- **表单状态**: React Hook Form 配合 Zod 验证
- **服务器状态**: 直接 Tauri API 调用 (无缓存层)
- **UI 状态**: 使用 useState/useReducer 的本地组件状态

### 错误处理
- **前端**: Try-catch 配合 Sonner toast 通知
- **后端**: Result<T, E> 模式配合自定义错误类型
- **验证**: Zod 模式进行运行时类型检查