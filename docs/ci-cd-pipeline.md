# CI/CD 流水线配置文档

本文档详细说明了 ImgToss 项目的 GitHub Actions CI/CD 流水线配置，包括测试、构建和发布三个主要工作流。

## 概述

ImgToss 使用 GitHub Actions 实现完整的 CI/CD 流水线，支持：
- ✅ 自动化测试（前端 + 后端）
- 🏗️ 跨平台构建（Linux、macOS、Windows）
- 🚀 自动发布到 GitHub Releases
- 🔄 应用自动更新支持
- 🛡️ 安全扫描和性能测试

## 工作流文件结构

```
.github/workflows/
├── test.yml     # 测试流水线
├── build.yml    # 构建流水线
└── release.yml  # 发布流水线
```

---

## 1. 测试流水线 (test.yml)

### 触发条件
- **Push 事件**：推送到 `main` 或 `develop` 分支
- **Pull Request**：针对 `main` 或 `develop` 分支的 PR

### 工作流程

#### 1.1 前端测试 (test-frontend)
**运行环境**：`ubuntu-latest`  
**测试矩阵**：Node.js 18.x, 20.x

**执行步骤**：
1. **代码检出**：使用 `actions/checkout@v4`
2. **环境设置**：
   - 安装 pnpm 8.x
   - 设置 Node.js（支持多版本矩阵测试）
   - 启用 pnpm 缓存
3. **依赖安装**：`pnpm install --frozen-lockfile`
4. **质量检查**：
   - TypeScript 类型检查：`pnpm run build`
   - ESLint 代码规范检查：`pnpm run lint`
5. **单元测试**：`pnpm run test:run`

#### 1.2 后端测试 (test-backend)
**运行环境**：`ubuntu-latest`, `windows-latest`, `macos-latest`  
**测试矩阵**：三平台并行测试

**执行步骤**：
1. **代码检出**：使用 `actions/checkout@v4`
2. **Rust 环境**：
   - 安装稳定版 Rust 工具链
   - 包含 `clippy` 和 `rustfmt` 组件
   - 启用 Rust 缓存优化
3. **系统依赖**（Ubuntu）：
   ```bash
   libwebkit2gtk-4.0-dev libwebkit2gtk-4.1-dev 
   libappindicator3-dev librsvg2-dev patchelf
   ```
4. **代码质量**：
   - 格式检查：`cargo fmt --check`
   - Clippy 静态分析：`cargo clippy -- -D warnings`
5. **单元测试**：`cargo test`

#### 1.3 集成测试 (integration-test)
**依赖**：前端和后端测试完成后执行  
**目的**：验证 Tauri 应用完整构建流程

**执行步骤**：
1. 设置完整的构建环境
2. 构建前端应用
3. 执行 Tauri 调试构建：`pnpm tauri build --debug`

---

## 2. 构建流水线 (build.yml)

### 触发条件
- **标签推送**：格式为 `v*.*.*` 的版本标签
- **手动触发**：通过 `workflow_dispatch` 手动执行

### 构建矩阵

| 平台 | 运行环境 | Rust Target | 输出格式 |
|------|----------|-------------|----------|
| Linux | ubuntu-20.04 | x86_64-unknown-linux-gnu | .deb, .AppImage |
| macOS x64 | macos-latest | x86_64-apple-darwin | .dmg, .app |
| macOS ARM | macos-latest | aarch64-apple-darwin | .dmg, .app |
| Windows | windows-latest | x86_64-pc-windows-msvc | .msi, .exe |

### 工作流程

#### 2.1 构建阶段 (build)
**并行执行**：四个平台同时构建

**通用步骤**：
1. **环境准备**：
   - 检出代码
   - 安装 pnpm 8.x
   - 设置 Node.js 20.x
   - 安装对应平台的 Rust 工具链
2. **缓存优化**：
   - pnpm 依赖缓存
   - Rust 编译缓存（按平台分离）
3. **系统依赖**（Linux 特有）：
   ```bash
   sudo apt-get install -y libwebkit2gtk-4.0-dev \
     libwebkit2gtk-4.1-dev libappindicator3-dev \
     librsvg2-dev patchelf
   ```
4. **构建过程**：
   - 安装前端依赖：`pnpm install --frozen-lockfile`
   - 构建前端：`pnpm run build`
   - 构建 Tauri 应用：`pnpm tauri build --target <target>`
5. **产物上传**：使用 `actions/upload-artifact@v4` 上传构建产物

**环境变量**：
- `GITHUB_TOKEN`：GitHub API 访问令牌
- `TAURI_SIGNING_PRIVATE_KEY`：Tauri 更新签名私钥
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：私钥密码

#### 2.2 发布阶段 (create-release)
**依赖**：所有平台构建完成  
**条件**：仅在标签推送时执行

**执行步骤**：
1. 下载所有构建产物
2. 使用 `softprops/action-gh-release@v2` 创建 GitHub Release
3. 上传所有平台的安装包
4. 自动生成发布说明

---

## 3. 发布流水线 (release.yml)

### 触发条件
- **Release 发布**：GitHub Release 发布时自动触发
- **手动触发**：指定标签手动执行

### 工作流程

#### 3.1 更新清单生成 (generate-updater)
**目的**：为 Tauri 自动更新功能生成配置文件

**执行步骤**：
1. **环境设置**：Node.js + Rust 环境
2. **版本信息提取**：
   - 从 GitHub 事件或手动输入获取版本号
   - 生成标准化的版本信息
3. **更新清单生成**：
   ```json
   {
     "version": "1.0.0",
     "notes": "更新说明链接",
     "pub_date": "2024-01-01T00:00:00Z",
     "platforms": {
       "linux-x86_64": { "signature": "", "url": "下载链接" },
       "windows-x86_64": { "signature": "", "url": "下载链接" },
       "darwin-x86_64": { "signature": "", "url": "下载链接" },
       "darwin-aarch64": { "signature": "", "url": "下载链接" }
     }
   }
   ```
4. **清单上传**：将 `latest.json` 上传到 GitHub Release

#### 3.2 用户通知 (notify-users)
**条件**：仅在正式发布时执行

**功能**：
- 输出发布信息到构建日志
- 可扩展为发送通知到其他平台
- 更新 README 中的版本徽章

#### 3.3 安全扫描 (security-scan)
**工具**：Trivy 漏洞扫描器

**执行步骤**：
1. 扫描项目文件系统
2. 生成 SARIF 格式报告
3. 上传到 GitHub Security 标签页
4. 集成到 GitHub Advanced Security

#### 3.4 性能测试 (performance-test)
**功能**：
- **Bundle 分析**：分析前端构建产物大小
- **性能报告**：生成详细的性能分析报告
- **Lighthouse CI**：可扩展 Web 性能测试

**输出示例**：
```
## 📊 Bundle 分析报告
| 文件 | 大小 |
|------|------|
| main.js | 245KB |
| vendor.js | 1.2MB |
```

---

## 环境变量和密钥配置

### 必需的 GitHub Secrets

| 密钥名称 | 用途 | 获取方式 |
|----------|------|----------|
| `GITHUB_TOKEN` | GitHub API 访问 | 自动提供 |
| `TAURI_SIGNING_PRIVATE_KEY` | 应用更新签名 | `tauri signer generate` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 签名私钥密码 | 生成时设置 |

### 可选的 Secrets（用于代码签名）

| 密钥名称 | 用途 | 平台 |
|----------|------|------|
| `APPLE_CERTIFICATE` | macOS 代码签名 | macOS |
| `APPLE_CERTIFICATE_PASSWORD` | 证书密码 | macOS |
| `WINDOWS_CERTIFICATE` | Windows 代码签名 | Windows |
| `WINDOWS_CERTIFICATE_PASSWORD` | 证书密码 | Windows |

---

## 使用指南

### 1. 开发流程
1. **功能开发**：在功能分支开发
2. **提交 PR**：自动触发测试流水线
3. **代码审查**：确保所有测试通过
4. **合并主分支**：触发完整测试

### 2. 发布流程
1. **版本标记**：
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. **自动构建**：GitHub Actions 自动构建三平台应用
3. **自动发布**：创建 GitHub Release 并上传安装包
4. **更新推送**：生成更新清单，支持应用内自动更新

### 3. 本地测试
使用提供的构建脚本进行本地测试：
```bash
# 构建当前平台
./scripts/build.sh

# 构建指定平台
./scripts/build.sh linux
./scripts/build.sh macos
./scripts/build.sh windows
```

---

## 性能优化

### 1. 缓存策略
- **pnpm 缓存**：加速依赖安装
- **Rust 缓存**：按平台分离，避免交叉污染
- **构建缓存**：增量编译支持

### 2. 并行执行
- **测试并行**：前端后端同时测试
- **构建并行**：四平台同时构建
- **矩阵优化**：合理分配资源

### 3. 构建时间优化
- **依赖预安装**：使用 Docker 镜像预装依赖
- **增量构建**：只构建变更部分
- **资源限制**：合理分配 CPU 和内存

---

## 故障排除

### 常见问题

1. **构建失败**：
   - 检查 Rust 工具链版本
   - 验证系统依赖安装
   - 查看详细错误日志

2. **测试失败**：
   - 本地运行相同测试命令
   - 检查环境变量配置
   - 验证依赖版本兼容性

3. **发布失败**：
   - 确认 GitHub Token 权限
   - 检查签名密钥配置
   - 验证标签格式正确

### 调试技巧

1. **启用调试模式**：
   ```yaml
   - name: 调试信息
     run: |
       echo "Node version: $(node --version)"
       echo "Rust version: $(rustc --version)"
       echo "Platform: ${{ runner.os }}"
   ```

2. **保留构建产物**：
   ```yaml
   - name: 上传调试产物
     if: failure()
     uses: actions/upload-artifact@v4
     with:
       name: debug-logs
       path: |
         *.log
         target/debug/
   ```

3. **SSH 调试**：
   ```yaml
   - name: SSH 调试
     if: failure()
     uses: mxschmitt/action-tmate@v3
   ```

---

## 扩展功能

### 1. 代码签名
为生产环境添加代码签名支持：
- macOS：Apple Developer 证书
- Windows：Authenticode 证书
- 自动化签名流程

### 2. 多环境部署
支持不同环境的部署：
- 开发环境：自动部署到测试服务器
- 预发布环境：Beta 版本发布
- 生产环境：正式版本发布

### 3. 监控集成
集成监控和分析工具：
- 构建时间监控
- 成功率统计
- 性能趋势分析

---

## 总结

ImgToss 的 CI/CD 流水线提供了完整的自动化解决方案：

- 🧪 **全面测试**：前端、后端、集成测试全覆盖
- 🏗️ **跨平台构建**：支持 Linux、macOS、Windows 三大平台
- 🚀 **自动发布**：一键发布到 GitHub Releases
- 🔄 **自动更新**：支持应用内自动更新
- 🛡️ **安全保障**：代码扫描和安全检查
- 📊 **性能监控**：构建性能和应用性能分析

通过这套 CI/CD 流水线，开发团队可以专注于功能开发，而将构建、测试、发布等重复性工作完全自动化，大大提高了开发效率和软件质量。