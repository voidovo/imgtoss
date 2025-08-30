---
layout: home

hero:
  name: "ImgToss"
  text: "现代化图像上传管理工具"
  tagline: "专为开发者和内容创作者设计的跨平台桌面应用"
  image:
    src: /hero-image.png
    alt: ImgToss Hero Image
  actions:
    - theme: brand
      text: 快速开始
      link: /快速开始指南
    - theme: alt
      text: 查看 GitHub
      link: https://github.com/your-repo/imgtoss
    - theme: alt
      text: 下载应用
      link: https://github.com/your-repo/imgtoss/releases

features:
  - icon: 🔒
    title: 隐私至上
    details: 完全本地运行，所有处理在本地完成，配置信息加密存储，零数据泄露风险
    
  - icon: ⚡
    title: 高效自动化
    details: 智能解析 Markdown 文档，批量上传处理，自动链接替换，重复检测机制
    
  - icon: 🌐
    title: 多云支持
    details: 统一管理阿里云OSS、腾讯云COS、AWS S3等多种云存储服务
    
  - icon: 🎨
    title: 现代界面
    details: 基于 Next.js + Tauri 的现代化界面，响应式设计，深浅主题支持
    
  - icon: 📊
    title: 完整历史
    details: 详细的上传历史记录，强大的搜索筛选功能，数据导出支持
    
  - icon: 🛡️
    title: 企业级安全
    details: 严格的输入验证，权限控制，错误处理机制，安全的加密存储
---

## 为什么选择 ImgToss？

ImgToss 是一款专为现代开发者和内容创作者设计的图像上传管理工具。它解决了图片上传和管理中的痛点，提供了高效、安全、易用的解决方案。

### 🚀 快速上手

无需复杂配置，5分钟内即可完成安装和首次上传。支持拖拽上传、批量处理，让您专注于内容创作而非技术细节。

```bash
# 下载并安装
curl -L https://github.com/your-repo/imgtoss/releases/latest/download/imgtoss-setup.exe

# 或通过包管理器安装
brew install imgtoss
```

### 🔧 双模式设计

#### 📝 文章上传模式
- 自动扫描 Markdown 文档中的本地图片引用
- 批量上传并自动替换为云存储链接
- 安全备份机制，支持一键恢复

#### 🖼️ 图片上传模式  
- 支持拖拽和批量选择
- 实时上传进度显示
- 多种链接格式一键复制

### 💡 智能特性

<div class="feature-grid">
  <div class="feature-item">
    <h4>🔍 重复检测</h4>
    <p>基于 SHA256 校验和的智能重复检测，避免重复上传浪费存储空间</p>
  </div>
  
  <div class="feature-item">
    <h4>📱 跨平台支持</h4>
    <p>支持 Windows、macOS、Linux 三大平台，统一的使用体验</p>
  </div>
  
  <div class="feature-item">
    <h4>⚙️ 灵活配置</h4>
    <p>支持多存储配置、自定义路径、批量重命名等高级功能</p>
  </div>
  
  <div class="feature-item">
    <h4>🔄 断点续传</h4>
    <p>网络中断自动恢复，大文件分片上传，确保传输稳定性</p>
  </div>
</div>

### 🏢 适用场景

<div class="use-case-grid">
  <div class="use-case">
    <h4>📚 内容创作者</h4>
    <ul>
      <li>博客文章图片管理</li>
      <li>技术文档配图处理</li>
      <li>社交媒体内容发布</li>
    </ul>
  </div>
  
  <div class="use-case">
    <h4>👩‍💻 开发者</h4>
    <ul>
      <li>项目文档图片资源管理</li>
      <li>API 文档截图处理</li>
      <li>README 文件图片上传</li>
    </ul>
  </div>
  
  <div class="use-case">
    <h4>🏢 团队协作</h4>
    <ul>
      <li>知识库图片统一管理</li>
      <li>项目资源云端存储</li>
      <li>多人协作图片共享</li>
    </ul>
  </div>
</div>

## 立即开始使用

<div class="getting-started">
  <div class="step">
    <div class="step-number">1</div>
    <div class="step-content">
      <h4>下载安装</h4>
      <p>从 GitHub Releases 下载适合您系统的安装包</p>
    </div>
  </div>
  
  <div class="step">
    <div class="step-number">2</div>
    <div class="step-content">
      <h4>配置存储</h4>
      <p>添加您的云存储配置（阿里云OSS/腾讯云COS/AWS S3）</p>
    </div>
  </div>
  
  <div class="step">
    <div class="step-number">3</div>
    <div class="step-content">
      <h4>开始上传</h4>
      <p>拖拽图片或选择 Markdown 文档，一键批量上传</p>
    </div>
  </div>
</div>

## 开源与社区

ImgToss 是一个完全开源的项目，采用 MIT 许可证。我们欢迎社区贡献，无论是代码改进、文档完善还是问题反馈。

- 🐛 [报告问题](https://github.com/your-repo/imgtoss/issues)
- 💡 [功能建议](https://github.com/your-repo/imgtoss/discussions)
- 🛠️ [参与开发](https://github.com/your-repo/imgtoss/blob/main/CONTRIBUTING.md)
- 📖 [查看文档](/产品介绍)

<style>
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin: 2rem 0;
}

.feature-item {
  padding: 1.5rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.feature-item h4 {
  margin: 0 0 0.5rem 0;
  color: var(--vp-c-brand-1);
}

.feature-item p {
  margin: 0;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.use-case-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
  margin: 2rem 0;
}

.use-case {
  padding: 1.5rem;
  border-left: 4px solid var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}

.use-case h4 {
  margin: 0 0 1rem 0;
  color: var(--vp-c-brand-1);
}

.use-case ul {
  margin: 0;
  padding-left: 1.2rem;
}

.use-case li {
  margin: 0.3rem 0;
  color: var(--vp-c-text-2);
}

.getting-started {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin: 2rem 0;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.step-number {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.1rem;
}

.step-content h4 {
  margin: 0 0 0.5rem 0;
  color: var(--vp-c-text-1);
}

.step-content p {
  margin: 0;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

@media (min-width: 768px) {
  .getting-started {
    flex-direction: row;
  }
  
  .step {
    flex: 1;
    flex-direction: column;
    text-align: center;
  }
  
  .step-number {
    margin: 0 auto 1rem auto;
  }
}
</style>