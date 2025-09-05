use crate::models::{ConfigCollection, ConfigItem, ConfigValidation, OSSConfig, OSSConnectionTest};
use crate::services::oss_service::OSSService;
use crate::utils::{AppError, Result};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::SystemTime;

const CACHE_FILE_NAME: &str = "connection_cache.json";
const CONFIG_DIR_NAME: &str = "imgtoss";
const CACHE_EXPIRY_SECONDS: u64 = 300; // 5 minutes
const CONFIGS_FILE_NAME: &str = "configs.json"; // New: multi-config file
#[allow(dead_code)]
const LEGACY_CONFIG_FILE_NAME: &str = "config.json"; // Legacy single config file
#[allow(dead_code)]
const STRONGHOLD_CONFIG_KEY: &str = "oss_config";

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

pub struct ConfigService {
    config_dir: PathBuf,
}

impl ConfigService {
    pub fn new() -> Result<Self> {
        let config_dir = Self::get_config_dir()?;

        // Ensure config directory exists
        if !config_dir.exists() {
            std::fs::create_dir_all(&config_dir).map_err(|e| {
                AppError::Configuration(format!("Failed to create config directory: {}", e))
            })?;
        }

        Ok(Self { config_dir })
    }

    #[allow(dead_code)]
    pub fn new_with_dir(config_dir: PathBuf) -> Result<Self> {
        // Ensure config directory exists
        if !config_dir.exists() {
            std::fs::create_dir_all(&config_dir).map_err(|e| {
                AppError::Configuration(format!("Failed to create config directory: {}", e))
            })?;
        }

        Ok(Self { config_dir })
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

        // For now, we'll store the config as a JSON file
        // The Stronghold integration will be handled on the frontend
        let config_path = self.get_config_file_path();
        let config_json = serde_json::to_string_pretty(config)
            .map_err(|e| AppError::Configuration(format!("Failed to serialize config: {}", e)))?;

        std::fs::write(&config_path, config_json)
            .map_err(|e| AppError::Configuration(format!("Failed to save config: {}", e)))?;

        Ok(())
    }

    pub async fn load_config(&self) -> Result<Option<OSSConfig>> {
        // Load active config from multi-config system
        if let Some(active_config) = self.get_active_config().await? {
            return Ok(Some(active_config.config));
        }

        // Fallback to legacy single config file for compatibility
        let config_path = self.get_config_file_path();

        if !config_path.exists() {
            return Ok(None);
        }

        let config_content = std::fs::read_to_string(&config_path)
            .map_err(|e| AppError::Configuration(format!("Failed to read config: {}", e)))?;

        let config: OSSConfig = serde_json::from_str(&config_content)
            .map_err(|e| AppError::Configuration(format!("Failed to deserialize config: {}", e)))?;

        Ok(Some(config))
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

        match std::fs::read_to_string(&cache_path) {
            Ok(content) => {
                match serde_json::from_str::<HashMap<String, CachedTestResult>>(&content) {
                    Ok(mut cache) => {
                        // Remove expired entries
                        cache.retain(|_, cached| !cached.is_expired());
                        println!(
                            "📂 Loaded {} cached connection results from file",
                            cache.len()
                        );
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
                if let Err(e) = std::fs::write(&cache_path, content) {
                    println!("⚠️ Failed to save cache to file: {}", e);
                } else {
                    println!(
                        "💾 Saved {} connection test results to cache file",
                        cache.len()
                    );
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
            println!(
                "✅ Using cached connection test result for config hash: {}...",
                &config_hash[..8]
            );
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
    pub async fn get_cached_connection_status(
        &self,
        config: &OSSConfig,
    ) -> Option<OSSConnectionTest> {
        let config_hash = self.calculate_config_hash(config);
        self.get_cached_test_result(&config_hash)
    }
    /// Perform actual connection test using OSSService
    async fn perform_connection_test(&self, config: &OSSConfig) -> Result<OSSConnectionTest> {
        println!(
            "🔄 Performing actual connection test for provider: {:?}",
            config.provider
        );
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
            errors
                .push("Endpoint must be a valid URL starting with http:// or https://".to_string());
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

    #[allow(dead_code)]
    pub async fn delete_config(&self) -> Result<()> {
        // For now, we'll delete the config JSON file
        // The Stronghold integration will be handled on the frontend
        let config_path = self.get_config_file_path();
        if config_path.exists() {
            std::fs::remove_file(&config_path)
                .map_err(|e| AppError::Configuration(format!("Failed to delete config: {}", e)))?;
        }
        Ok(())
    }

    // ============================================================================
    // Multi-Config Management Methods
    // ============================================================================

    /// Load all configurations
    pub async fn load_all_configs(&self) -> Result<ConfigCollection> {
        let configs_path = self.get_configs_file_path();

        if !configs_path.exists() {
            // Return empty collection if no configs exist
            return Ok(ConfigCollection {
                configs: Vec::new(),
                active_config_id: None,
            });
        }

        let config_json = std::fs::read_to_string(&configs_path)
            .map_err(|e| AppError::Configuration(format!("Failed to read configs: {}", e)))?;

        let collection: ConfigCollection = serde_json::from_str(&config_json)
            .map_err(|e| AppError::Configuration(format!("Failed to parse configs: {}", e)))?;

        Ok(collection)
    }

    /// Save a configuration item
    pub async fn save_config_item(&self, item: ConfigItem) -> Result<()> {
        // Validate the config before saving
        let validation = self.validate_config(&item.config).await?;
        if !validation.valid {
            return Err(AppError::Configuration(format!(
                "Invalid configuration: {}",
                validation.errors.join(", ")
            )));
        }

        let mut collection = self.load_all_configs().await.unwrap_or(ConfigCollection {
            configs: Vec::new(),
            active_config_id: None,
        });

        // Check if config with same ID exists
        if let Some(index) = collection.configs.iter().position(|c| c.id == item.id) {
            // Update existing config
            collection.configs[index] = item.clone();
        } else {
            // Add new config
            collection.configs.push(item.clone());
        }

        // If this is the first config or marked as active, set it as active
        if collection.configs.len() == 1 || item.is_active {
            collection.active_config_id = Some(item.id.clone());
            // Mark all other configs as inactive
            for config in &mut collection.configs {
                config.is_active = config.id == item.id;
            }
        }

        self.save_config_collection(&collection).await
    }

    /// Set active configuration
    pub async fn set_active_config(&self, config_id: String) -> Result<()> {
        let mut collection = self.load_all_configs().await?;

        // Check if config exists
        if !collection.configs.iter().any(|c| c.id == config_id) {
            return Err(AppError::Configuration(format!(
                "Config with ID {} not found",
                config_id
            )));
        }

        collection.active_config_id = Some(config_id.clone());

        // Update is_active flags
        for config in &mut collection.configs {
            config.is_active = config.id == config_id;
        }

        self.save_config_collection(&collection).await
    }

    /// Delete a configuration item
    pub async fn delete_config_item(&self, config_id: String) -> Result<()> {
        let mut collection = self.load_all_configs().await?;

        // Remove the config
        collection.configs.retain(|c| c.id != config_id);

        // If deleted config was active, set first config as active
        if collection.active_config_id == Some(config_id) {
            collection.active_config_id = collection.configs.first().map(|c| c.id.clone());
            if let Some(ref active_id) = collection.active_config_id {
                for config in &mut collection.configs {
                    config.is_active = config.id == *active_id;
                }
            }
        }

        self.save_config_collection(&collection).await
    }

    /// Get the active configuration
    pub async fn get_active_config(&self) -> Result<Option<ConfigItem>> {
        let collection = self.load_all_configs().await?;

        if let Some(active_id) = collection.active_config_id {
            Ok(collection.configs.into_iter().find(|c| c.id == active_id))
        } else {
            Ok(collection.configs.into_iter().find(|c| c.is_active))
        }
    }

    /// Save the entire config collection
    async fn save_config_collection(&self, collection: &ConfigCollection) -> Result<()> {
        let configs_path = self.get_configs_file_path();
        let config_json = serde_json::to_string_pretty(collection)
            .map_err(|e| AppError::Configuration(format!("Failed to serialize configs: {}", e)))?;

        std::fs::write(&configs_path, config_json)
            .map_err(|e| AppError::Configuration(format!("Failed to save configs: {}", e)))?;

        Ok(())
    }

    // Private helper methods

    fn get_config_dir() -> Result<PathBuf> {
        let config_dir = if cfg!(target_os = "windows") {
            dirs::config_dir()
                .ok_or_else(|| {
                    AppError::Configuration("Failed to get config directory".to_string())
                })?
                .join(CONFIG_DIR_NAME)
        } else if cfg!(target_os = "macos") {
            dirs::config_dir()
                .ok_or_else(|| {
                    AppError::Configuration("Failed to get config directory".to_string())
                })?
                .join(CONFIG_DIR_NAME)
        } else {
            dirs::config_dir()
                .ok_or_else(|| {
                    AppError::Configuration("Failed to get config directory".to_string())
                })?
                .join(CONFIG_DIR_NAME)
        };

        Ok(config_dir)
    }

    fn get_config_file_path(&self) -> PathBuf {
        self.config_dir.join("config.json")
    }

    fn get_configs_file_path(&self) -> PathBuf {
        self.config_dir.join(CONFIGS_FILE_NAME)
    }

    fn get_cache_file_path(&self) -> PathBuf {
        self.config_dir.join(CACHE_FILE_NAME)
    }
}

#[cfg(test)]
mod tests {
    use crate::models::OSSProvider;

    use super::*;
    use tempfile::TempDir;

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
            endpoint: "".to_string(),      // Invalid: empty endpoint
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

    // Note: The following tests require a Stronghold instance which is not available in unit tests
    // These would need to be integration tests or require mocking of the Stronghold API

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
    async fn test_config_file_path() {
        let (service, _temp_dir) = create_test_service().await;
        let cache_path = service.get_cache_file_path();

        assert!(cache_path.ends_with(CACHE_FILE_NAME));
        assert!(cache_path.parent().unwrap().exists());
    }
}
