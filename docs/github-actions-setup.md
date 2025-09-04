# GitHub Actions 快速设置指南

本指南帮助您快速设置 ImgToss 项目的 GitHub Actions CI/CD 流水线。

## 前置条件

1. **GitHub 仓库**：确保项目已推送到 GitHub
2. **仓库权限**：需要仓库的 Admin 权限来配置 Secrets
3. **Tauri 签名密钥**：用于应用自动更新功能

## 设置步骤

### 1. 生成 Tauri 签名密钥

在项目根目录执行：

```bash
# 安装 Tauri CLI（如果未安装）
pnpm add -D @tauri-apps/cli

# 生成签名密钥对
pnpm tauri signer generate -w ~/.tauri/myapp.key
```

这将生成：
- 私钥文件：`~/.tauri/myapp.key`
- 公钥：显示在终端输出中

### 2. 配置 GitHub Secrets

进入 GitHub 仓库 → Settings → Secrets and variables → Actions

添加以下 Secrets：

| Secret 名称 | 值 | 说明 |
|-------------|----|----|
| `TAURI_SIGNING_PRIVATE_KEY` | 私钥文件内容 | 复制 `~/.tauri/myapp.key` 的完整内容 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码 | 生成密钥时设置的密码 |

### 3. 更新 Tauri 配置

将生成的公钥添加到 `src-tauri/tauri.conf.json`：

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/YOUR_USERNAME/imgtoss/releases/latest/download/latest.json"
      ],
      "dialog": true,
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

### 4. 测试工作流

#### 测试流水线
推送代码到 `main` 分支或创建 PR：
```bash
git push origin main
```

#### 构建流水线
创建版本标签：
```bash
git tag v0.1.0
git push origin v0.1.0
```

#### 发布流水线
在 GitHub 上创建 Release，或标签推送后自动创建。

## 验证设置

### 1. 检查工作流状态
- 进入 GitHub 仓库 → Actions 标签页
- 查看工作流运行状态和日志

### 2. 验证构建产物
- 检查 Artifacts 是否正确生成
- 验证三平台安装包是否完整

### 3. 测试自动更新
- 安装应用后，发布新版本
- 验证应用内更新提示是否正常

## 常见问题

### Q: 构建失败，提示缺少系统依赖
**A**: 确保 `.github/workflows/build.yml` 中的系统依赖安装命令正确。

### Q: 签名验证失败
**A**: 检查私钥和公钥是否匹配，密码是否正确。

### Q: 发布后应用无法检测到更新
**A**: 验证更新端点 URL 是否正确，`latest.json` 是否生成。

## 高级配置

### 代码签名（可选）
为生产环境添加代码签名：

**macOS**:
```yaml
env:
  APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
  APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
```

**Windows**:
```yaml
env:
  WINDOWS_CERTIFICATE: ${{ secrets.WINDOWS_CERTIFICATE }}
  WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
```

### 自定义构建
修改 `scripts/build.sh` 以适应特定需求：
```bash
# 添加自定义构建步骤
./scripts/build.sh linux
```

## 支持

如遇问题，请查看：
1. [CI/CD 流水线详细文档](./ci-cd-pipeline.md)
2. [GitHub Actions 日志](https://github.com/YOUR_USERNAME/imgtoss/actions)
3. [Tauri 官方文档](https://tauri.app/v1/guides/distribution/updater)