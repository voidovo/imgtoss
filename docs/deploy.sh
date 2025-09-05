#!/bin/bash

# imgtoss 文档部署脚本
# 用于自动构建和部署文档网站

set -e

echo "🚀 开始构建 imgtoss 文档网站..."

# 检查环境
if ! command -v pnpm &> /dev/null; then
    echo "❌ 错误: 未找到 pnpm，请先安装 pnpm"
    echo "   npm install -g pnpm"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js 18+"
    exit 1
fi

# 检查 Node.js 版本
NODE_VERSION=$(node --version | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ 错误: Node.js 版本过低，需要 18.0+，当前版本: $(node --version)"
    exit 1
fi

echo "✅ 环境检查通过"
echo "   Node.js: $(node --version)"
echo "   pnpm: $(pnpm --version)"

# 进入文档目录
cd "$(dirname "$0")"

# 安装依赖
echo "📦 安装依赖包..."
pnpm install --frozen-lockfile

# 构建文档
echo "🔨 构建文档网站..."
pnpm build

# 检查构建结果
if [ -d ".vitepress/dist" ]; then
    echo "✅ 构建成功！"
    echo "   构建产物位置: .vitepress/dist"
    
    # 显示构建统计
    DIST_SIZE=$(du -sh .vitepress/dist | cut -f1)
    FILE_COUNT=$(find .vitepress/dist -type f | wc -l)
    echo "   文件数量: $FILE_COUNT"
    echo "   总大小: $DIST_SIZE"
else
    echo "❌ 构建失败！"
    exit 1
fi

# 可选的部署选项
echo ""
echo "📚 文档构建完成！接下来可以："
echo "   1. 本地预览: pnpm preview"
echo "   2. 部署到 GitHub Pages"
echo "   3. 部署到 Netlify 或 Vercel"
echo "   4. 手动上传构建产物到服务器"

# 如果提供了部署参数，执行相应的部署操作
case "${1:-}" in
    "preview")
        echo "🌐 启动预览服务器..."
        pnpm preview
        ;;
    "github")
        echo "🚀 部署到 GitHub Pages..."
        if command -v gh &> /dev/null; then
            gh workflow run deploy-docs.yml
            echo "✅ GitHub Actions 工作流已触发"
        else
            echo "❌ 未找到 gh CLI 工具，请手动推送到 GitHub 或安装 gh CLI"
        fi
        ;;
    "netlify")
        echo "🌐 部署到 Netlify..."
        if command -v netlify &> /dev/null; then
            netlify deploy --prod --dir=.vitepress/dist
        else
            echo "❌ 未找到 netlify CLI 工具，请安装: npm install -g netlify-cli"
        fi
        ;;
    *)
        echo ""
        echo "💡 提示: 使用参数可以直接执行部署操作"
        echo "   ./deploy.sh preview  - 本地预览"
        echo "   ./deploy.sh github   - 部署到 GitHub Pages"
        echo "   ./deploy.sh netlify  - 部署到 Netlify"
        ;;
esac

echo ""
echo "🎉 文档部署脚本执行完成！"