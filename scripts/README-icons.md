# 图标设置指南

本指南将帮助你为 imgtoss 应用设置新图标，支持所有平台。

## 第一步：保存源图标文件

1. 将你的图标保存为高分辨率 PNG 文件（建议 1024x1024 像素）
2. 命名为 `source-icon.png`
3. 放置在 `src-tauri/icons/` 目录中

## 第二步：生成所需的所有格式

选择以下方法之一：

### 方法 A：使用 ImageMagick（推荐）

1. 安装 ImageMagick：
   ```bash
   brew install imagemagick
   ```

2. 运行生成脚本：
   ```bash
   # 生成 Tauri 应用图标
   ./scripts/generate-icons.sh
   
   # 生成网页图标 (favicon 等)
   ./scripts/generate-web-icons.sh
   ```

### 方法 B：使用 Node.js + Sharp

1. 安装 Sharp：
   ```bash
   npm install sharp
   ```

2. 运行 Node.js 脚本：
   ```bash
   # 生成 Tauri 应用图标
   node scripts/generate-icons.js
   
   # 生成网页图标
   ./scripts/generate-web-icons.sh
   ```

注意：Node.js 方法仅生成 PNG 文件，需要手动转换为 ICO/ICNS 格式。

### 方法 C：手动转换

使用在线工具：
- [ICO Converter](https://icoconvert.com/) 用于生成 Windows ICO 文件
- [ICNS Converter](https://iconverticons.com/online/) 用于生成 macOS ICNS 文件

## 第三步：验证图标设置

生成图标后，你的 `src-tauri/icons/` 目录应包含：

- `32x32.png` - 小尺寸 PNG 图标
- `128x128.png` - 中等尺寸 PNG 图标  
- `128x128@2x.png` - 高分辨率中等图标
- `icon.png` - 大尺寸 PNG 图标 (512x512)
- `icon.ico` - Windows 图标文件
- `icon.icns` - macOS 图标文件
- 各种 `Square*.png` 文件用于 Windows 应用商店

网页图标文件 (在 `public/` 目录):
- `favicon-16x16.png` - 小尺寸网页图标
- `favicon-32x32.png` - 标准网页图标
- `favicon.ico` - 传统 favicon 文件
- `apple-touch-icon.png` - Apple 设备图标
- `imgtoss-icon.svg/png` - 应用内显示的图标

## 第四步：构建和测试

1. 构建你的 Tauri 应用：
   ```bash
   pnpm tauri build
   ```

2. 检查新图标是否出现在：
   - 应用程序窗口标题栏
   - 系统托盘（如果适用）
   - 应用程序包/安装程序
   - 桌面快捷方式

## 故障排除

- **图标未更新**：清除 Tauri 缓存并重新构建
- **图标模糊**：确保源图像为高分辨率（1024x1024+）
- **格式缺失**：验证 `src-tauri/icons/` 中存在所有必需文件
- **"not RGBA" 错误**：确保使用更新后的脚本，它会强制生成 RGBA 格式的 PNG 文件
- **透明度问题**：源图标应该有透明背景，脚本会自动处理

## 重要提示

- Tauri 要求所有 PNG 图标都必须是 RGBA 格式（包含透明度通道）
- 更新后的脚本会自动确保正确的格式
- 如果仍有问题，可以手动检查图标格式：`file src-tauri/icons/32x32.png`

`src-tauri/tauri.conf.json` 中的 Tauri 配置已经设置好使用这些图标文件。