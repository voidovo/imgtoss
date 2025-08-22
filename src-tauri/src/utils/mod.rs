pub mod error;
pub mod logger;

pub use error::{AppError, Result};
pub use logger::{init_logger, get_logger, LogConfig, LogRotation};