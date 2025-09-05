#!/bin/bash

# 构建脚本 - 用于本地测试 CI/CD 流程
# 使用方法: ./scripts/build.sh [platform]

set -e

PLATFORM=${1:-"current"}
VERSION=$(node -p "require('./package.json').version")

echo "🚀 开始构建 imgtoss v$VERSION"
echo "📦 目标平台: $PLATFORM"

# 检查依赖
echo "📋 检查构建依赖..."
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm 未安装，请先安装 pnpm"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo "❌ Rust 未安装，请先安装 Rust"
    exit 1
fi

# 清理旧的构建文件
echo "🧹 清理旧的构建文件..."
rm -rf out/
rm -rf src-tauri/target/release/

# 安装依赖
echo "📦 安装前端依赖..."
pnpm install --frozen-lockfile

# 运行测试
echo "🧪 运行测试..."
pnpm run test:run

# 构建前端
echo "🏗️ 构建前端..."
pnpm run build

# 构建 Tauri 应用
echo "🦀 构建 Tauri 应用..."
case $PLATFORM in
    "linux")
        pnpm tauri build --target x86_64-unknown-linux-gnu
        ;;
    "macos")
        pnpm tauri build --target x86_64-apple-darwin
        ;;
    "macos-arm")
        pnpm tauri build --target aarch64-apple-darwin
        ;;
    "windows")
        pnpm tauri build --target x86_64-pc-windows-msvc
        ;;
    "current")
        pnpm tauri build
        ;;
    *)
        echo "❌ 不支持的平台: $PLATFORM"
        echo "支持的平台: linux, macos, macos-arm, windows, current"
        exit 1
        ;;
esac

echo "✅ 构建完成!"
echo "📁 构建产物位置:"
find src-tauri/target -name "*.deb" -o -name "*.dmg" -o -name "*.msi" -o -name "*.AppImage" -o -name "*.exe" 2>/dev/null | head -10