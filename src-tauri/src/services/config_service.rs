use crate::models::{OSSConfig, ConfigValidation, OSSConnectionTest, OSSProvider};
use crate::utils::{Result, AppError};
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};

const CONFIG_VERSION: u32 = 1;
const CONFIG_FILE_NAME: &str = "config.json";
const CONFIG_DIR_NAME: &str = "imgtoss";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EncryptedConfig {
    version: u32,
    encrypted_data: String,
    nonce: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ConfigData {
    version: u32,
    oss_config: Option<OSSConfig>,
    created_at: std::time::SystemTime,
    updated_at: std::time::SystemTime,
}

pub struct ConfigService {
    config_dir: PathBuf,
    encryption_key: [u8; 32],
}

impl ConfigService {
    pub fn new() -> Result<Self> {
        let config_dir = Self::get_config_dir()?;
        let encryption_key = Self::derive_encryption_key()?;
        
        // Ensure config directory exists
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)
                .map_err(|e| AppError::Configuration(format!("Failed to create config directory: {}", e)))?;
        }

        Ok(Self {
            config_dir,
            encryption_key,
        })
    }

    pub fn new_with_dir(config_dir: PathBuf) -> Result<Self> {
        let encryption_key = Self::derive_encryption_key()?;
        
        // Ensure config directory exists
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)
                .map_err(|e| AppError::Configuration(format!("Failed to create config directory: {}", e)))?;
        }

        Ok(Self {
            config_dir,
            encryption_key,
        })
    }

    pub async fn save_config(&self, config: &OSSConfig) -> Result<()> {
        // Validate config before saving
        let validation = self.validate_config(config).await?;
        if !validation.valid {
            return Err(AppError::Configuration(format!(
                "Invalid configuration: {}",
                validation.errors.join(", ")
            )));
        }

        let config_data = ConfigData {
            version: CONFIG_VERSION,
            oss_config: Some(config.clone()),
            created_at: std::time::SystemTime::now(),
            updated_at: std::time::SystemTime::now(),
        };

        let serialized = serde_json::to_string(&config_data)?;
        let encrypted_data = self.encrypt_sensitive_data(&serialized)?;
        
        let encrypted_config = EncryptedConfig {
            version: CONFIG_VERSION,
            encrypted_data,
            nonce: String::new(), // Will be set in encrypt_sensitive_data
        };

        let config_path = self.get_config_file_path();
        let config_json = serde_json::to_string_pretty(&encrypted_config)?;

        fs::write(&config_path, config_json)
            .map_err(|e| AppError::Configuration(format!("Failed to save config: {}", e)))?;

        Ok(())
    }

    pub async fn load_config(&self) -> Result<Option<OSSConfig>> {
        let config_path = self.get_config_file_path();
        
        if !config_path.exists() {
            return Ok(None);
        }

        let config_content = fs::read_to_string(&config_path)
            .map_err(|e| AppError::Configuration(format!("Failed to read config: {}", e)))?;

        let encrypted_config: EncryptedConfig = serde_json::from_str(&config_content)?;

        // Handle version migration if needed
        if encrypted_config.version != CONFIG_VERSION {
            return self.migrate_config(encrypted_config).await;
        }

        let decrypted_data = self.decrypt_sensitive_data(&encrypted_config.encrypted_data)?;
        let config_data: ConfigData = serde_json::from_str(&decrypted_data)?;

        Ok(config_data.oss_config)
    }

    pub fn encrypt_sensitive_data(&self, data: &str) -> Result<String> {
        let cipher = Aes256Gcm::new_from_slice(&self.encryption_key)
            .map_err(|e| AppError::Encryption(format!("Failed to create cipher: {}", e)))?;

        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = cipher
            .encrypt(&nonce, data.as_bytes())
            .map_err(|e| AppError::Encryption(format!("Encryption failed: {}", e)))?;

        // Combine nonce and ciphertext for storage
        let mut encrypted_data = nonce.to_vec();
        encrypted_data.extend_from_slice(&ciphertext);

        Ok(general_purpose::STANDARD.encode(encrypted_data))
    }

    pub fn decrypt_sensitive_data(&self, encrypted: &str) -> Result<String> {
        let encrypted_data = general_purpose::STANDARD.decode(encrypted)
            .map_err(|e| AppError::Encryption(format!("Invalid base64 data: {}", e)))?;

        if encrypted_data.len() < 12 {
            return Err(AppError::Encryption("Invalid encrypted data length".to_string()));
        }

        let (nonce_bytes, ciphertext) = encrypted_data.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);

        let cipher = Aes256Gcm::new_from_slice(&self.encryption_key)
            .map_err(|e| AppError::Encryption(format!("Failed to create cipher: {}", e)))?;

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| AppError::Encryption(format!("Decryption failed: {}", e)))?;

        String::from_utf8(plaintext)
            .map_err(|e| AppError::Encryption(format!("Invalid UTF-8 data: {}", e)))
    }

    pub async fn validate_config(&self, config: &OSSConfig) -> Result<ConfigValidation> {
        let mut errors = Vec::new();

        // Validate required fields
        if config.endpoint.trim().is_empty() {
            errors.push("Endpoint is required".to_string());
        }

        if config.access_key_id.trim().is_empty() {
            errors.push("Access Key ID is required".to_string());
        }

        if config.access_key_secret.trim().is_empty() {
            errors.push("Access Key Secret is required".to_string());
        }

        if config.bucket.trim().is_empty() {
            errors.push("Bucket name is required".to_string());
        }

        if config.region.trim().is_empty() {
            errors.push("Region is required".to_string());
        }

        // Validate path template
        if config.path_template.trim().is_empty() {
            errors.push("Path template is required".to_string());
        }

        // Validate compression quality
        if config.compression_quality > 100 {
            errors.push("Compression quality must be between 0 and 100".to_string());
        }

        // Validate endpoint URL format
        if !config.endpoint.starts_with("http://") && !config.endpoint.starts_with("https://") {
            errors.push("Endpoint must be a valid URL starting with http:// or https://".to_string());
        }

        // Test connection if basic validation passes
        let connection_test = if errors.is_empty() {
            Some(self.test_oss_connection(config).await?)
        } else {
            None
        };

        Ok(ConfigValidation {
            valid: errors.is_empty() && connection_test.as_ref().map_or(false, |t| t.success),
            errors,
            connection_test,
        })
    }

    pub async fn test_oss_connection(&self, config: &OSSConfig) -> Result<OSSConnectionTest> {
        let start_time = Instant::now();
        
        // Create a simple test request based on the OSS provider
        let test_result = match config.provider {
            OSSProvider::Aliyun => self.test_aliyun_connection(config).await,
            OSSProvider::Tencent => self.test_tencent_connection(config).await,
            OSSProvider::AWS => self.test_aws_connection(config).await,
            OSSProvider::Custom => self.test_custom_connection(config).await,
        };

        let latency = start_time.elapsed().as_millis() as u64;

        match test_result {
            Ok(_) => Ok(OSSConnectionTest {
                success: true,
                error: None,
                latency: Some(latency),
            }),
            Err(e) => Ok(OSSConnectionTest {
                success: false,
                error: Some(e.to_string()),
                latency: Some(latency),
            }),
        }
    }

    pub async fn delete_config(&self) -> Result<()> {
        let config_path = self.get_config_file_path();
        if config_path.exists() {
            fs::remove_file(&config_path)
                .map_err(|e| AppError::Configuration(format!("Failed to delete config: {}", e)))?;
        }
        Ok(())
    }

    pub async fn backup_config(&self) -> Result<PathBuf> {
        let config_path = self.get_config_file_path();
        if !config_path.exists() {
            return Err(AppError::Configuration("No config file to backup".to_string()));
        }

        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let backup_name = format!("config_backup_{}.json", timestamp);
        let backup_path = self.config_dir.join(backup_name);

        fs::copy(&config_path, &backup_path)
            .map_err(|e| AppError::Configuration(format!("Failed to backup config: {}", e)))?;

        Ok(backup_path)
    }

    // Private helper methods

    fn get_config_dir() -> Result<PathBuf> {
        let config_dir = if cfg!(target_os = "windows") {
            dirs::config_dir()
                .ok_or_else(|| AppError::Configuration("Failed to get config directory".to_string()))?
                .join(CONFIG_DIR_NAME)
        } else if cfg!(target_os = "macos") {
            dirs::config_dir()
                .ok_or_else(|| AppError::Configuration("Failed to get config directory".to_string()))?
                .join(CONFIG_DIR_NAME)
        } else {
            dirs::config_dir()
                .ok_or_else(|| AppError::Configuration("Failed to get config directory".to_string()))?
                .join(CONFIG_DIR_NAME)
        };

        Ok(config_dir)
    }

    fn get_config_file_path(&self) -> PathBuf {
        self.config_dir.join(CONFIG_FILE_NAME)
    }

    fn derive_encryption_key() -> Result<[u8; 32]> {
        // In a real application, you might want to derive this from user input or system info
        // For now, we'll use a deterministic key based on system information
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        
        // Use system-specific information to generate a consistent key
        if let Ok(hostname) = std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")) {
            hostname.hash(&mut hasher);
        }
        
        if let Ok(user) = std::env::var("USER").or_else(|_| std::env::var("USERNAME")) {
            user.hash(&mut hasher);
        }

        // Add a static salt to ensure uniqueness for this application
        "imgtoss-salt-2024".hash(&mut hasher);

        let hash = hasher.finish();
        
        // Convert hash to 32-byte key
        let mut key = [0u8; 32];
        let hash_bytes = hash.to_le_bytes();
        for i in 0..4 {
            let start = i * 8;
            key[start..start + 8].copy_from_slice(&hash_bytes);
        }

        Ok(key)
    }

    async fn migrate_config(&self, old_config: EncryptedConfig) -> Result<Option<OSSConfig>> {
        // For now, we only support version 1, so no migration is needed
        // In the future, this method would handle version upgrades
        match old_config.version {
            1 => {
                // Current version, no migration needed
                let decrypted_data = self.decrypt_sensitive_data(&old_config.encrypted_data)?;
                let config_data: ConfigData = serde_json::from_str(&decrypted_data)?;
                Ok(config_data.oss_config)
            }
            _ => Err(AppError::Configuration(format!(
                "Unsupported config version: {}",
                old_config.version
            ))),
        }
    }

    async fn test_aliyun_connection(&self, config: &OSSConfig) -> Result<()> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()?;

        let url = format!("{}/{}", config.endpoint.trim_end_matches('/'), config.bucket);
        
        let response = client
            .head(&url)
            .timeout(Duration::from_secs(5))
            .send()
            .await?;

        if response.status().is_success() || response.status().as_u16() == 403 {
            // 403 is acceptable as it means the bucket exists but we don't have list permissions
            Ok(())
        } else {
            Err(AppError::OSSOperation(format!(
                "Connection test failed with status: {}",
                response.status()
            )))
        }
    }

    async fn test_tencent_connection(&self, config: &OSSConfig) -> Result<()> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()?;

        let url = format!("https://{}.cos.{}.myqcloud.com", config.bucket, config.region);
        
        let response = client
            .head(&url)
            .timeout(Duration::from_secs(5))
            .send()
            .await?;

        if response.status().is_success() || response.status().as_u16() == 403 {
            Ok(())
        } else {
            Err(AppError::OSSOperation(format!(
                "Connection test failed with status: {}",
                response.status()
            )))
        }
    }

    async fn test_aws_connection(&self, config: &OSSConfig) -> Result<()> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()?;

        let url = if config.region == "us-east-1" {
            format!("https://{}.s3.amazonaws.com", config.bucket)
        } else {
            format!("https://{}.s3.{}.amazonaws.com", config.bucket, config.region)
        };
        
        let response = client
            .head(&url)
            .timeout(Duration::from_secs(5))
            .send()
            .await?;

        if response.status().is_success() || response.status().as_u16() == 403 {
            Ok(())
        } else {
            Err(AppError::OSSOperation(format!(
                "Connection test failed with status: {}",
                response.status()
            )))
        }
    }

    async fn test_custom_connection(&self, config: &OSSConfig) -> Result<()> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()?;

        let url = format!("{}/{}", config.endpoint.trim_end_matches('/'), config.bucket);
        
        let response = client
            .head(&url)
            .timeout(Duration::from_secs(5))
            .send()
            .await?;

        if response.status().is_success() || response.status().as_u16() == 403 {
            Ok(())
        } else {
            Err(AppError::OSSOperation(format!(
                "Connection test failed with status: {}",
                response.status()
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::time::SystemTime;

    fn create_test_config() -> OSSConfig {
        OSSConfig {
            provider: OSSProvider::Aliyun,
            endpoint: "https://oss-cn-hangzhou.aliyuncs.com".to_string(),
            access_key_id: "test_access_key".to_string(),
            access_key_secret: "test_secret_key".to_string(),
            bucket: "test-bucket".to_string(),
            region: "cn-hangzhou".to_string(),
            path_template: "images/{date}/{filename}".to_string(),
            cdn_domain: Some("https://cdn.example.com".to_string()),
            compression_enabled: true,
            compression_quality: 80,
        }
    }

    fn create_invalid_config() -> OSSConfig {
        OSSConfig {
            provider: OSSProvider::Aliyun,
            endpoint: "".to_string(), // Invalid: empty endpoint
            access_key_id: "".to_string(), // Invalid: empty access key
            access_key_secret: "test_secret_key".to_string(),
            bucket: "test-bucket".to_string(),
            region: "cn-hangzhou".to_string(),
            path_template: "".to_string(), // Invalid: empty path template
            cdn_domain: None,
            compression_enabled: true,
            compression_quality: 150, // Invalid: > 100
        }
    }

    async fn create_test_service() -> (ConfigService, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let service = ConfigService::new_with_dir(temp_dir.path().to_path_buf()).unwrap();
        (service, temp_dir)
    }

    #[tokio::test]
    async fn test_new_config_service() {
        let (service, _temp_dir) = create_test_service().await;
        assert!(service.config_dir.exists());
    }

    #[tokio::test]
    async fn test_encrypt_decrypt_data() {
        let (service, _temp_dir) = create_test_service().await;
        let test_data = "This is sensitive configuration data";

        let encrypted = service.encrypt_sensitive_data(test_data).unwrap();
        assert_ne!(encrypted, test_data);
        assert!(!encrypted.is_empty());

        let decrypted = service.decrypt_sensitive_data(&encrypted).unwrap();
        assert_eq!(decrypted, test_data);
    }

    #[tokio::test]
    async fn test_encrypt_decrypt_empty_data() {
        let (service, _temp_dir) = create_test_service().await;
        let test_data = "";

        let encrypted = service.encrypt_sensitive_data(test_data).unwrap();
        let decrypted = service.decrypt_sensitive_data(&encrypted).unwrap();
        assert_eq!(decrypted, test_data);
    }

    #[tokio::test]
    async fn test_decrypt_invalid_data() {
        let (service, _temp_dir) = create_test_service().await;
        
        // Test with invalid base64
        let result = service.decrypt_sensitive_data("invalid_base64!");
        assert!(result.is_err());

        // Test with too short data
        let result = service.decrypt_sensitive_data("dGVzdA=="); // "test" in base64, too short
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_save_and_load_config() {
        let (service, _temp_dir) = create_test_service().await;
        let test_config = create_test_config();

        // Initially no config should exist
        let loaded = service.load_config().await.unwrap();
        assert!(loaded.is_none());

        // Save config will fail because we can't actually connect to OSS in tests
        // but we can test the validation part
        let result = service.save_config(&test_config).await;
        assert!(result.is_err());

        // Test with a config that passes basic validation but fails connection
        let mut valid_config = test_config.clone();
        valid_config.endpoint = "https://example.com".to_string();
        
        // We expect this to fail due to connection test, but validation should pass
        let validation = service.validate_config(&valid_config).await.unwrap();
        assert!(validation.errors.is_empty()); // Basic validation should pass
        // Connection test will fail, so overall validation will be false
    }

    #[tokio::test]
    async fn test_validate_config_valid() {
        let (service, _temp_dir) = create_test_service().await;
        let test_config = create_test_config();

        let validation = service.validate_config(&test_config).await.unwrap();
        
        // Basic validation should pass (connection test may succeed or fail depending on network)
        assert!(validation.errors.is_empty());
        assert!(validation.connection_test.is_some());
        
        let connection_test = validation.connection_test.unwrap();
        // Don't assert on success/failure as it depends on network connectivity
        assert!(connection_test.latency.is_some());
    }

    #[tokio::test]
    async fn test_validate_config_invalid() {
        let (service, _temp_dir) = create_test_service().await;
        let invalid_config = create_invalid_config();

        let validation = service.validate_config(&invalid_config).await.unwrap();
        
        assert!(!validation.valid);
        assert!(!validation.errors.is_empty());
        
        // Check that all expected errors are present
        let error_messages = validation.errors.join(" ");
        assert!(error_messages.contains("Endpoint is required"));
        assert!(error_messages.contains("Access Key ID is required"));
        assert!(error_messages.contains("Path template is required"));
        assert!(error_messages.contains("Compression quality must be between 0 and 100"));
        assert!(error_messages.contains("Endpoint must be a valid URL"));
    }

    #[tokio::test]
    async fn test_validate_config_edge_cases() {
        let (service, _temp_dir) = create_test_service().await;
        
        // Test with whitespace-only fields
        let mut config = create_test_config();
        config.endpoint = "   ".to_string();
        config.access_key_id = "\t\n".to_string();
        
        let validation = service.validate_config(&config).await.unwrap();
        assert!(!validation.valid);
        assert!(validation.errors.len() >= 2);
    }

    #[tokio::test]
    async fn test_delete_config() {
        let (service, _temp_dir) = create_test_service().await;
        
        // Delete non-existent config should succeed
        let result = service.delete_config().await;
        assert!(result.is_ok());

        // Create a dummy config file
        let config_path = service.get_config_file_path();
        fs::write(&config_path, "dummy content").unwrap();
        assert!(config_path.exists());

        // Delete should succeed
        let result = service.delete_config().await;
        assert!(result.is_ok());
        assert!(!config_path.exists());
    }

    #[tokio::test]
    async fn test_backup_config() {
        let (service, _temp_dir) = create_test_service().await;
        
        // Backup non-existent config should fail
        let result = service.backup_config().await;
        assert!(result.is_err());

        // Create a dummy config file
        let config_path = service.get_config_file_path();
        let test_content = "test config content";
        fs::write(&config_path, test_content).unwrap();

        // Backup should succeed
        let backup_path = service.backup_config().await.unwrap();
        assert!(backup_path.exists());
        
        let backup_content = fs::read_to_string(&backup_path).unwrap();
        assert_eq!(backup_content, test_content);
        
        // Backup filename should contain timestamp
        let backup_name = backup_path.file_name().unwrap().to_str().unwrap();
        assert!(backup_name.starts_with("config_backup_"));
        assert!(backup_name.ends_with(".json"));
    }

    #[tokio::test]
    async fn test_config_version_migration() {
        let (service, _temp_dir) = create_test_service().await;
        
        // Test with current version (should not migrate)
        let current_config = EncryptedConfig {
            version: CONFIG_VERSION,
            encrypted_data: service.encrypt_sensitive_data(
                &serde_json::to_string(&ConfigData {
                    version: CONFIG_VERSION,
                    oss_config: Some(create_test_config()),
                    created_at: SystemTime::now(),
                    updated_at: SystemTime::now(),
                }).unwrap()
            ).unwrap(),
            nonce: String::new(),
        };

        let result = service.migrate_config(current_config).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_some());

        // Test with unsupported version
        let unsupported_config = EncryptedConfig {
            version: 999,
            encrypted_data: "dummy".to_string(),
            nonce: String::new(),
        };

        let result = service.migrate_config(unsupported_config).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_different_oss_providers() {
        let (service, _temp_dir) = create_test_service().await;
        
        let providers = vec![
            OSSProvider::Aliyun,
            OSSProvider::Tencent,
            OSSProvider::AWS,
            OSSProvider::Custom,
        ];

        for provider in providers {
            let mut config = create_test_config();
            config.provider = provider;
            
            let connection_test = service.test_oss_connection(&config).await.unwrap();
            // Connection may succeed or fail depending on network, but should not panic
            assert!(connection_test.latency.is_some());
        }
    }

    #[tokio::test]
    async fn test_aws_region_handling() {
        let (service, _temp_dir) = create_test_service().await;
        
        // Test us-east-1 (special case)
        let mut config = create_test_config();
        config.provider = OSSProvider::AWS;
        config.region = "us-east-1".to_string();
        config.endpoint = "https://s3.amazonaws.com".to_string();
        
        let connection_test = service.test_oss_connection(&config).await.unwrap();
        assert!(connection_test.latency.is_some()); // Should have latency regardless of success

        // Test other regions
        config.region = "us-west-2".to_string();
        let connection_test = service.test_oss_connection(&config).await.unwrap();
        assert!(connection_test.latency.is_some()); // Should have latency regardless of success
    }

    #[tokio::test]
    async fn test_encryption_key_consistency() {
        // Test that the same key is generated consistently
        let key1 = ConfigService::derive_encryption_key().unwrap();
        let key2 = ConfigService::derive_encryption_key().unwrap();
        assert_eq!(key1, key2);
    }

    #[tokio::test]
    async fn test_config_file_path() {
        let (service, _temp_dir) = create_test_service().await;
        let config_path = service.get_config_file_path();
        
        assert!(config_path.ends_with(CONFIG_FILE_NAME));
        assert!(config_path.parent().unwrap().exists());
    }
}