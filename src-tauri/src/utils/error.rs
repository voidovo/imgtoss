use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("File system error: {0}")]
    FileSystem(String),
    
    #[error("IO error: {0}")]
    IO(#[from] std::io::Error),
    
    #[error("Image processing error: {0}")]
    ImageProcessing(String),
    
    #[error("OSS operation error: {0}")]
    OSSOperation(String),
    
    #[error("Configuration error: {0}")]
    Configuration(String),
    
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("Encryption error: {0}")]
    #[allow(dead_code)]
    Encryption(String),
    
    #[error("Regex error: {0}")]
    Regex(#[from] regex::Error),
    
    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    
    #[error("Security error: {0}")]
    Security(String),
    
    #[error("Task not found: {0}")]
    #[allow(dead_code)]
    TaskNotFound(String),
    
    #[error("Operation cancelled")]
    #[allow(dead_code)]
    Cancelled,
    
    #[error("Permission denied: {0}")]
    #[allow(dead_code)]
    PermissionDenied(String),
}

pub type Result<T> = std::result::Result<T, AppError>;