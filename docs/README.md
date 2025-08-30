# ImgToss 文档

这是 ImgToss 项目的完整产品文档，使用 VitePress 构建。

## 文档结构

```
docs/
├── .vitepress/
│   └── config.ts          # VitePress 配置文件
├── public/                # 静态资源文件
│   ├── favicon.ico
│   ├── logo.svg
│   └── hero-image.png
├── index.md              # 首页
├── 产品介绍.md            # 产品特性和价值介绍
├── 快速开始指南.md        # 安装和首次使用指南
├── 用户操作手册.md        # 详细的功能使用说明
├── 开发者指南.md          # 开发环境和技术架构
├── 最佳实践.md           # 使用建议和优化技巧
├── 故障排除.md           # 常见问题和解决方案
├── API参考.md           # 完整的API接口文档
└── package.json         # 项目依赖配置
```

## 文档内容概览

### 核心文档
- **产品介绍** - ImgToss 的核心价值主张、技术架构和适用场景
- **快速开始指南** - 从下载安装到完成首次上传的完整流程
- **用户操作手册** - 所有功能的详细使用说明，包含图片和示例

### 进阶文档
- **最佳实践** - 云存储配置、文件管理、性能优化的专业建议
- **开发者指南** - 技术架构、开发环境搭建、贡献指南
- **API 参考** - 完整的 Tauri Commands 和 HTTP API 文档

### 支持文档
- **故障排除** - 按平台和问题类型分类的解决方案
- **常见问题** - 用户最常遇到的问题和快速解答

## 本地开发

### 环境要求
- Node.js 18.0+
- pnpm 8.0+

### 安装依赖
```bash
cd docs
pnpm install
```

### 本地开发服务器
```bash
pnpm dev
```
访问 http://localhost:5173 查看文档网站

### 构建生产版本
```bash
pnpm build
```
构建产物在 `.vitepress/dist` 目录

### 预览构建结果
```bash
pnpm preview
```

## 部署

### GitHub Pages
```yaml
# .github/workflows/deploy-docs.yml
name: Deploy Docs

on:
  push:
    branches: [ main ]
    paths: [ 'docs/**' ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'pnpm'
          
      - name: Install pnpm
        run: npm install -g pnpm
        
      - name: Install dependencies
        run: cd docs && pnpm install
        
      - name: Build docs
        run: cd docs && pnpm build
        
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs/.vitepress/dist
```

### Netlify
1. 连接 GitHub 仓库
2. 设置构建命令：`cd docs && pnpm build`
3. 设置发布目录：`docs/.vitepress/dist`

### Vercel
```json
// vercel.json
{
  "buildCommand": "cd docs && pnpm build",
  "outputDirectory": "docs/.vitepress/dist",
  "installCommand": "pnpm install"
}
```

## 内容贡献

### 文档编写规范
1. **标题结构**：使用清晰的层级结构（H1-H6）
2. **代码示例**：提供完整的、可运行的代码示例
3. **截图说明**：重要操作步骤配以截图说明
4. **链接引用**：使用相对路径引用其他文档页面

### 图片资源
- 将图片放置在 `public/images/` 目录
- 使用描述性的文件名
- 推荐使用 WebP 格式以优化加载速度

### Markdown 扩展
VitePress 支持的特殊语法：

```markdown
<!-- 信息提示框 -->
::: info
这是一个信息提示
:::

::: tip
这是一个小贴士
:::

::: warning
这是一个警告
:::

::: danger
这是一个危险提示
:::

<!-- 代码组 -->
::: code-group
```typescript [TypeScript]
const result = await invoke('command', params);
```

```javascript [JavaScript]  
const result = await invoke('command', params);
```
:::

<!-- 自定义容器 -->
::: details 点击查看详细信息
这里是详细内容
:::
```

## 文档特色

### 完全中文化
- 所有文档内容使用中文编写
- 符合中文用户的阅读习惯
- 本土化的使用场景和示例

### 基于实际项目
- 文档内容基于真实的 ImgToss 项目架构
- 包含实际的代码示例和配置模板
- 技术细节准确可信

### 用户友好
- 从新手到专家的渐进式文档结构
- 丰富的示例和截图说明
- 详细的故障排除指南

### 开发者友好
- 完整的 API 参考文档
- 详细的技术架构说明
- 贡献指南和开发规范

## 维护和更新

### 定期更新内容
- 跟随 ImgToss 功能更新文档内容
- 补充用户反馈的常见问题
- 优化文档结构和用户体验

### 社区贡献
欢迎社区贡献文档内容：
- 修正文档错误
- 补充使用案例
- 翻译为其他语言
- 改进文档结构

## 联系和支持

- GitHub Issues: [报告文档问题](https://github.com/your-repo/imgtoss/issues)
- Discussions: [文档改进建议](https://github.com/your-repo/imgtoss/discussions)
- Email: docs@imgtoss.com

---

通过这套完整的文档体系，用户可以全面了解和使用 ImgToss 的所有功能，开发者也能快速上手项目开发和贡献代码。