# 设置页面设计文档

## 概述

设计一个现代化的设置页面，采用左右分栏布局，集成 Tauri 的更新系统。页面将遵循应用现有的设计语言，提供直观的用户体验和完整的在线更新功能。

## 架构

### 前端架构
- **页面路由**: `/settings` - 新增设置页面路由
- **布局系统**: 复用现有的 `Layout` 组件包装器
- **组件层次**: 
  ```
  SettingsPage
  ├── SettingsLayout (左右分栏容器)
  ├── SettingsSidebar (左侧导航)
  └── SettingsContent (右侧内容区)
      └── UpdatePanel (更新功能面板)
  ```

### 后端架构
- **Tauri 内置更新器**: 直接使用 Tauri 2 提供的 `@tauri-apps/plugin-updater` 插件
- **现有命令**: 复用 `get_app_version` 命令获取当前版本
- **Tauri 更新 API**:
  - `check()` - 检查更新（来自 @tauri-apps/plugin-updater）
  - `downloadAndInstall()` - 下载并安装更新
  - 事件监听器处理更新进度和状态

## 组件和接口

### 1. 设置页面主组件 (`app/settings/page.tsx`)
```typescript
interface SettingsPageProps {}

export default function SettingsPage(): JSX.Element
```

**职责**:
- 渲染设置页面的整体布局
- 管理当前选中的设置分类状态
- 协调左右两侧组件的交互

### 2. 设置布局组件 (`components/panels/settings-layout.tsx`)
```typescript
interface SettingsLayoutProps {
  children: React.ReactNode
  sidebar: React.ReactNode
}

export default function SettingsLayout(props: SettingsLayoutProps): JSX.Element
```

**职责**:
- 提供响应式的左右分栏布局
- 处理移动端的布局适配
- 管理侧边栏的展开/收起状态

### 3. 设置侧边栏组件 (`components/panels/settings-sidebar.tsx`)
```typescript
interface SettingCategory {
  id: string
  name: string
  icon: React.ComponentType
}

interface SettingsSidebarProps {
  categories: SettingCategory[]
  activeCategory: string
  onCategoryChange: (categoryId: string) => void
}

export default function SettingsSidebar(props: SettingsSidebarProps): JSX.Element
```

**职责**:
- 渲染设置分类导航列表
- 处理分类选择交互
- 提供视觉反馈（高亮当前选中项）

### 4. 更新面板组件 (`components/panels/update-panel.tsx`)
```typescript
interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  updateAvailable: boolean
  releaseNotes?: string
}

interface UpdateProgress {
  stage: 'checking' | 'downloading' | 'installing' | 'completed' | 'error'
  progress: number
  message: string
}

interface UpdatePanelProps {}

export default function UpdatePanel(): JSX.Element
```

**职责**:
- 显示当前版本和最新版本信息
- 处理更新检查、下载和安装流程
- 展示更新进度和状态信息
- 提供用户交互控制（检查更新、开始更新等）

### 5. Tauri 更新器集成 (`lib/updater-api.ts`)
```typescript
// 使用 Tauri 2 内置更新器
import { check, Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

interface UpdaterAPI {
  checkForUpdates(): Promise<Update | null>
  downloadAndInstall(update: Update): Promise<void>
  relaunchApp(): Promise<void>
}

// 集成到现有 TauriAPI 类
class TauriAPI {
  // 现有方法...
  
  // 复用现有的版本获取方法
  async getAppVersion(): Promise<string> // 已存在
}
```

## 数据模型

### UpdateInfo 数据结构
```typescript
// 基于 Tauri Update 对象的接口
interface UpdateInfo {
  currentVersion: string      // 当前应用版本
  available: boolean          // 是否有更新可用
  version?: string           // 最新版本号
  date?: string              // 发布日期
  body?: string              // 更新说明
}
```

### UpdateProgress 数据结构
```typescript
interface UpdateProgress {
  stage: 'idle' | 'checking' | 'downloading' | 'installing' | 'completed' | 'error'
  progress: number           // 进度百分比 (0-100)
  message: string           // 当前状态描述
  error?: string            // 错误信息（如果有）
  bytesDownloaded?: number  // 已下载字节数
  totalBytes?: number       // 总字节数
}
```

### SettingsState 状态管理
```typescript
interface SettingsState {
  activeCategory: string
  updateInfo: UpdateInfo | null
  updateProgress: UpdateProgress
  isUpdating: boolean
  lastCheckTime: Date | null
}
```

## 错误处理

### 前端错误处理策略
1. **网络错误**: 显示友好的网络连接错误提示
2. **版本检查失败**: 提供重试机制和手动检查选项
3. **下载失败**: 支持断点续传和重新下载
4. **安装失败**: 显示详细错误信息和解决建议

### 后端错误处理
1. **API 调用失败**: 返回结构化错误信息
2. **文件系统错误**: 处理权限和磁盘空间问题
3. **网络超时**: 实现重试机制和超时配置

## 测试策略

### 单元测试
- **组件测试**: 使用 Vitest + Testing Library 测试 React 组件
- **API 测试**: 测试 Tauri API 调用和错误处理
- **状态管理测试**: 测试更新流程的状态变化

### 集成测试
- **更新流程测试**: 端到端测试完整的更新流程
- **UI 交互测试**: 测试用户界面的交互逻辑
- **错误场景测试**: 测试各种错误情况的处理

### 测试用例覆盖
1. 正常更新流程测试
2. 无更新可用场景测试
3. 网络错误处理测试
4. 更新下载中断测试
5. 安装失败恢复测试

## 技术实现细节

### Tauri 更新器配置
- **配置文件**: 在 `tauri.conf.json` 中启用更新器插件
- **更新端点**: 配置 GitHub Releases 或自定义更新服务器
- **签名验证**: Tauri 自动处理更新包的签名验证

### 响应式设计
- **桌面端**: 左侧固定宽度 280px，右侧自适应
- **平板端**: 左侧可折叠，右侧全宽显示
- **移动端**: 单栏布局，通过导航切换内容

### 性能优化
- **懒加载**: 设置面板按需加载
- **状态缓存**: 缓存版本检查结果
- **防抖处理**: 避免频繁的更新检查请求

### 安全考虑
- **内置安全**: Tauri 更新器提供内置的签名验证和安全检查
- **HTTPS 通信**: 更新检查和下载自动使用 HTTPS
- **权限控制**: Tauri 处理应用更新所需的系统权限

## UI/UX 设计规范

### 视觉设计
- **色彩方案**: 遵循应用现有的深色/浅色主题
- **字体系统**: 使用 Inter 字体保持一致性
- **间距系统**: 遵循 Tailwind CSS 的间距规范

### 交互设计
- **状态反馈**: 清晰的加载、成功、错误状态提示
- **进度指示**: 直观的进度条和百分比显示
- **操作确认**: 重要操作提供确认对话框

### 可访问性
- **键盘导航**: 支持完整的键盘操作
- **屏幕阅读器**: 提供适当的 ARIA 标签
- **对比度**: 确保文本和背景的对比度符合标准

## 实现优先级

### 第一阶段 (MVP)
1. 基础设置页面布局
2. 版本信息显示
3. 简单的更新检查功能

### 第二阶段
1. 完整的更新下载和安装流程
2. 进度监控和状态反馈
3. 错误处理和重试机制

### 第三阶段
1. 高级设置选项
2. 自动更新配置
3. 更新历史记录