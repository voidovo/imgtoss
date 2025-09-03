#!/bin/bash

# 为网页生成 favicon 和其他图标
# 使用方法: ./scripts/generate-web-icons.sh

SOURCE_ICON="src-tauri/icons/source-icon.png"
PUBLIC_DIR="public"

if [ ! -f "$SOURCE_ICON" ]; then
    echo "错误: 在 $SOURCE_ICON 找不到源图标文件"
    echo "请先将图标保存为高分辨率 PNG 文件到该位置"
    exit 1
fi

echo "从 $SOURCE_ICON 生成网页图标..."

# 检查 ImageMagick 是否已安装
if ! command -v magick &> /dev/null; then
    echo "需要安装 ImageMagick，但未找到。"
    echo "使用以下命令安装: brew install imagemagick"
    exit 1
fi

# 生成 favicon 文件
magick "$SOURCE_ICON" -background none -resize 16x16 -colorspace sRGB -type TrueColorAlpha "$PUBLIC_DIR/favicon-16x16.png"
magick "$SOURCE_ICON" -background none -resize 32x32 -colorspace sRGB -type TrueColorAlpha "$PUBLIC_DIR/favicon-32x32.png"

# 生成 Apple Touch Icon
magick "$SOURCE_ICON" -background none -resize 180x180 -colorspace sRGB -type TrueColorAlpha "$PUBLIC_DIR/apple-touch-icon.png"

# 生成传统的 favicon.ico (多尺寸)
magick "$SOURCE_ICON" -resize 48x48 \
        \( -clone 0 -resize 32x32 \) \
        \( -clone 0 -resize 16x16 \) \
        "$PUBLIC_DIR/favicon.ico"

# 复制 SVG 图标到 public 目录（如果存在的话）
if [ -f "src-tauri/icons/source-icon.svg" ]; then
    cp "src-tauri/icons/source-icon.svg" "$PUBLIC_DIR/imgtoss-icon.svg"
    echo "✓ 复制了 SVG 图标"
else
    # 如果没有 SVG，从 PNG 生成一个简单的 SVG 版本
    magick "$SOURCE_ICON" -background none -resize 32x32 -colorspace sRGB -type TrueColorAlpha "$PUBLIC_DIR/imgtoss-icon.png"
    echo "✓ 生成了 PNG 版本的应用图标"
fi

echo "✅ 网页图标生成完成！"
echo "生成的文件:"
echo "  - favicon-16x16.png"
echo "  - favicon-32x32.png" 
echo "  - favicon.ico"
echo "  - apple-touch-icon.png"
echo "  - imgtoss-icon.svg/png"