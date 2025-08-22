# imgtoss-next 日志系统使用指南

## 概述

imgtoss-next 项目集成了一个完整的日志系统，支持结构化日志记录、文件轮转、级别控制等功能。日志系统基于 Rust 的 `tracing` 库构建，提供高性能和丰富的功能。

## 功能特性

### ✅ 核心功能
- **多级别日志**: TRACE, DEBUG, INFO, WARN, ERROR
- **双输出模式**: 同时支持控制台和文件输出
- **结构化日志**: JSON 格式，便于分析和搜索
- **文件轮转**: 支持按日、按小时或不轮转
- **自动清理**: 可配置保留文件数量，自动删除旧日志
- **实时查看**: 提供前端界面查看和搜索日志
- **安全访问**: 路径验证，防止路径遍历攻击

### 📁 文件结构
```
src-tauri/src/
├── utils/
│   └── logger.rs          # 日志核心模块
├── commands/
│   └── logger.rs          # Tauri 命令接口
└── main.rs                # 日志系统初始化

lib/
└── logger-api.ts          # 前端 API 封装

components/ui/
└── log-viewer.tsx         # 日志查看器组件
```

## 使用方法

### 1. 后端 Rust 代码中记录日志

#### 基础日志宏
```rust
use crate::{log_trace, log_debug, log_info, log_warn, log_error};

// 不同级别的日志
log_trace!(\"这是一条跟踪日志\");
log_debug!(\"这是一条调试日志\");
log_info!(\"这是一条信息日志\");
log_warn!(\"这是一条警告日志\");
log_error!(\"这是一条错误日志\");
```

#### 结构化日志
```rust
use tracing;

// 带字段的结构化日志
log_info!(
    user_id = %user_id,
    action = \"upload_image\",
    file_size = file_size,
    \"用户上传图片完成\"
);

// 复杂的结构化日志
tracing::error!(
    error = %error,
    file_path = %file_path,
    retry_count = retry_count,
    operation = \"file_upload\",
    \"文件上传失败\"
);
```

#### 操作日志宏
```rust
use crate::log_operation;

// 记录操作事件
log_operation!(
    info,
    \"user_login\",
    user_id = \"12345\",
    ip_address = \"192.168.1.1\",
    success = true
);
```

#### 性能监控宏
```rust
use crate::log_timing;

// 记录函数执行时间
let result = log_timing!({
    expensive_operation()
});

// 带操作名称的性能监控
let result = log_timing!({
    upload_file_to_oss(file_path)
}, \"upload_to_oss\");
```

### 2. 前端 TypeScript 代码中使用日志 API

#### 基础用法
```typescript
import { loggerAPI } from '@/lib/logger-api';

// 获取日志配置
const config = await loggerAPI.getLogConfig();
console.log('日志级别:', config.level);

// 获取日志文件列表
const logFiles = await loggerAPI.getLogFiles();
console.log('找到日志文件:', logFiles.length);

// 读取日志文件内容
const content = await loggerAPI.readLogFile(
  logFiles[0].path,
  0,    // 起始行
  100   // 最大行数
);
```

#### 使用日志查看器组件
```tsx
import { LogViewer } from '@/components/ui/log-viewer';

export function LogsPage() {
  return (
    <div className=\"container mx-auto py-6\">
      <h1 className=\"text-2xl font-bold mb-6\">系统日志</h1>
      <LogViewer />
    </div>
  );
}
```

### 3. 配置日志系统

#### 自定义日志配置
```rust
use crate::utils::logger::{init_logger, LogConfig, LogRotation};

// 自定义配置
let config = LogConfig {
    level: \"debug\".to_string(),
    log_dir: PathBuf::from(\"/custom/log/path\"),
    console_output: true,
    file_output: true,
    rotation: LogRotation::Daily,
    max_files: Some(30),
    file_prefix: \"my_app\".to_string(),
};

// 初始化日志系统
init_logger(Some(config))?;
```

#### 环境变量配置
```bash
# 设置日志级别
export RUST_LOG=imgtoss=debug,tower_http=warn

# 启动应用
npm run tauri dev
```

## 日志级别说明

| 级别 | 用途 | 颜色 | 示例场景 |
|------|------|------|----------|
| TRACE | 详细跟踪 | 灰色 | 函数进入/退出，循环迭代 |
| DEBUG | 调试信息 | 蓝色 | 变量值，中间状态 |
| INFO | 一般信息 | 绿色 | 操作成功，状态变更 |
| WARN | 警告信息 | 黄色 | 可恢复错误，性能问题 |
| ERROR | 错误信息 | 红色 | 操作失败，异常情况 |

## 最佳实践

### 1. 日志内容设计

#### ✅ 好的日志实践
```rust
// 包含关键上下文信息
log_info!(
    operation = \"upload_image\",
    user_id = %user_id,
    file_name = %file_name,
    file_size = file_size,
    duration_ms = elapsed.as_millis(),
    \"图片上传成功\"
);

// 错误日志包含足够的调试信息
log_error!(
    error = %error,
    file_path = %file_path,
    retry_count = retry_count,
    oss_provider = %config.provider,
    \"文件上传到OSS失败\"
);
```

#### ❌ 避免的日志实践
```rust
// 缺乏上下文信息
log_info!(\"操作成功\");

// 在循环中大量输出
for item in items {
    log_debug!(\"处理项目: {:?}\", item); // 可能产生大量日志
}

// 泄露敏感信息
log_info!(\"用户密码: {}\", password); // 不要记录敏感信息
```

### 2. 性能考虑

```rust
// 使用惰性求值避免不必要的计算
log_debug!(\"复杂计算结果: {}\", expensive_calculation()); // ❌

// 更好的方式
if tracing::enabled!(tracing::Level::DEBUG) {
    log_debug!(\"复杂计算结果: {}\", expensive_calculation()); // ✅
}

// 或者使用闭包
log_debug!(\"复杂计算结果: {}\", || expensive_calculation()); // ✅
```

### 3. 结构化字段命名

```rust
// 使用一致的字段命名
log_info!(
    user_id = %user_id,        // 用户相关用 user_*
    file_name = %file_name,    // 文件相关用 file_*
    operation = \"upload\",      // 操作类型
    duration_ms = elapsed_ms,  // 时间用 *_ms 或 *_seconds
    success = true,           // 布尔值直接使用
    \"操作完成\"
);
```

## 日志文件管理

### 1. 文件命名规则

```
日志目录: ~/.local/share/imgtoss/logs/

文件名格式:
- 按日轮转: imgtoss.2024-01-15.log
- 按小时轮转: imgtoss.2024-01-15-14.log
- 不轮转: imgtoss.log
```

### 2. 自动清理

```typescript
// 清理30天前的日志
const result = await loggerAPI.cleanupOldLogs(30);
console.log(`删除了 ${result.deleted_files} 个文件，释放 ${result.freed_space} 字节`);
```

### 3. 手动管理

```bash
# 查看日志目录
ls -la ~/.local/share/imgtoss/logs/

# 压缩旧日志
gzip ~/.local/share/imgtoss/logs/*.log

# 删除超过90天的日志
find ~/.local/share/imgtoss/logs/ -name \"*.log\" -mtime +90 -delete
```

## 故障排查

### 1. 日志系统无法启动

**问题**: 应用启动时报告日志初始化失败

**解决方案**:
```bash
# 检查日志目录权限
ls -la ~/.local/share/imgtoss/

# 创建日志目录
mkdir -p ~/.local/share/imgtoss/logs
chmod 755 ~/.local/share/imgtoss/logs
```

### 2. 日志文件过大

**问题**: 单个日志文件占用过多磁盘空间

**解决方案**:
1. 调整日志级别到 INFO 或更高
2. 启用日志轮转（按日或按小时）
3. 减少 max_files 数量
4. 定期清理旧日志

### 3. 查找特定错误

```bash
# 在日志文件中搜索错误
grep -r \"ERROR\" ~/.local/share/imgtoss/logs/

# 搜索特定操作
grep -r \"operation.*upload\" ~/.local/share/imgtoss/logs/

# 使用 jq 分析 JSON 日志
cat ~/.local/share/imgtoss/logs/imgtoss.log | jq 'select(.level == \"ERROR\")'
```

## API 参考

### Rust API

```rust
// 初始化日志系统
pub fn init_logger(config: Option<LogConfig>) -> Result<()>

// 获取日志管理器实例
pub fn get_logger() -> Option<&'static Logger>

// 日志宏
log_trace!(\"message\"); 
log_debug!(\"message\");
log_info!(\"message\");
log_warn!(\"message\");
log_error!(\"message\");

// 结构化日志宏
log_operation!(level, operation, field1 = value1, field2 = value2);
log_timing!(expression);
log_timing!(expression, \"operation_name\");
```

### TypeScript API

```typescript
interface LoggerAPI {
  getLogConfig(): Promise<LogConfigInfo>;
  getLogFiles(): Promise<LogFileInfo[]>;
  readLogFile(filePath: string, startLine?: number, maxLines?: number): Promise<LogFileContent>;
  cleanupOldLogs(daysToKeep: number): Promise<CleanupResult>;
  writeTestLog(): Promise<void>;
  formatFileSize(bytes: number): string;
  formatLogTime(isoString: string): string;
  parseLogLine(line: string): LogEntry | null;
  filterLogs(logs: LogEntry[], filters: FilterOptions): LogEntry[];
}
```

## 总结

这个日志系统为 imgtoss-next 项目提供了完整的日志记录、管理和查看功能。通过合理使用不同级别的日志和结构化字段，可以大大提高问题排查的效率。建议在开发过程中多使用 DEBUG 级别记录详细信息，在生产环境中使用 INFO 级别记录关键操作。