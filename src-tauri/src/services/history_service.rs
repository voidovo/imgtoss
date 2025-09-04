use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::utils::error::AppError;
use crate::models::{UploadHistoryRecord, UploadMode};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryQuery {
    pub upload_mode: Option<UploadMode>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryStatistics {
    pub total_records: usize,
    pub total_images_processed: usize,
    pub total_size_processed: u64,
    pub upload_modes: std::collections::HashMap<String, usize>,
    pub oldest_record: Option<DateTime<Utc>>,
    pub newest_record: Option<DateTime<Utc>>,
}

pub struct HistoryService {
    data_dir: PathBuf,
    upload_history_file: PathBuf,
}

impl HistoryService {
    pub fn new() -> Result<Self, AppError> {
        let data_dir = Self::get_data_directory()?;
        
        // Ensure data directory exists
        fs::create_dir_all(&data_dir)
            .map_err(|e| AppError::FileSystem(format!("Failed to create data directory: {}", e)))?;

        let upload_history_file = data_dir.join("upload_history.json");

        Ok(Self {
            data_dir,
            upload_history_file,
        })
    }

    fn get_data_directory() -> Result<PathBuf, AppError> {
        let app_data_dir = dirs::data_dir()
            .ok_or_else(|| AppError::Configuration("Could not determine data directory".to_string()))?
            .join("imgtoss");
        
        Ok(app_data_dir)
    }

    // 添加上传历史记录
    pub async fn add_upload_record(&self, mut record: UploadHistoryRecord) -> Result<String, AppError> {
        if record.id.is_empty() {
            record.id = Uuid::new_v4().to_string();
        }
        
        let mut records = self.load_upload_records().await?;
        records.insert(0, record.clone());
        
        // Keep only the last 1000 records to prevent excessive storage
        if records.len() > 1000 {
            records.truncate(1000);
        }
        
        self.save_upload_records(&records).await?;
        Ok(record.id)
    }

    // 批量添加上传历史记录
    pub async fn add_batch_upload_records(&self, mut records: Vec<UploadHistoryRecord>) -> Result<Vec<String>, AppError> {
        let mut ids = Vec::new();
        for record in &mut records {
            if record.id.is_empty() {
                record.id = Uuid::new_v4().to_string();
            }
            ids.push(record.id.clone());
        }
        
        let mut existing_records = self.load_upload_records().await?;
        
        // Insert new records at the beginning
        for record in records.into_iter().rev() {
            existing_records.insert(0, record);
        }
        
        // Keep only the last 1000 records
        if existing_records.len() > 1000 {
            existing_records.truncate(1000);
        }
        
        self.save_upload_records(&existing_records).await?;
        Ok(ids)
    }

    // 获取上传历史记录
    pub async fn get_upload_records(&self, query: Option<HistoryQuery>) -> Result<Vec<UploadHistoryRecord>, AppError> {
        let mut records = self.load_upload_records().await?;
        
        if let Some(q) = query {
            // Apply filters
            if let Some(upload_mode) = q.upload_mode {
                records.retain(|r| r.upload_mode == upload_mode);
            }
            
            if let Some(start) = q.start_date {
                records.retain(|r| r.timestamp >= start);
            }
            
            if let Some(end) = q.end_date {
                records.retain(|r| r.timestamp <= end);
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

    // 根据ID获取单个记录
    pub async fn get_upload_record(&self, id: &str) -> Result<Option<UploadHistoryRecord>, AppError> {
        let records = self.load_upload_records().await?;
        Ok(records.into_iter().find(|r| r.id == id))
    }

    // 删除上传记录
    pub async fn delete_upload_record(&self, id: &str) -> Result<bool, AppError> {
        let mut records = self.load_upload_records().await?;
        let initial_len = records.len();
        records.retain(|r| r.id != id);
        
        if records.len() < initial_len {
            self.save_upload_records(&records).await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    // 清空历史记录
    pub async fn clear_upload_history(&self, upload_mode: Option<UploadMode>, older_than_days: Option<u32>) -> Result<usize, AppError> {
        let mut records = self.load_upload_records().await?;
        let initial_count = records.len();
        
        if let Some(days) = older_than_days {
            let cutoff = Utc::now() - chrono::Duration::days(days as i64);
            records.retain(|r| {
                let should_keep_by_date = r.timestamp > cutoff;
                let should_keep_by_mode = upload_mode.as_ref().map_or(true, |mode| r.upload_mode != *mode);
                should_keep_by_date || should_keep_by_mode
            });
        } else if let Some(mode) = upload_mode {
            records.retain(|r| r.upload_mode != mode);
        } else {
            records.clear();
        }
        
        let deleted_count = initial_count - records.len();
        if deleted_count > 0 {
            self.save_upload_records(&records).await?;
        }
        
        Ok(deleted_count)
    }

    // 根据checksum查找重复记录
    pub async fn find_duplicate_by_checksum(&self, checksum: &str) -> Result<Option<UploadHistoryRecord>, AppError> {
        let records = self.load_upload_records().await?;
        
        for record in records {
            if record.checksum == checksum {
                return Ok(Some(record));
            }
        }
        
        Ok(None)
    }

    // 获取统计信息
    pub async fn get_statistics(&self) -> Result<HistoryStatistics, AppError> {
        let records = self.load_upload_records().await?;
        
        if records.is_empty() {
            return Ok(HistoryStatistics {
                total_records: 0,
                total_images_processed: 0,
                total_size_processed: 0,
                upload_modes: std::collections::HashMap::new(),
                oldest_record: None,
                newest_record: None,
            });
        }
        
        let total_records = records.len();
        let total_images_processed = records.len(); // 每条记录代表一张图片
        let total_size_processed = records.iter().map(|r| r.file_size).sum();
        
        let mut upload_modes = std::collections::HashMap::new();
        for record in &records {
            let mode_name = match record.upload_mode {
                UploadMode::ImageUpload => "image_upload",
                UploadMode::ArticleUpload => "article_upload",
            };
            *upload_modes.entry(mode_name.to_string()).or_insert(0) += 1;
        }
        
        let oldest_record = records.iter().map(|r| r.timestamp).min();
        let newest_record = records.iter().map(|r| r.timestamp).max();
        
        Ok(HistoryStatistics {
            total_records,
            total_images_processed,
            total_size_processed,
            upload_modes,
            oldest_record,
            newest_record,
        })
    }

    // 私有辅助方法：加载上传记录
    async fn load_upload_records(&self) -> Result<Vec<UploadHistoryRecord>, AppError> {
        if !self.upload_history_file.exists() {
            return Ok(Vec::new());
        }
        
        let content = fs::read_to_string(&self.upload_history_file)
            .map_err(|e| AppError::FileSystem(format!("Failed to read upload history file: {}", e)))?;
        
        let records: Vec<UploadHistoryRecord> = serde_json::from_str(&content)
            .map_err(AppError::Serialization)?;
        
        Ok(records)
    }

    // 私有辅助方法：保存上传记录
    async fn save_upload_records(&self, records: &[UploadHistoryRecord]) -> Result<(), AppError> {
        let content = serde_json::to_string_pretty(records)
            .map_err(AppError::Serialization)?;
        
        fs::write(&self.upload_history_file, content)
            .map_err(|e| AppError::FileSystem(format!("Failed to write upload history file: {}", e)))?;
        
        Ok(())
    }
}