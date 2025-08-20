use crate::models::{OSSConfig, OSSProvider, UploadResult, OSSConnectionTest, ObjectInfo, UploadProgress};
use crate::utils::Result;
use async_trait::async_trait;
use reqwest::Client;
use std::collections::HashMap;
use std::time::Instant;

// Progress callback type for upload operations
pub type ProgressCallback = Box<dyn Fn(UploadProgress) + Send + Sync>;

// OSS Provider trait that all implementations must follow
#[async_trait]
pub trait OSSProviderTrait: Send + Sync {
    async fn upload(&self, key: &str, data: &[u8], content_type: &str, progress_callback: Option<&ProgressCallback>) -> Result<String>;
    async fn delete(&self, key: &str) -> Result<()>;
    async fn list_objects(&self, prefix: &str) -> Result<Vec<ObjectInfo>>;
    async fn test_connection(&self) -> Result<()>;
    fn get_object_url(&self, key: &str) -> String;
}

// Aliyun OSS Implementation
pub struct AliyunOSS {
    config: OSSConfig,
    client: Client,
}

impl AliyunOSS {
    pub fn new(config: OSSConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }

    fn get_authorization(&self, method: &str, resource: &str, headers: &HashMap<String, String>) -> String {
        use hmac::{Hmac, Mac};
        use sha1::Sha1;
        use base64::Engine;

        let empty_string = String::new();
        let date = headers.get("Date").unwrap_or(&empty_string);
        let content_type = headers.get("Content-Type").unwrap_or(&empty_string);
        let content_md5 = headers.get("Content-MD5").unwrap_or(&empty_string);

        let string_to_sign = format!(
            "{}\n{}\n{}\n{}\n{}",
            method, content_md5, content_type, date, resource
        );

        type HmacSha1 = Hmac<Sha1>;
        let mut mac = HmacSha1::new_from_slice(self.config.access_key_secret.as_bytes()).unwrap();
        mac.update(string_to_sign.as_bytes());
        let signature = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());

        format!("OSS {}:{}", self.config.access_key_id, signature)
    }
}

#[async_trait]
impl OSSProviderTrait for AliyunOSS {
    async fn upload(&self, key: &str, data: &[u8], content_type: &str, progress_callback: Option<&ProgressCallback>) -> Result<String> {
        let url = format!("https://{}.{}/{}", self.config.bucket, self.config.endpoint, key);
        let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
        
        let mut headers = HashMap::new();
        headers.insert("Date".to_string(), date.clone());
        headers.insert("Content-Type".to_string(), content_type.to_string());
        
        let resource = format!("/{}/{}", self.config.bucket, key);
        let authorization = self.get_authorization("PUT", &resource, &headers);

        if let Some(callback) = progress_callback {
            callback(UploadProgress {
                image_id: key.to_string(),
                progress: 0.0,
                bytes_uploaded: 0,
                total_bytes: data.len() as u64,
                speed: None,
            });
        }

        let response = self.client
            .put(&url)
            .header("Date", date)
            .header("Authorization", authorization)
            .header("Content-Type", content_type)
            .body(data.to_vec())
            .send()
            .await?;

        if response.status().is_success() {
            if let Some(callback) = progress_callback {
                callback(UploadProgress {
                    image_id: key.to_string(),
                    progress: 100.0,
                    bytes_uploaded: data.len() as u64,
                    total_bytes: data.len() as u64,
                    speed: None,
                });
            }
            Ok(self.get_object_url(key))
        } else {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(crate::utils::AppError::OSSOperation(format!("Upload failed: {}", error_text)))
        }
    }

    async fn delete(&self, key: &str) -> Result<()> {
        let url = format!("https://{}.{}/{}", self.config.bucket, self.config.endpoint, key);
        let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
        
        let mut headers = HashMap::new();
        headers.insert("Date".to_string(), date.clone());
        
        let resource = format!("/{}/{}", self.config.bucket, key);
        let authorization = self.get_authorization("DELETE", &resource, &headers);

        let response = self.client
            .delete(&url)
            .header("Date", date)
            .header("Authorization", authorization)
            .send()
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(crate::utils::AppError::OSSOperation(format!("Delete failed: {}", error_text)))
        }
    }

    async fn list_objects(&self, prefix: &str) -> Result<Vec<ObjectInfo>> {
        let url = format!("https://{}.{}/?prefix={}", self.config.bucket, self.config.endpoint, prefix);
        let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
        
        let mut headers = HashMap::new();
        headers.insert("Date".to_string(), date.clone());
        
        let resource = format!("/{}/", self.config.bucket);
        let authorization = self.get_authorization("GET", &resource, &headers);

        let response = self.client
            .get(&url)
            .header("Date", date)
            .header("Authorization", authorization)
            .send()
            .await?;

        if response.status().is_success() {
            // Parse XML response (simplified implementation)
            let _text = response.text().await?;
            // TODO: Implement proper XML parsing for object listing
            Ok(vec![])
        } else {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(crate::utils::AppError::OSSOperation(format!("List objects failed: {}", error_text)))
        }
    }

    async fn test_connection(&self) -> Result<()> {
        let url = format!("https://{}.{}/", self.config.bucket, self.config.endpoint);
        let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
        
        let mut headers = HashMap::new();
        headers.insert("Date".to_string(), date.clone());
        
        let resource = format!("/{}/", self.config.bucket);
        let authorization = self.get_authorization("HEAD", &resource, &headers);

        let response = self.client
            .head(&url)
            .header("Date", date)
            .header("Authorization", authorization)
            .send()
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(crate::utils::AppError::OSSOperation("Connection test failed".to_string()))
        }
    }

    fn get_object_url(&self, key: &str) -> String {
        if let Some(cdn_domain) = &self.config.cdn_domain {
            format!("https://{}/{}", cdn_domain, key)
        } else {
            format!("https://{}.{}/{}", self.config.bucket, self.config.endpoint, key)
        }
    }
}

// Tencent COS Implementation
pub struct TencentCOS {
    config: OSSConfig,
    client: Client,
}

impl TencentCOS {
    pub fn new(config: OSSConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }

    fn get_authorization(&self, method: &str, uri: &str, headers: &HashMap<String, String>) -> String {
        use hmac::{Hmac, Mac};
        use sha1::Sha1;
        
        let empty_string = String::new();
        let date = headers.get("Date").unwrap_or(&empty_string);
        let host = headers.get("Host").unwrap_or(&empty_string);
        
        let string_to_sign = format!("{}\n{}\n{}\n{}\n", method, uri, host, date);
        
        type HmacSha1 = Hmac<Sha1>;
        let mut mac = HmacSha1::new_from_slice(self.config.access_key_secret.as_bytes()).unwrap();
        mac.update(string_to_sign.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());

        format!("q-sign-algorithm=sha1&q-ak={}&q-sign-time={}&q-key-time={}&q-header-list=host&q-url-param-list=&q-signature={}", 
                self.config.access_key_id, date, date, signature)
    }
}

#[async_trait]
impl OSSProviderTrait for TencentCOS {
    async fn upload(&self, key: &str, data: &[u8], content_type: &str, progress_callback: Option<&ProgressCallback>) -> Result<String> {
        let url = format!("https://{}-{}.cos.{}.myqcloud.com/{}", 
                         self.config.bucket, self.config.access_key_id, self.config.region, key);
        
        if let Some(callback) = progress_callback {
            callback(UploadProgress {
                image_id: key.to_string(),
                progress: 0.0,
                bytes_uploaded: 0,
                total_bytes: data.len() as u64,
                speed: None,
            });
        }

        let response = self.client
            .put(&url)
            .header("Content-Type", content_type)
            .body(data.to_vec())
            .send()
            .await?;

        if response.status().is_success() {
            if let Some(callback) = progress_callback {
                callback(UploadProgress {
                    image_id: key.to_string(),
                    progress: 100.0,
                    bytes_uploaded: data.len() as u64,
                    total_bytes: data.len() as u64,
                    speed: None,
                });
            }
            Ok(self.get_object_url(key))
        } else {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(crate::utils::AppError::OSSOperation(format!("Upload failed: {}", error_text)))
        }
    }

    async fn delete(&self, key: &str) -> Result<()> {
        let url = format!("https://{}-{}.cos.{}.myqcloud.com/{}", 
                         self.config.bucket, self.config.access_key_id, self.config.region, key);

        let response = self.client
            .delete(&url)
            .send()
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(crate::utils::AppError::OSSOperation(format!("Delete failed: {}", error_text)))
        }
    }

    async fn list_objects(&self, prefix: &str) -> Result<Vec<ObjectInfo>> {
        let url = format!("https://{}-{}.cos.{}.myqcloud.com/?prefix={}", 
                         self.config.bucket, self.config.access_key_id, self.config.region, prefix);

        let response = self.client
            .get(&url)
            .send()
            .await?;

        if response.status().is_success() {
            // Parse XML response (simplified implementation)
            let _text = response.text().await?;
            // TODO: Implement proper XML parsing for object listing
            Ok(vec![])
        } else {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(crate::utils::AppError::OSSOperation(format!("List objects failed: {}", error_text)))
        }
    }

    async fn test_connection(&self) -> Result<()> {
        let url = format!("https://{}-{}.cos.{}.myqcloud.com/", 
                         self.config.bucket, self.config.access_key_id, self.config.region);

        let response = self.client
            .head(&url)
            .send()
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(crate::utils::AppError::OSSOperation("Connection test failed".to_string()))
        }
    }

    fn get_object_url(&self, key: &str) -> String {
        if let Some(cdn_domain) = &self.config.cdn_domain {
            format!("https://{}/{}", cdn_domain, key)
        } else {
            format!("https://{}-{}.cos.{}.myqcloud.com/{}", 
                   self.config.bucket, self.config.access_key_id, self.config.region, key)
        }
    }
}

// AWS S3 Implementation
pub struct AWSS3 {
    config: OSSConfig,
    client: Client,
}

impl AWSS3 {
    pub fn new(config: OSSConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }

    fn get_authorization(&self, method: &str, uri: &str, headers: &HashMap<String, String>) -> String {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        
        let empty_string = String::new();
        let date = headers.get("x-amz-date").unwrap_or(&empty_string);
        let host = headers.get("Host").unwrap_or(&empty_string);
        
        let canonical_request = format!("{}\n{}\n\nhost:{}\nx-amz-date:{}\n\nhost;x-amz-date\nUNSIGNED-PAYLOAD", 
                                      method, uri, host, date);
        
        type HmacSha256 = Hmac<Sha256>;
        let mut mac = HmacSha256::new_from_slice(self.config.access_key_secret.as_bytes()).unwrap();
        mac.update(canonical_request.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());

        format!("AWS4-HMAC-SHA256 Credential={}/{}/s3/aws4_request,SignedHeaders=host;x-amz-date,Signature={}", 
                self.config.access_key_id, date, signature)
    }
}

#[async_trait]
impl OSSProviderTrait for AWSS3 {
    async fn upload(&self, key: &str, data: &[u8], content_type: &str, progress_callback: Option<&ProgressCallback>) -> Result<String> {
        let url = format!("https://{}.s3.{}.amazonaws.com/{}", 
                         self.config.bucket, self.config.region, key);
        
        if let Some(callback) = progress_callback {
            callback(UploadProgress {
                image_id: key.to_string(),
                progress: 0.0,
                bytes_uploaded: 0,
                total_bytes: data.len() as u64,
                speed: None,
            });
        }

        let response = self.client
            .put(&url)
            .header("Content-Type", content_type)
            .body(data.to_vec())
            .send()
            .await?;

        if response.status().is_success() {
            if let Some(callback) = progress_callback {
                callback(UploadProgress {
                    image_id: key.to_string(),
                    progress: 100.0,
                    bytes_uploaded: data.len() as u64,
                    total_bytes: data.len() as u64,
                    speed: None,
                });
            }
            Ok(self.get_object_url(key))
        } else {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(crate::utils::AppError::OSSOperation(format!("Upload failed: {}", error_text)))
        }
    }

    async fn delete(&self, key: &str) -> Result<()> {
        let url = format!("https://{}.s3.{}.amazonaws.com/{}", 
                         self.config.bucket, self.config.region, key);

        let response = self.client
            .delete(&url)
            .send()
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(crate::utils::AppError::OSSOperation(format!("Delete failed: {}", error_text)))
        }
    }

    async fn list_objects(&self, prefix: &str) -> Result<Vec<ObjectInfo>> {
        let url = format!("https://{}.s3.{}.amazonaws.com/?list-type=2&prefix={}", 
                         self.config.bucket, self.config.region, prefix);

        let response = self.client
            .get(&url)
            .send()
            .await?;

        if response.status().is_success() {
            // Parse XML response (simplified implementation)
            let _text = response.text().await?;
            // TODO: Implement proper XML parsing for object listing
            Ok(vec![])
        } else {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(crate::utils::AppError::OSSOperation(format!("List objects failed: {}", error_text)))
        }
    }

    async fn test_connection(&self) -> Result<()> {
        let url = format!("https://{}.s3.{}.amazonaws.com/", 
                         self.config.bucket, self.config.region);

        let response = self.client
            .head(&url)
            .send()
            .await?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(crate::utils::AppError::OSSOperation("Connection test failed".to_string()))
        }
    }

    fn get_object_url(&self, key: &str) -> String {
        if let Some(cdn_domain) = &self.config.cdn_domain {
            format!("https://{}/{}", cdn_domain, key)
        } else {
            format!("https://{}.s3.{}.amazonaws.com/{}", 
                   self.config.bucket, self.config.region, key)
        }
    }
}

// Main OSS Service that manages different providers
pub struct OSSService {
    provider: Box<dyn OSSProviderTrait>,
}

impl OSSService {
    pub fn new(config: OSSConfig) -> Result<Self> {
        let provider: Box<dyn OSSProviderTrait> = match config.provider {
            OSSProvider::Aliyun => Box::new(AliyunOSS::new(config)),
            OSSProvider::Tencent => Box::new(TencentCOS::new(config)),
            OSSProvider::AWS => Box::new(AWSS3::new(config)),
            OSSProvider::Custom => {
                return Err(crate::utils::AppError::Configuration("Custom provider not implemented".to_string()));
            }
        };

        Ok(Self { provider })
    }

    pub async fn upload_image(&self, key: &str, data: &[u8], progress_callback: Option<ProgressCallback>) -> Result<String> {
        let content_type = self.detect_content_type(data);
        self.provider.upload(key, data, &content_type, progress_callback.as_ref()).await
    }

    pub async fn test_connection(&self) -> Result<OSSConnectionTest> {
        let start_time = Instant::now();
        
        match self.provider.test_connection().await {
            Ok(()) => {
                let latency = start_time.elapsed().as_millis() as u64;
                Ok(OSSConnectionTest {
                    success: true,
                    error: None,
                    latency: Some(latency),
                })
            }
            Err(e) => {
                Ok(OSSConnectionTest {
                    success: false,
                    error: Some(e.to_string()),
                    latency: None,
                })
            }
        }
    }

    pub async fn upload_multiple(&self, images: Vec<(String, Vec<u8>)>) -> Result<Vec<UploadResult>> {
        let mut results = Vec::new();
        
        for (key, data) in images {
            let image_id = key.clone();
            match self.upload_image(&key, &data, None).await {
                Ok(url) => {
                    results.push(UploadResult {
                        image_id,
                        success: true,
                        uploaded_url: Some(url),
                        error: None,
                    });
                }
                Err(e) => {
                    results.push(UploadResult {
                        image_id,
                        success: false,
                        uploaded_url: None,
                        error: Some(e.to_string()),
                    });
                }
            }
        }
        
        Ok(results)
    }

    pub async fn list_objects(&self, prefix: &str) -> Result<Vec<ObjectInfo>> {
        self.provider.list_objects(prefix).await
    }

    pub async fn delete_object(&self, key: &str) -> Result<()> {
        self.provider.delete(key).await
    }

    fn detect_content_type(&self, data: &[u8]) -> String {
        // Simple content type detection based on file signature
        if data.len() >= 4 {
            match &data[0..4] {
                [0xFF, 0xD8, 0xFF, _] => "image/jpeg".to_string(),
                [0x89, 0x50, 0x4E, 0x47] => "image/png".to_string(),
                [0x47, 0x49, 0x46, 0x38] => "image/gif".to_string(),
                [0x52, 0x49, 0x46, 0x46] => {
                    if data.len() >= 12 && &data[8..12] == b"WEBP" {
                        "image/webp".to_string()
                    } else {
                        "application/octet-stream".to_string()
                    }
                }
                _ => "application/octet-stream".to_string(),
            }
        } else {
            "application/octet-stream".to_string()
        }
    }
}

#[cfg(test)]
#[path = "oss_service_test.rs"]
mod tests;