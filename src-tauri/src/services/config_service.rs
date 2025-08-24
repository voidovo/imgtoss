use crate::models::{OSSConfig, ConfigValidation, OSSConnectionTest, OSSProvider};
use crate::utils::{Result, AppError};
use crate::services::oss_service::OSSService;
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{Engine as _, engine::general_purpose};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const CONFIG_VERSION: u32 = 1;
const CONFIG_FILE_NAME: &str = "config.json";
const CACHE_FILE_NAME: &str = "connection_cache.json";
const CONFIG_DIR_NAME: &str = "imgtoss";
const CACHE_EXPIRY_SECONDS: u64 = 300; // 5 minutes

// OSS Connection Test Cache
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedTestResult {
    config_hash: String,
    result: OSSConnectionTest,
    timestamp: SystemTime,
}

impl CachedTestResult {
    fn is_expired(&self) -> bool {
        self.timestamp
            .elapsed()
            .map(|duration| duration.as_secs() > CACHE_EXPIRY_SECONDS)
            .unwrap_or(true)
    }
}

// Global cache for connection test results
static CONNECTION_TEST_CACHE: Lazy<Mutex<HashMap<String, CachedTestResult>>> = 
    Lazy::new(|| Mutex::new(HashMap::new()));

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

    // ============================================================================
    // Smart Connection Test with Caching
    // ============================================================================

    /// Calculate configuration hash for cache key generation
    /// Includes provider information to ensure provider-level cache isolation
    /// Only includes core connection parameters that affect actual connectivity
    fn calculate_config_hash(&self, config: &OSSConfig) -> String {
        let mut hasher = Sha256::new();
        
        // Include all core connection parameters that affect connection behavior
        // Provider is crucial for cache isolation between different providers
        hasher.update((config.provider.clone() as u8).to_string());
        hasher.update("|");
        hasher.update(&config.endpoint);
        hasher.update("|");
        hasher.update(&config.access_key_id);
        hasher.update("|");
        hasher.update(&config.access_key_secret); // 🔑 Critical security field
        hasher.update("|");
        hasher.update(&config.bucket);
        hasher.update("|");
        hasher.update(&config.region);
        
        // Note: Business configuration parameters are excluded:
        // - path_template: doesn't affect connection testing
        // - cdn_domain: doesn't affect connection testing  
        // - compression_*: doesn't affect connection testing
        
        format!("{:x}", hasher.finalize())
    }

    /// Load cache from file system
    fn load_cache_from_file(&self) -> HashMap<String, CachedTestResult> {
        let cache_path = self.get_cache_file_path();
        
        if !cache_path.exists() {
            return HashMap::new();
        }
        
        match fs::read_to_string(&cache_path) {
            Ok(content) => {
                match serde_json::from_str::<HashMap<String, CachedTestResult>>(&content) {
                    Ok(mut cache) => {
                        // Remove expired entries
                        cache.retain(|_, cached| !cached.is_expired());
                        println!("📂 Loaded {} cached connection results from file", cache.len());
                        cache
                    }
                    Err(e) => {
                        println!("⚠️ Failed to parse cache file: {}, starting fresh", e);
                        HashMap::new()
                    }
                }
            }
            Err(e) => {
                println!("⚠️ Failed to read cache file: {}, starting fresh", e);
                HashMap::new()
            }
        }
    }

    /// Save cache to file system
    fn save_cache_to_file(&self, cache: &HashMap<String, CachedTestResult>) {
        let cache_path = self.get_cache_file_path();
        
        match serde_json::to_string_pretty(cache) {
            Ok(content) => {
                if let Err(e) = fs::write(&cache_path, content) {
                    println!("⚠️ Failed to save cache to file: {}", e);
                } else {
                    println!("💾 Saved {} connection test results to cache file", cache.len());
                }
            }
            Err(e) => {
                println!("⚠️ Failed to serialize cache: {}", e);
            }
        }
    }

    /// Initialize cache from file on first access
    fn ensure_cache_loaded(&self) {
        if let Ok(mut cache) = CONNECTION_TEST_CACHE.lock() {
            if cache.is_empty() {
                let file_cache = self.load_cache_from_file();
                if !file_cache.is_empty() {
                    *cache = file_cache;
                }
            }
        }
    }

    /// Get cached test result if available and not expired
    fn get_cached_test_result(&self, config_hash: &str) -> Option<OSSConnectionTest> {
        // Ensure cache is loaded from file
        self.ensure_cache_loaded();
        
        let cache = CONNECTION_TEST_CACHE.lock().ok()?;
        let cached_result = cache.get(config_hash)?;
        
        if cached_result.is_expired() {
            None
        } else {
            println!("✅ Using cached connection test result for config hash: {}...", &config_hash[..8]);
            Some(cached_result.result.clone())
        }
    }

    /// Cache a test result
    fn cache_test_result(&self, config_hash: String, result: OSSConnectionTest) {
        if let Ok(mut cache) = CONNECTION_TEST_CACHE.lock() {
            let cached_result = CachedTestResult {
                config_hash: config_hash.clone(),
                result,
                timestamp: SystemTime::now(),
            };
            cache.insert(config_hash, cached_result);
            
            // Clean expired entries periodically
            cache.retain(|_, cached| !cached.is_expired());
            
            // Save to file after updating cache
            self.save_cache_to_file(&cache);
        }
    }

    /// Clear cache for specific configuration (used when force revalidation is requested)
    pub fn clear_config_cache(&self, config: &OSSConfig) {
        let config_hash = self.calculate_config_hash(config);
        if let Ok(mut cache) = CONNECTION_TEST_CACHE.lock() {
            cache.remove(&config_hash);
            println!("🗑️ Cleared cache for config hash: {}...", &config_hash[..8]);
            
            // Save to file after clearing cache
            self.save_cache_to_file(&cache);
        }
    }

    /// Clear all cached results (utility method)
    pub fn clear_all_cache(&self) {
        if let Ok(mut cache) = CONNECTION_TEST_CACHE.lock() {
            let count = cache.len();
            cache.clear();
            println!("🗑️ Cleared all {} cached connection results", count);
            
            // Save to file after clearing all cache
            self.save_cache_to_file(&cache);
        }
    }

    /// Get cached connection test result for a specific configuration without performing a new test
    pub async fn get_cached_connection_status(&self, config: &OSSConfig) -> Option<OSSConnectionTest> {
        let config_hash = self.calculate_config_hash(config);
        self.get_cached_test_result(&config_hash)
    }
    /// Perform actual connection test using OSSService
    async fn perform_connection_test(&self, config: &OSSConfig) -> Result<OSSConnectionTest> {
        println!("🔄 Performing actual connection test for provider: {:?}", config.provider);
        let oss_service = OSSService::new(config.clone())?;
        oss_service.test_connection().await
    }

    /// Smart connection test with caching
    async fn smart_connection_test(&self, config: &OSSConfig) -> Result<OSSConnectionTest> {
        let config_hash = self.calculate_config_hash(config);
        
        // Check cache first
        if let Some(cached_result) = self.get_cached_test_result(&config_hash) {
            return Ok(cached_result);
        }
        
        // Perform actual test
        let test_result = self.perform_connection_test(config).await?;
        
        // Cache the result
        self.cache_test_result(config_hash, test_result.clone());
        
        Ok(test_result)
    }

    pub async fn validate_config(&self, config: &OSSConfig) -> Result<ConfigValidation> {
        let mut errors = Vec::new();

        // Basic field validation (no network operations)
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

        // Smart connection test with caching (only if basic validation passes)
        let connection_test = if errors.is_empty() {
            println!("🔍 Basic validation passed, proceeding with smart connection test...");
            Some(self.smart_connection_test(config).await?)
        } else {
            println!("❌ Basic validation failed, skipping connection test");
            None
        };

        Ok(ConfigValidation {
            valid: errors.is_empty() && connection_test.as_ref().map_or(false, |t| t.success),
            errors,
            connection_test,
        })
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

    fn get_cache_file_path(&self) -> PathBuf {
        self.config_dir.join(CACHE_FILE_NAME)
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
            
            let validation = service.validate_config(&config).await.unwrap();
            // Connection may succeed or fail depending on network, but should not panic
            assert!(validation.connection_test.is_some());
            if let Some(connection_test) = validation.connection_test {
                assert!(connection_test.latency.is_some());
            }
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
        
        let validation = service.validate_config(&config).await.unwrap();
        if let Some(connection_test) = validation.connection_test {
            assert!(connection_test.latency.is_some()); // Should have latency regardless of success
        }

        // Test other regions
        config.region = "us-west-2".to_string();
        let validation = service.validate_config(&config).await.unwrap();
        if let Some(connection_test) = validation.connection_test {
            assert!(connection_test.latency.is_some()); // Should have latency regardless of success
        }
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