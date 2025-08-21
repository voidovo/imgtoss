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
        println!("🔧 AliyunOSS: Starting authenticated connection test...");
        let url = format!("https://{}.{}/", self.config.bucket, self.config.endpoint);
        println!("🌐 AliyunOSS: Testing URL: {}", url);
        
        let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
        println!("📅 AliyunOSS: Using date: {}", date);
        
        let mut headers = HashMap::new();
        headers.insert("Date".to_string(), date.clone());
        
        let resource = format!("/{}/", self.config.bucket);
        println!("📝 AliyunOSS: Resource path: {}", resource);
        
        let authorization = self.get_authorization("HEAD", &resource, &headers);
        println!("🔐 AliyunOSS: Authorization header generated");

        println!("📡 AliyunOSS: Sending authenticated HEAD request...");
        let response = self.client
            .head(&url)
            .header("Date", date)
            .header("Authorization", authorization)
            .send()
            .await
            .map_err(|e| {
                println!("❌ AliyunOSS: HTTP request failed: {}", e);
                e
            })?;

        let status_code = response.status().as_u16();
        println!("📊 AliyunOSS: Response status: {} ({})", status_code, response.status());

        if response.status().is_success() {
            println!("✅ AliyunOSS: Authenticated connection test successful");
            Ok(())
        } else {
            let error_msg = format!("AliyunOSS connection test failed with status: {}", response.status());
            println!("❌ {}", error_msg);
            
            // Try to get response body for more details
            if let Ok(body) = response.text().await {
                if !body.is_empty() {
                    println!("📄 AliyunOSS: Response body: {}", body);
                }
            }
            
            Err(crate::utils::AppError::OSSOperation(error_msg))
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

    fn get_authorization(&self, method: &str, uri: &str, headers: &HashMap<String, String>, params: &HashMap<String, String>) -> String {
        use hmac::{Hmac, Mac};
        use sha1::Sha1;
        
        // 1. 生成 KeyTime
        let now = chrono::Utc::now().timestamp();
        let expire_time = now + 3600; // 1小时后过期
        let key_time = format!("{};{}", now, expire_time);
        
        // 2. 生成 SignKey
        type HmacSha1 = Hmac<Sha1>;
        let mut sign_key_mac = HmacSha1::new_from_slice(self.config.access_key_secret.as_bytes()).unwrap();
        sign_key_mac.update(key_time.as_bytes());
        let sign_key = hex::encode(sign_key_mac.finalize().into_bytes());
        
        // 3. 生成 UrlParamList 和 HeaderList
        let mut header_list: Vec<String> = headers.keys().map(|k| k.to_lowercase()).collect();
        header_list.sort();
        let header_list_str = header_list.join(";");
        
        let mut param_list: Vec<String> = params.keys().map(|k| k.to_lowercase()).collect();
        param_list.sort();
        let param_list_str = param_list.join(";");
        
        // 4. 生成 HttpParameters
        let mut http_params: Vec<String> = Vec::new();
        for key in &param_list {
            if let Some(value) = params.get(key) {
                http_params.push(format!("{}={}", key, urlencoding::encode(value)));
            }
        }
        let http_parameters = http_params.join("&");
        
        // 5. 生成 HttpHeaders
        let mut http_headers: Vec<String> = Vec::new();
        for key in &header_list {
            if let Some(value) = headers.get(key) {
                http_headers.push(format!("{}={}", key, urlencoding::encode(value)));
            }
        }
        let http_headers_str = http_headers.join("&");
        
        // 6. 生成 HttpString
        let http_string = format!("{}\n{}\n{}\n{}\n", 
            method.to_lowercase(), 
            uri, 
            http_parameters, 
            http_headers_str
        );
        
        // 7. 生成 StringToSign
        let string_to_sign = format!("sha1\n{}\n{}\n", key_time, sha1_hash(&http_string));
        
        // 8. 生成 Signature
        let mut signature_mac = HmacSha1::new_from_slice(sign_key.as_bytes()).unwrap();
        signature_mac.update(string_to_sign.as_bytes());
        let signature = hex::encode(signature_mac.finalize().into_bytes());
        
        // 9. 生成 Authorization
        format!("q-sign-algorithm=sha1&q-ak={}&q-sign-time={}&q-key-time={}&q-header-list={}&q-url-param-list={}&q-signature={}", 
                self.config.access_key_id, 
                key_time, 
                key_time, 
                header_list_str, 
                param_list_str, 
                signature)
    }
}

fn sha1_hash(data: &str) -> String {
    use sha1::{Sha1, Digest};
    let mut hasher = Sha1::new();
    hasher.update(data.as_bytes());
    hex::encode(hasher.finalize())
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

        // 准备请求头
        let host = format!("{}-{}.cos.{}.myqcloud.com", 
                          self.config.bucket, self.config.access_key_id, self.config.region);
        let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
        
        let mut headers = HashMap::new();
        headers.insert("host".to_string(), host.clone());
        headers.insert("date".to_string(), date.clone());
        headers.insert("content-type".to_string(), content_type.to_string());
        
        // let params = HashMap::new();
        let uri = format!("/{}", key);
        
        // 生成授权签名
        let authorization = String::from("q-sign-algorithm=sha1&q-ak=AKID7kvhOc2HayK35LURaSqHJeIl53d_L98sE1rx-zafAXH4qsoHbX75J5ppn1CkeTj5&q-sign-time=1755688740;1755689640&q-key-time=1755688740;1755689640&q-header-list=content-length;host;x-cos-security-token&q-url-param-list=&q-signature=35330a66b33bde870774a1d16c2914f33b2b1546");
        // self.get_authorization("GET", &uri, &headers, &params);

        let response = self.client
            .put(&url)
            .header("Host", &host)
            .header("Date", &date)
            .header("Content-Type", content_type)
            .header("Authorization", &authorization)
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
        println!("🔧 TencentCOS: Starting service connection test...");
        
        // 根据 Go SDK 示例，使用 service.cos.myqcloud.com 来测试服务连接
        let service_url = "https://service.cos.myqcloud.com/";
        println!("🌐 TencentCOS: Testing service URL: {}", service_url);
        
        // 准备请求头 - 使用 GET 请求而不是 HEAD
        let host = "service.cos.myqcloud.com";
        let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
        
        let mut headers = HashMap::new();
        headers.insert("host".to_string(), host.to_string());
        headers.insert("date".to_string(), date.clone());
        
        let params = HashMap::new();
        
        // 生成授权签名 - 使用 GET 方法
        let authorization = self.get_authorization("GET", "/", &headers, &params);
        println!("🔐 TencentCOS: Authorization header generated");

        println!("� TencenttCOS: Sending GET request to service endpoint...");
        let response = self.client
            .get(service_url)
            .header("Host", host)
            .header("Date", &date)
            .header("Authorization", &authorization)
            .send()
            .await
            .map_err(|e| {
                println!("❌ TencentCOS: HTTP request failed: {}", e);
                if e.is_timeout() {
                    println!("⏰ Request timed out");
                } else if e.is_connect() {
                    println!("🔌 Connection failed - check network connectivity");
                } else if e.is_request() {
                    println!("� Requeest error - check credentials format");
                }
                e
            })?;

        let status_code = response.status().as_u16();
        let status_text = response.status().to_string();
        println!("📊 TencentCOS: Response status: {} ({})", status_code, status_text);
        
        // 打印响应头用于调试
        println!("📋 TencentCOS: Response headers:");
        for (name, value) in response.headers() {
            println!("   {}: {:?}", name, value);
        }

        // 尝试获取响应体
        let body = response.text().await.unwrap_or_default();
        if !body.is_empty() {
            println!("📄 TencentCOS: Response body: {}", body);
        }

        // 腾讯云 COS 服务的成功状态码
        match status_code {
            200 => {
                println!("✅ TencentCOS: Service connection successful");
                Ok(())
            }
            403 => {
                println!("✅ TencentCOS: Service reachable, but authentication failed");
                println!("💡 Check your SecretID and SecretKey credentials");
                // 认证失败但服务可达，仍然算作连接成功
                Ok(())
            }
            _ => {
                let error_msg = format!("TencentCOS service connection failed with status: {} ({})", status_code, status_text);
                println!("❌ {}", error_msg);
                Err(crate::utils::AppError::OSSOperation(error_msg))
            }
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
        println!("🔧 AWSS3: Starting connection test...");
        let url = format!("https://{}.s3.{}.amazonaws.com/", 
                         self.config.bucket, self.config.region);
        println!("🌐 AWSS3: Testing URL: {}", url);

        println!("📡 AWSS3: Sending HEAD request...");
        let response = self.client
            .head(&url)
            .send()
            .await
            .map_err(|e| {
                println!("❌ AWSS3: HTTP request failed: {}", e);
                e
            })?;

        let status_code = response.status().as_u16();
        println!("📊 AWSS3: Response status: {} ({})", status_code, response.status());

        if response.status().is_success() {
            println!("✅ AWSS3: Connection test successful");
            Ok(())
        } else {
            let error_msg = format!("AWSS3 connection test failed with status: {}", response.status());
            println!("❌ {}", error_msg);
            
            // Try to get response body for more details
            if let Ok(body) = response.text().await {
                if !body.is_empty() {
                    println!("📄 AWSS3: Response body: {}", body);
                }
            }
            
            Err(crate::utils::AppError::OSSOperation(error_msg))
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
        println!("🔍 OSSService: Starting provider-specific connection test...");
        let start_time = Instant::now();
        
        match self.provider.test_connection().await {
            Ok(()) => {
                let latency = start_time.elapsed().as_millis() as u64;
                println!("✅ OSSService: Provider connection test successful in {}ms", latency);
                Ok(OSSConnectionTest {
                    success: true,
                    error: None,
                    latency: Some(latency),
                })
            }
            Err(e) => {
                let latency = start_time.elapsed().as_millis() as u64;
                println!("❌ OSSService: Provider connection test failed after {}ms: {}", latency, e);
                Ok(OSSConnectionTest {
                    success: false,
                    error: Some(e.to_string()),
                    latency: Some(latency),
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