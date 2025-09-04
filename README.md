# imgtoss - 图像上传管理工具

一款使用 Next.js + Tauri 2 构建的轻量化跨平台应用，专为自动化上传图像至对象存储服务而设计。纯本地化运行，保证信息安全。

## 简介

imgtoss 是一款自动化上传图像至对象存储的跨平台应用，支持阿里云 OSS、腾讯云 COS 和 Amazon S3 等多种对象存储服务。应用采用现代化的 Next.js 前端界面和强大的 Tauri 后端服务，提供完整的图像管理解决方案。

## 核心功能

### 🔍 文章上传模式

- **智能解析**: 自动解析 Markdown 文件中的本地图片引用
- **批量处理**: 支持多文件同时处理，提高工作效率
- **自动替换**: 上传完成后自动替换本地图片链接为云存储 URL
- **备份保护**: 修改文件前自动创建备份，支持一键恢复

### 🖼️ 图片上传模式

- **拖拽上传**: 支持拖拽和文件选择两种上传方式
- **批量上传**: 同时上传多张图片，实时显示上传进度
- **链接管理**: 上传完成后提供快捷复制功能
- **重复检测**: 基于 SHA256 校验和防止重复上传

### ☁️ 多云存储支持

- **阿里云 OSS**: 完整支持阿里云对象存储服务
- **腾讯云 COS**: 兼容腾讯云对象存储
- **Amazon S3**: 支持 AWS S3 及兼容 S3 协议的存储服务
- **自定义端点**: 支持自定义存储服务端点配置

### 📊 历史记录管理

- **完整记录**: 保存所有上传操作的详细历史
- **智能去重**: 使用 SHA256 编码作为文件校验和，防止重复上传
- **快速检索**: 支持按时间、文件名等条件搜索历史记录
- **数据导出**: 支持导出历史记录和配置文件

### 🔒 安全与隐私

- **本地运行**: 所有处理完全在本地进行，不依赖外部服务器
- **数据安全**: 配置信息和历史记录均存储在本地
- **权限控制**: 严格的文件访问权限控制
- **加密存储**: 敏感配置信息采用加密存储

## 技术架构

### 前端技术栈

- **Next.js 14**: 现代化 React 框架，支持 App Router
- **TypeScript**: 类型安全的开发体验
- **Tailwind CSS**: 响应式 UI 设计
- **React Hook Form**: 表单状态管理
- **Zustand**: 轻量级状态管理

### 后端技术栈

- **Tauri 2**: 跨平台桌面应用框架
- **Rust**: 高性能后端服务
- **SQLite**: 本地数据存储
- **Tokio**: 异步运行时
- **Serde**: 数据序列化

### 核心服务架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js UI    │    │  Tauri Bridge   │    │ Rust Services   │
│                 │    │                 │    │                 │
│ • 配置管理      │◄──►│ • 命令处理      │◄──►│ • ConfigService │
│ • 文件上传      │    │ • 类型转换      │    │ • FileService   │
│ • 历史记录      │    │ • 错误处理      │    │ • ImageService  │
│ • 进度监控      │    │ • 事件通信      │    │ • OSSService    │
└─────────────────┘    └─────────────────┘    │ • HistoryService│
                                              └─────────────────┘
```

## 主要特性

- ⚡ **高性能**: Rust 后端确保快速的文件处理和上传
- 🎨 **现代界面**: 基于 Next.js 的响应式用户界面
- 🔄 **实时更新**: 实时显示上传进度和操作状态
- 💾 **数据持久化**: 本地数据库存储配置和历史记录
- 🛡️ **错误恢复**: 完善的错误处理和数据恢复机制
- 🌐 **跨平台**: 支持 Windows、macOS 和 Linux
- 📱 **响应式**: 适配不同屏幕尺寸的设备

## 快速开始

### 系统要求

- **操作系统**: Windows 10+, macOS 10.15+, 或 Linux (Ubuntu 18.04+)
- **内存**: 最少 4GB RAM
- **存储**: 至少 100MB 可用空间
- **网络**: 用于连接云存储服务的网络连接

### 安装方式

#### 方式一：下载预编译版本

1. 访问 [Releases 页面](https://github.com/your-repo/imgtoss/releases)
2. 下载适合您操作系统的安装包
3. 运行安装程序并按照提示完成安装

#### 方式二：从源码构建

```bash
# 克隆仓库
git clone https://github.com/your-repo/imgtoss.git
cd imgtoss

# 安装依赖
npm install

# 构建应用
npm run tauri build
```

### 配置云存储

#### 阿里云 OSS 配置

1. 登录阿里云控制台，创建 OSS Bucket
2. 获取 AccessKey ID 和 AccessKey Secret
3. 在应用中填入以下信息：
   - **端点**: `https://oss-cn-hangzhou.aliyuncs.com`
   - **Bucket**: 您的存储桶名称
   - **区域**: `cn-hangzhou`
   - **访问密钥**: 您的 AccessKey 信息

#### 腾讯云 COS 配置

1. 登录腾讯云控制台，创建 COS 存储桶
2. 获取 SecretId 和 SecretKey
3. 配置信息：
   - **端点**: `https://cos.ap-beijing.myqcloud.com`
   - **Bucket**: 您的存储桶名称
   - **区域**: `ap-beijing`

#### AWS S3 配置

1. 创建 AWS 账户并设置 S3 存储桶
2. 获取 Access Key 和 Secret Key
3. 配置信息：
   - **端点**: `https://s3.amazonaws.com`
   - **Bucket**: 您的存储桶名称
   - **区域**: `us-east-1`

## 使用指南

### 文章上传模式

1. **选择文件**: 点击"选择 Markdown 文件"或拖拽文件到应用窗口
2. **扫描图片**: 应用自动扫描并显示文件中的本地图片引用
3. **选择上传**: 勾选需要上传的图片
4. **开始上传**: 点击"开始上传"按钮
5. **自动替换**: 上传完成后，应用自动替换文件中的图片链接

### 图片上传模式

1. **选择图片**: 拖拽图片文件到上传区域或点击选择文件
2. **批量上传**: 支持同时选择多张图片
3. **监控进度**: 实时查看每张图片的上传进度
4. **复制链接**: 上传完成后一键复制图片链接

### 历史记录管理

1. **查看历史**: 在历史页面查看所有上传记录
2. **搜索过滤**: 使用搜索功能快速找到特定记录
3. **重复检测**: 系统自动检测并标记重复上传的图片
4. **数据导出**: 导出历史记录为 JSON 格式

## 开发指南

### 开发环境设置

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Node.js (推荐使用 Node 18+)
# 通过 nvm 安装
nvm install 18
nvm use 18

# 安装 Tauri CLI
cargo install tauri-cli

# 克隆项目
git clone https://github.com/your-repo/imgtoss.git
cd imgtoss

# 安装前端依赖
npm install

# 启动开发服务器
npm run tauri dev
```

### 项目结构

```
imgtoss/
├── app/                    # Next.js 应用目录
│   ├── dashboard/         # 仪表板页面
│   ├── storage/           # 存储配置页面
│   ├── image-upload/      # 图片上传页面
│   └── history/           # 历史记录页面
├── components/            # React 组件
│   ├── ui/               # 基础 UI 组件
│   └── kokonutui/        # 业务组件
├── lib/                   # 工具库和 API 客户端
├── src-tauri/            # Tauri 后端代码
│   ├── src/
│   │   ├── commands/     # Tauri 命令处理
│   │   ├── services/     # 业务服务层
│   │   ├── models/       # 数据模型
│   │   └── utils/        # 工具函数
│   └── Cargo.toml        # Rust 依赖配置
└── .kiro/                # 项目规范文档
    └── specs/            # 功能规范
```

### 贡献指南

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 常见问题

### Q: 支持哪些图片格式？

A: 支持常见的图片格式，包括 JPG、PNG、GIF、WebP、BMP 等。

### Q: 上传失败怎么办？

A: 检查网络连接和云存储配置，应用提供详细的错误信息和重试功能。

### Q: 如何备份配置？

A: 在设置页面可以导出配置文件，重装应用后可以导入恢复。

### Q: 是否支持自定义存储路径？

A: 是的，可以在配置中设置自定义的存储路径前缀。

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 致谢

- [Tauri](https://tauri.app/) - 跨平台应用框架
- [Next.js](https://nextjs.org/) - React 应用框架
- [Rust](https://www.rust-lang.org/) - 系统编程语言
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
