use std::path::PathBuf;
use std::sync::Once;
use tracing::{info, warn, error};
use tracing_subscriber::{
    fmt::{self, time::UtcTime},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter, Layer,
};
use tracing_appender::{non_blocking::WorkerGuard, rolling};
use dirs;
use crate::utils::{AppError, Result};

static LOGGER_INIT: Once = Once::new();
static mut WORKER_GUARD: Option<WorkerGuard> = None;

#[derive(Debug, Clone)]
pub enum LogRotation {
    Never,
    Hourly,
    Daily,
}

#[derive(Debug, Clone)]
pub struct LogConfig {
    pub level: String,
    pub log_dir: PathBuf,
    pub console_output: bool,
    pub file_output: bool,
    pub rotation: LogRotation,
    pub max_files: Option<usize>,
    pub file_prefix: String,
}

impl Default for LogConfig {
    fn default() -> Self {
        let log_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("imgtoss")
            .join("logs");
        
        // Different settings for dev vs release
        let (console_output, file_output) = if cfg!(debug_assertions) {
            // Development: only console output with human readable format
            (true, false)
        } else {
            // Release: only file output with JSON format
            (false, true)
        };
        
        Self {
            level: if cfg!(debug_assertions) { "debug".to_string() } else { "info".to_string() },
            log_dir,
            console_output,
            file_output,
            rotation: LogRotation::Daily,
            max_files: Some(30),
            file_prefix: "imgtoss".to_string(),
        }
    }
}

pub struct Logger {
    config: LogConfig,
}

impl Logger {
    pub fn new(config: LogConfig) -> Self {
        Self { config }
    }

    pub fn init(&self) -> Result<()> {
        LOGGER_INIT.call_once(|| {
            if let Err(e) = self.setup_logging() {
                eprintln!("Failed to initialize logger: {}", e);
            }
        });
        Ok(())
    }

    fn setup_logging(&self) -> Result<()> {
        // Create log directory if it doesn't exist
        std::fs::create_dir_all(&self.config.log_dir)
            .map_err(|e| AppError::IO(e))?;

        // Create env filter for console
        let console_env_filter = EnvFilter::try_from_default_env()
            .or_else(|_| EnvFilter::try_new(&self.config.level))
            .map_err(|e| AppError::InvalidInput(format!("Invalid log level: {}", e)))?;

        // Create env filter for file
        let file_env_filter = EnvFilter::try_from_default_env()
            .or_else(|_| EnvFilter::try_new(&self.config.level))
            .map_err(|e| AppError::InvalidInput(format!("Invalid log level: {}", e)))?;

        let mut layers = Vec::new();

        // Console output
        if self.config.console_output {
            if cfg!(debug_assertions) {
                // Development: human readable format
                let console_layer = fmt::layer()
                    .with_target(false)
                    .with_level(true)
                    .with_ansi(true)
                    .with_line_number(true)
                    .with_file(true)
                    .compact()
                    .with_filter(console_env_filter);
                layers.push(console_layer.boxed());
            } else {
                // Release: structured format
                let console_layer = fmt::layer()
                    .with_target(true)
                    .with_timer(UtcTime::rfc_3339())
                    .with_level(true)
                    .with_ansi(false)
                    .with_filter(console_env_filter);
                layers.push(console_layer.boxed());
            }
        }

        // File output
        if self.config.file_output {
            let file_appender = match self.config.rotation {
                LogRotation::Never => rolling::never(&self.config.log_dir, &format!("{}.log", self.config.file_prefix)),
                LogRotation::Hourly => rolling::hourly(&self.config.log_dir, &self.config.file_prefix),
                LogRotation::Daily => rolling::daily(&self.config.log_dir, &self.config.file_prefix),
            };

            let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
            
            // Store the guard to prevent it from being dropped
            unsafe {
                WORKER_GUARD = Some(guard);
            }

            let file_layer = fmt::layer()
                .with_writer(non_blocking)
                .with_target(true)
                .with_timer(UtcTime::rfc_3339())
                .with_level(true)
                .with_ansi(false)
                .json()
                .with_filter(file_env_filter);
            layers.push(file_layer.boxed());
        }

        // Initialize subscriber
        tracing_subscriber::registry()
            .with(layers)
            .try_init()
            .map_err(|e| AppError::InvalidInput(format!("Failed to initialize tracing subscriber: {}", e)))?;

        info!("Logger initialized with config: {:?}", self.config);
        
        // Clean up old log files if configured
        if let Some(max_files) = self.config.max_files {
            if let Err(e) = self.cleanup_old_logs(max_files) {
                warn!("Failed to cleanup old log files: {}", e);
            }
        }

        Ok(())
    }

    fn cleanup_old_logs(&self, max_files: usize) -> Result<()> {
        use std::fs;
        use std::time::SystemTime;

        let mut log_files: Vec<(PathBuf, SystemTime)> = Vec::new();

        // Collect log files
        for entry in fs::read_dir(&self.config.log_dir)
            .map_err(|e| AppError::IO(e))? 
        {
            let entry = entry.map_err(|e| AppError::IO(e))?;
            let path = entry.path();
            
            if path.is_file() && 
               path.file_name()
                   .and_then(|name| name.to_str())
                   .map(|name| name.starts_with(&self.config.file_prefix) && name.ends_with(".log"))
                   .unwrap_or(false) {
                
                let metadata = entry.metadata()
                    .map_err(|e| AppError::IO(e))?;
                log_files.push((path, metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH)));
            }
        }

        // Sort by modification time (newest first)
        log_files.sort_by(|a, b| b.1.cmp(&a.1));

        // Remove excess files
        if log_files.len() > max_files {
            for (path, _) in log_files.into_iter().skip(max_files) {
                if let Err(e) = fs::remove_file(&path) {
                    warn!("Failed to remove old log file {:?}: {}", path, e);
                } else {
                    info!("Removed old log file: {:?}", path);
                }
            }
        }

        Ok(())
    }

    pub fn get_config(&self) -> &LogConfig {
        &self.config
    }
}

static mut LOGGER: Option<Logger> = None;

pub fn init_logger(config: Option<LogConfig>) -> Result<()> {
    let config = config.unwrap_or_default();
    let logger = Logger::new(config);
    logger.init()?;
    
    unsafe {
        LOGGER = Some(logger);
    }
    
    Ok(())
}

pub fn get_logger() -> Option<&'static Logger> {
    unsafe { LOGGER.as_ref() }
}

// Logging macros following the guide
#[macro_export]
macro_rules! log_trace {
    ($($arg:tt)*) => {
        tracing::trace!($($arg)*);
    };
}

#[macro_export]
macro_rules! log_debug {
    ($($arg:tt)*) => {
        tracing::debug!($($arg)*);
    };
}

#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {
        tracing::info!($($arg)*);
    };
}

#[macro_export]
macro_rules! log_warn {
    ($($arg:tt)*) => {
        tracing::warn!($($arg)*);
    };
}

#[macro_export]
macro_rules! log_error {
    ($($arg:tt)*) => {
        tracing::error!($($arg)*);
    };
}

// Operation logging macro
#[macro_export]
macro_rules! log_operation {
    ($level:ident, $operation:expr, $($field:ident = $value:expr),* $(,)?) => {
        tracing::$level!(
            operation = $operation,
            $($field = $value,)*
            "Operation executed"
        );
    };
}

// Timing macro
#[macro_export]
macro_rules! log_timing {
    ($block:block) => {{
        let start = std::time::Instant::now();
        let result = $block;
        let duration = start.elapsed();
        tracing::debug!(
            duration_ms = duration.as_millis(),
            "Operation completed"
        );
        result
    }};
    ($block:block, $operation:expr) => {{
        let start = std::time::Instant::now();
        let result = $block;
        let duration = start.elapsed();
        tracing::debug!(
            operation = $operation,
            duration_ms = duration.as_millis(),
            "Operation completed"
        );
        result
    }};
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_log_config_default() {
        let config = LogConfig::default();
        assert_eq!(config.level, "info");
        assert!(config.console_output);
        assert!(config.file_output);
        assert_eq!(config.file_prefix, "imgtoss");
    }

    #[test]
    fn test_logger_creation() {
        let temp_dir = TempDir::new().unwrap();
        let config = LogConfig {
            log_dir: temp_dir.path().to_path_buf(),
            ..LogConfig::default()
        };
        
        let logger = Logger::new(config.clone());
        assert_eq!(logger.get_config().log_dir, config.log_dir);
    }

    #[test]
    fn test_cleanup_old_logs() {
        let temp_dir = TempDir::new().unwrap();
        let config = LogConfig {
            log_dir: temp_dir.path().to_path_buf(),
            max_files: Some(2),
            ..LogConfig::default()
        };
        
        // Create test log files
        let log_files = ["imgtoss.2024-01-01.log", "imgtoss.2024-01-02.log", "imgtoss.2024-01-03.log"];
        for file in &log_files {
            std::fs::write(temp_dir.path().join(file), "test content").unwrap();
        }
        
        let logger = Logger::new(config);
        assert!(logger.cleanup_old_logs(2).is_ok());
        
        // Check that only 2 files remain
        let remaining_files: Vec<_> = std::fs::read_dir(temp_dir.path())
            .unwrap()
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let name = entry.file_name().to_str()?.to_string();
                if name.starts_with("imgtoss") && name.ends_with(".log") {
                    Some(name)
                } else {
                    None
                }
            })
            .collect();
        
        assert_eq!(remaining_files.len(), 2);
    }
}