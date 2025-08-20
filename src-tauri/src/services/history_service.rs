use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::utils::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryRecord {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub operation: OperationType,
    pub files: Vec<String>,
    pub image_count: u32,
    pub success: bool,
    pub backup_path: Option<String>,
    pub duration: Option<u64>, // milliseconds
    pub total_size: Option<u64>, // bytes
    pub error_message: Option<String>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub id: String,
    pub original_path: String,
    pub backup_path: String,
    pub timestamp: DateTime<Utc>,
    pub size: u64,
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOperation {
    pub operation_type: OperationType,
    pub file_path: String,
    pub timestamp: DateTime<Utc>,
    pub success: bool,
    pub error: Option<String>,
    pub details: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OperationType {
    Upload,
    Replace,
    Restore,
    Backup,
    Scan,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryQuery {
    pub operation_type: Option<OperationType>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub success_only: Option<bool>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryStatistics {
    pub total_records: usize,
    pub successful_operations: usize,
    pub failed_operations: usize,
    pub success_rate: f64,
    pub operations_by_type: HashMap<String, usize>,
    pub total_images_processed: u32,
    pub total_size_processed: u64,
    pub average_duration: f64,
    pub oldest_record: Option<DateTime<Utc>>,
    pub newest_record: Option<DateTime<Utc>>,
}

pub struct HistoryService {
    data_dir: PathBuf,
    backup_dir: PathBuf,
    history_file: PathBuf,
    backups_file: PathBuf,
    operations_file: PathBuf,
}

impl HistoryService {
    pub fn new() -> Result<Self, AppError> {
        let data_dir = Self::get_data_directory()?;
        let backup_dir = data_dir.join("backups");
        
        // Ensure directories exist
        fs::create_dir_all(&data_dir)
            .map_err(|e| AppError::FileSystem(format!("Failed to create data directory: {}", e)))?;
        fs::create_dir_all(&backup_dir)
            .map_err(|e| AppError::FileSystem(format!("Failed to create backup directory: {}", e)))?;

        let history_file = data_dir.join("history.json");
        let backups_file = data_dir.join("backups.json");
        let operations_file = data_dir.join("operations.json");

        Ok(Self {
            data_dir,
            backup_dir,
            history_file,
            backups_file,
            operations_file,
        })
    }

    fn get_data_directory() -> Result<PathBuf, AppError> {
        let app_data_dir = dirs::data_dir()
            .ok_or_else(|| AppError::Configuration("Could not determine data directory".to_string()))?
            .join("imgtoss");
        
        Ok(app_data_dir)
    }

    // History Records Management
    pub async fn add_history_record(&self, mut record: HistoryRecord) -> Result<String, AppError> {
        if record.id.is_empty() {
            record.id = Uuid::new_v4().to_string();
        }
        
        let mut records = self.load_history_records().await?;
        records.insert(0, record.clone());
        
        // Keep only the last 1000 records to prevent excessive storage
        if records.len() > 1000 {
            records.truncate(1000);
        }
        
        self.save_history_records(&records).await?;
        Ok(record.id)
    }

    pub async fn get_history_records(&self, query: Option<HistoryQuery>) -> Result<Vec<HistoryRecord>, AppError> {
        let mut records = self.load_history_records().await?;
        
        if let Some(q) = query {
            // Apply filters
            if let Some(op_type) = q.operation_type {
                records.retain(|r| std::mem::discriminant(&r.operation) == std::mem::discriminant(&op_type));
            }
            
            if let Some(start) = q.start_date {
                records.retain(|r| r.timestamp >= start);
            }
            
            if let Some(end) = q.end_date {
                records.retain(|r| r.timestamp <= end);
            }
            
            if let Some(success_only) = q.success_only {
                if success_only {
                    records.retain(|r| r.success);
                }
            }
            
            // Apply pagination
            if let Some(offset) = q.offset {
                if offset < records.len() {
                    records = records.into_iter().skip(offset).collect();
                } else {
                    records.clear();
                }
            }
            
            if let Some(limit) = q.limit {
                records.truncate(limit);
            }
        }
        
        Ok(records)
    }

    pub async fn get_history_record(&self, id: &str) -> Result<Option<HistoryRecord>, AppError> {
        let records = self.load_history_records().await?;
        Ok(records.into_iter().find(|r| r.id == id))
    }

    pub async fn update_history_record(&self, id: &str, updates: HashMap<String, serde_json::Value>) -> Result<bool, AppError> {
        let mut records = self.load_history_records().await?;
        
        if let Some(record) = records.iter_mut().find(|r| r.id == id) {
            // Apply updates
            for (key, value) in updates {
                match key.as_str() {
                    "success" => {
                        if let Some(success) = value.as_bool() {
                            record.success = success;
                        }
                    }
                    "duration" => {
                        if let Some(duration) = value.as_u64() {
                            record.duration = Some(duration);
                        }
                    }
                    "error_message" => {
                        record.error_message = value.as_str().map(|s| s.to_string());
                    }
                    "total_size" => {
                        if let Some(size) = value.as_u64() {
                            record.total_size = Some(size);
                        }
                    }
                    _ => {
                        // Add to metadata
                        if let Some(str_value) = value.as_str() {
                            record.metadata.insert(key, str_value.to_string());
                        }
                    }
                }
            }
            
            self.save_history_records(&records).await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub async fn delete_history_record(&self, id: &str) -> Result<bool, AppError> {
        let mut records = self.load_history_records().await?;
        let initial_len = records.len();
        records.retain(|r| r.id != id);
        
        if records.len() < initial_len {
            self.save_history_records(&records).await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub async fn clear_history(&self, older_than_days: Option<u32>) -> Result<usize, AppError> {
        let mut records = self.load_history_records().await?;
        let initial_count = records.len();
        
        if let Some(days) = older_than_days {
            let cutoff = Utc::now() - chrono::Duration::days(days as i64);
            records.retain(|r| r.timestamp > cutoff);
        } else {
            records.clear();
        }
        
        self.save_history_records(&records).await?;
        Ok(initial_count - records.len())
    }

    // Backup Management
    pub async fn create_backup(&self, file_path: &str) -> Result<BackupInfo, AppError> {
        let source_path = Path::new(file_path);
        if !source_path.exists() {
            return Err(AppError::FileSystem(format!("Source file does not exist: {}", file_path)));
        }

        let file_name = source_path.file_name()
            .ok_or_else(|| AppError::FileSystem("Invalid file path".to_string()))?
            .to_string_lossy();
        
        let timestamp = Utc::now();
        let backup_filename = format!("{}_{}.bak", 
            timestamp.format("%Y%m%d_%H%M%S"), 
            file_name
        );
        
        let backup_path = self.backup_dir.join(&backup_filename);
        
        // Copy file to backup location
        fs::copy(source_path, &backup_path)
            .map_err(|e| AppError::FileSystem(format!("Failed to create backup: {}", e)))?;
        
        let metadata = fs::metadata(&backup_path)
            .map_err(|e| AppError::FileSystem(format!("Failed to read backup metadata: {}", e)))?;
        
        let backup_info = BackupInfo {
            id: Uuid::new_v4().to_string(),
            original_path: file_path.to_string(),
            backup_path: backup_path.to_string_lossy().to_string(),
            timestamp,
            size: metadata.len(),
            checksum: None, // TODO: Implement checksum calculation if needed
        };
        
        // Save backup info
        let mut backups = self.load_backups().await?;
        backups.insert(0, backup_info.clone());
        
        // Keep only the last 100 backups
        if backups.len() > 100 {
            // Remove old backup files
            for old_backup in backups.iter().skip(100) {
                let _ = fs::remove_file(&old_backup.backup_path);
            }
            backups.truncate(100);
        }
        
        self.save_backups(&backups).await?;
        
        Ok(backup_info)
    }

    pub async fn restore_from_backup(&self, backup_id: &str) -> Result<String, AppError> {
        let backups = self.load_backups().await?;
        let backup = backups.iter()
            .find(|b| b.id == backup_id)
            .ok_or_else(|| AppError::Configuration(format!("Backup not found: {}", backup_id)))?;
        
        let backup_path = Path::new(&backup.backup_path);
        let original_path = Path::new(&backup.original_path);
        
        if !backup_path.exists() {
            return Err(AppError::FileSystem(format!("Backup file not found: {}", backup.backup_path)));
        }
        
        // Create parent directory if it doesn't exist
        if let Some(parent) = original_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::FileSystem(format!("Failed to create parent directory: {}", e)))?;
        }
        
        // Restore file
        fs::copy(backup_path, original_path)
            .map_err(|e| AppError::FileSystem(format!("Failed to restore file: {}", e)))?;
        
        // Record the restore operation
        let operation = FileOperation {
            operation_type: OperationType::Restore,
            file_path: backup.original_path.clone(),
            timestamp: Utc::now(),
            success: true,
            error: None,
            details: {
                let mut details = HashMap::new();
                details.insert("backup_id".to_string(), backup_id.to_string());
                details.insert("backup_path".to_string(), backup.backup_path.clone());
                details
            },
        };
        
        self.add_file_operation(operation).await?;
        
        Ok(backup.original_path.clone())
    }

    pub async fn get_backups(&self) -> Result<Vec<BackupInfo>, AppError> {
        self.load_backups().await
    }

    pub async fn delete_backup(&self, backup_id: &str) -> Result<bool, AppError> {
        let mut backups = self.load_backups().await?;
        
        if let Some(pos) = backups.iter().position(|b| b.id == backup_id) {
            let backup = backups.remove(pos);
            
            // Remove the backup file
            let _ = fs::remove_file(&backup.backup_path);
            
            self.save_backups(&backups).await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub async fn cleanup_old_backups(&self, older_than_days: u32) -> Result<usize, AppError> {
        let mut backups = self.load_backups().await?;
        let cutoff = Utc::now() - chrono::Duration::days(older_than_days as i64);
        let initial_count = backups.len();
        
        // Remove old backup files
        for backup in backups.iter().filter(|b| b.timestamp < cutoff) {
            let _ = fs::remove_file(&backup.backup_path);
        }
        
        // Keep only recent backups
        backups.retain(|b| b.timestamp >= cutoff);
        
        self.save_backups(&backups).await?;
        Ok(initial_count - backups.len())
    }

    // File Operations Management
    pub async fn add_file_operation(&self, operation: FileOperation) -> Result<(), AppError> {
        let mut operations = self.load_file_operations().await?;
        operations.insert(0, operation);
        
        // Keep only the last 500 operations
        if operations.len() > 500 {
            operations.truncate(500);
        }
        
        self.save_file_operations(&operations).await
    }

    pub async fn get_file_operations(&self, limit: Option<usize>) -> Result<Vec<FileOperation>, AppError> {
        let mut operations = self.load_file_operations().await?;
        
        if let Some(limit) = limit {
            operations.truncate(limit);
        }
        
        Ok(operations)
    }

    // Statistics
    pub async fn get_statistics(&self) -> Result<HistoryStatistics, AppError> {
        let records = self.load_history_records().await?;
        
        if records.is_empty() {
            return Ok(HistoryStatistics {
                total_records: 0,
                successful_operations: 0,
                failed_operations: 0,
                success_rate: 0.0,
                operations_by_type: HashMap::new(),
                total_images_processed: 0,
                total_size_processed: 0,
                average_duration: 0.0,
                oldest_record: None,
                newest_record: None,
            });
        }
        
        let total_records = records.len();
        let successful_operations = records.iter().filter(|r| r.success).count();
        let failed_operations = total_records - successful_operations;
        let success_rate = (successful_operations as f64 / total_records as f64) * 100.0;
        
        let mut operations_by_type = HashMap::new();
        for record in &records {
            let op_name = match record.operation {
                OperationType::Upload => "upload",
                OperationType::Replace => "replace",
                OperationType::Restore => "restore",
                OperationType::Backup => "backup",
                OperationType::Scan => "scan",
            };
            *operations_by_type.entry(op_name.to_string()).or_insert(0) += 1;
        }
        
        let total_images_processed = records.iter().map(|r| r.image_count).sum();
        let total_size_processed = records.iter().filter_map(|r| r.total_size).sum();
        
        let durations: Vec<u64> = records.iter().filter_map(|r| r.duration).collect();
        let average_duration = if durations.is_empty() {
            0.0
        } else {
            durations.iter().sum::<u64>() as f64 / durations.len() as f64
        };
        
        let oldest_record = records.iter().map(|r| r.timestamp).min();
        let newest_record = records.iter().map(|r| r.timestamp).max();
        
        Ok(HistoryStatistics {
            total_records,
            successful_operations,
            failed_operations,
            success_rate,
            operations_by_type,
            total_images_processed,
            total_size_processed,
            average_duration,
            oldest_record,
            newest_record,
        })
    }

    // Private helper methods
    async fn load_history_records(&self) -> Result<Vec<HistoryRecord>, AppError> {
        if !self.history_file.exists() {
            return Ok(Vec::new());
        }
        
        let content = fs::read_to_string(&self.history_file)
            .map_err(|e| AppError::FileSystem(format!("Failed to read history file: {}", e)))?;
        
        let records: Vec<HistoryRecord> = serde_json::from_str(&content)
            .map_err(AppError::Serialization)?;
        
        Ok(records)
    }

    async fn save_history_records(&self, records: &[HistoryRecord]) -> Result<(), AppError> {
        let content = serde_json::to_string_pretty(records)
            .map_err(AppError::Serialization)?;
        
        fs::write(&self.history_file, content)
            .map_err(|e| AppError::FileSystem(format!("Failed to write history file: {}", e)))?;
        
        Ok(())
    }

    async fn load_backups(&self) -> Result<Vec<BackupInfo>, AppError> {
        if !self.backups_file.exists() {
            return Ok(Vec::new());
        }
        
        let content = fs::read_to_string(&self.backups_file)
            .map_err(|e| AppError::FileSystem(format!("Failed to read backups file: {}", e)))?;
        
        let backups: Vec<BackupInfo> = serde_json::from_str(&content)
            .map_err(AppError::Serialization)?;
        
        Ok(backups)
    }

    async fn save_backups(&self, backups: &[BackupInfo]) -> Result<(), AppError> {
        let content = serde_json::to_string_pretty(backups)
            .map_err(AppError::Serialization)?;
        
        fs::write(&self.backups_file, content)
            .map_err(|e| AppError::FileSystem(format!("Failed to write backups file: {}", e)))?;
        
        Ok(())
    }

    async fn load_file_operations(&self) -> Result<Vec<FileOperation>, AppError> {
        if !self.operations_file.exists() {
            return Ok(Vec::new());
        }
        
        let content = fs::read_to_string(&self.operations_file)
            .map_err(|e| AppError::FileSystem(format!("Failed to read operations file: {}", e)))?;
        
        let operations: Vec<FileOperation> = serde_json::from_str(&content)
            .map_err(AppError::Serialization)?;
        
        Ok(operations)
    }

    async fn save_file_operations(&self, operations: &[FileOperation]) -> Result<(), AppError> {
        let content = serde_json::to_string_pretty(operations)
            .map_err(AppError::Serialization)?;
        
        fs::write(&self.operations_file, content)
            .map_err(|e| AppError::FileSystem(format!("Failed to write operations file: {}", e)))?;
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs;

    fn create_test_service() -> (HistoryService, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let data_dir = temp_dir.path().join("data");
        let backup_dir = data_dir.join("backups");
        
        fs::create_dir_all(&data_dir).unwrap();
        fs::create_dir_all(&backup_dir).unwrap();
        
        let service = HistoryService {
            data_dir: data_dir.clone(),
            backup_dir,
            history_file: data_dir.join("history.json"),
            backups_file: data_dir.join("backups.json"),
            operations_file: data_dir.join("operations.json"),
        };
        
        (service, temp_dir)
    }

    #[tokio::test]
    async fn test_add_and_get_history_record() {
        let (service, _temp_dir) = create_test_service();
        
        let record = HistoryRecord {
            id: String::new(),
            timestamp: Utc::now(),
            operation: OperationType::Upload,
            files: vec!["test.md".to_string()],
            image_count: 5,
            success: true,
            backup_path: None,
            duration: Some(1000),
            total_size: Some(2048),
            error_message: None,
            metadata: HashMap::new(),
        };
        
        let id = service.add_history_record(record.clone()).await.unwrap();
        assert!(!id.is_empty());
        
        let retrieved = service.get_history_record(&id).await.unwrap();
        assert!(retrieved.is_some());
        
        let retrieved_record = retrieved.unwrap();
        assert_eq!(retrieved_record.operation, OperationType::Upload);
        assert_eq!(retrieved_record.files, vec!["test.md".to_string()]);
        assert_eq!(retrieved_record.image_count, 5);
        assert!(retrieved_record.success);
    }

    #[tokio::test]
    async fn test_create_and_restore_backup() {
        let (service, temp_dir) = create_test_service();
        
        // Create a test file
        let test_file = temp_dir.path().join("test.md");
        let test_content = "# Test\n![image](./image.png)";
        fs::write(&test_file, test_content).unwrap();
        
        // Create backup
        let backup_info = service.create_backup(test_file.to_str().unwrap()).await.unwrap();
        assert!(!backup_info.id.is_empty());
        assert!(Path::new(&backup_info.backup_path).exists());
        
        // Modify original file
        fs::write(&test_file, "# Modified").unwrap();
        
        // Restore from backup
        let restored_path = service.restore_from_backup(&backup_info.id).await.unwrap();
        assert_eq!(restored_path, test_file.to_str().unwrap());
        
        // Verify content is restored
        let restored_content = fs::read_to_string(&test_file).unwrap();
        assert_eq!(restored_content, test_content);
    }

    #[tokio::test]
    async fn test_statistics() {
        let (service, _temp_dir) = create_test_service();
        
        // Add some test records
        for i in 0..10 {
            let record = HistoryRecord {
                id: String::new(),
                timestamp: Utc::now(),
                operation: if i % 2 == 0 { OperationType::Upload } else { OperationType::Replace },
                files: vec![format!("test{}.md", i)],
                image_count: i + 1,
                success: i < 8, // 8 successful, 2 failed
                backup_path: None,
                duration: Some(((i + 1) * 100) as u64),
                total_size: Some(((i + 1) * 1024) as u64),
                error_message: if i >= 8 { Some("Test error".to_string()) } else { None },
                metadata: HashMap::new(),
            };
            
            service.add_history_record(record).await.unwrap();
        }
        
        let stats = service.get_statistics().await.unwrap();
        assert_eq!(stats.total_records, 10);
        assert_eq!(stats.successful_operations, 8);
        assert_eq!(stats.failed_operations, 2);
        assert_eq!(stats.success_rate, 80.0);
        assert_eq!(stats.total_images_processed, 55); // 1+2+3+...+10
    }
}