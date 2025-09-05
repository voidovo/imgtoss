use crate::models::{OSSConfig, OSSConnectionTest, OSSProvider, UploadProgress, UploadResult};
use crate::utils::Result;
use crate::{log_debug, log_error, log_info, log_timing, log_warn};
use async_trait::async_trait;
use reqwest::Client;
use std::collections::HashMap;
use std::time::Instant;

// Progress callback type for upload operations
pub type ProgressCallback = Box<dyn Fn(UploadProgress) + Send + Sync>;

// Simplified OSS Provider trait focusing on core functionality
#[async_trait]
pub trait OSSProviderTrait: Send + Sync {
    /// Test connection to the OSS provider
    async fn test_connection(&self) -> Result<OSSConnectionTest>;

    /// Upload a file to the OSS provider
    async fn upload(
        &self,
        key: &str,
        data: &[u8],
        content_type: &str,
        progress_callback: Option<&ProgressCallback>,
    ) -> Result<String>;

    /// Get the URL for an uploaded object
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

    fn get_authorization(
        &self,
        method: &str,
        resource: &str,
        headers: &HashMap<String, String>,
    ) -> String {
        use base64::Engine;
        use hmac::{Hmac, Mac};
        use sha1::Sha1;

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
        let signature =
            base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());

        format!("OSS {}:{}", self.config.access_key_id, signature)
    }
}

#[async_trait]
impl OSSProviderTrait for AliyunOSS {
    async fn test_connection(&self) -> Result<OSSConnectionTest> {
        log_info!(
            operation = "test_oss_connection",
            provider = "aliyun",
            bucket = %self.config.bucket,
            endpoint = %self.config.endpoint,
            "Starting OSS connection test"
        );

        let url = format!("https://{}.{}/", self.config.bucket, self.config.endpoint);
        log_debug!(
            test_url = %url,
            "Testing OSS connection URL"
        );

        let result = log_timing!(
            {
                let date = chrono::Utc::now()
                    .format("%a, %d %b %Y %H:%M:%S GMT")
                    .to_string();
                log_debug!(
                    date = %date,
                    "Generated request date"
                );

                let mut headers = HashMap::new();
                headers.insert("Date".to_string(), date.clone());

                let resource = format!("/{}/", self.config.bucket);
                log_debug!(
                    resource = %resource,
                    "Generated resource path"
                );

                let authorization = self.get_authorization("HEAD", &resource, &headers);
                log_debug!("Authorization header generated");

                log_debug!("Sending authenticated HEAD request");
                let response = self
                    .client
                    .head(&url)
                    .header("Date", date)
                    .header("Authorization", authorization)
                    .send()
                    .await
                    .map_err(|e| {
                        log_error!(
                            error = %e,
                            operation = "oss_head_request",
                            "HTTP request failed during connection test"
                        );
                        e
                    })?;

                let status_code = response.status().as_u16();
                log_debug!(
                    status_code = status_code,
                    status_text = %response.status(),
                    "Received response"
                );

                if response.status().is_success() {
                    log_info!(
                        operation = "test_oss_connection",
                        provider = "aliyun",
                        success = true,
                        "OSS connection test successful"
                    );
                    Ok(OSSConnectionTest {
                        success: true,
                        error: None,
                        latency: Some(0), // Will be calculated by log_timing
                        bucket_exists: Some(true),
                        available_buckets: None, // Aliyun doesn't provide bucket list in simple connection test
                    })
                } else {
                    let error_msg = format!(
                        "OSS connection test failed with status: {}",
                        response.status()
                    );

                    // Try to get response body for more details
                    let error_body = response.text().await.unwrap_or_default();
                    if !error_body.is_empty() {
                        log_debug!(
                            response_body = %error_body,
                            "Error response body"
                        );
                    }

                    log_error!(
                        operation = "test_oss_connection",
                        provider = "aliyun",
                        success = false,
                        status_code = status_code,
                        error = %error_msg,
                        "OSS connection test failed"
                    );

                    Ok(OSSConnectionTest {
                        success: false,
                        error: Some(error_msg),
                        latency: Some(0), // Will be calculated by log_timing
                        bucket_exists: Some(false),
                        available_buckets: None,
                    })
                }
            },
            "test_oss_connection"
        );

        result
    }

    async fn upload(
        &self,
        key: &str,
        data: &[u8],
        content_type: &str,
        progress_callback: Option<&ProgressCallback>,
    ) -> Result<String> {
        log_info!(
            operation = "aliyun_oss_upload",
            key = %key,
            bucket = %self.config.bucket,
            endpoint = %self.config.endpoint,
            region = %self.config.region,
            content_type = %content_type,
            data_size = data.len(),
            "Starting Aliyun OSS upload operation"
        );

        // Validate bucket name format
        if self.config.bucket.is_empty() {
            log_error!(
                operation = "aliyun_oss_upload",
                error = "Bucket name is empty",
                "Upload validation failed"
            );
            return Err(crate::utils::AppError::Configuration(
                "Bucket name cannot be empty".to_string(),
            ));
        }

        // Check for common bucket name issues
        if self.config.bucket.contains(" ") {
            log_error!(
                operation = "aliyun_oss_upload",
                bucket = %self.config.bucket,
                error = "Bucket name contains spaces",
                "Upload validation failed"
            );
            return Err(crate::utils::AppError::Configuration(
                "Bucket name cannot contain spaces".to_string(),
            ));
        }

        if self.config.bucket.contains("_") {
            log_warn!(
                operation = "aliyun_oss_upload",
                bucket = %self.config.bucket,
                "Bucket name contains underscores, which may not be valid for some OSS providers"
            );
        }

        let url = format!(
            "https://{}.{}/{}",
            self.config.bucket, self.config.endpoint, key
        );
        log_debug!(
            upload_url = %url,
            "Generated upload URL"
        );

        let date = chrono::Utc::now()
            .format("%a, %d %b %Y %H:%M:%S GMT")
            .to_string();
        log_debug!(
            date = %date,
            "Generated request date"
        );

        let mut headers = HashMap::new();
        headers.insert("Date".to_string(), date.clone());
        headers.insert("Content-Type".to_string(), content_type.to_string());

        let resource = format!("/{}/{}", self.config.bucket, key);
        log_debug!(
            resource = %resource,
            "Generated resource path for signing"
        );

        let authorization = self.get_authorization("PUT", &resource, &headers);
        log_debug!("Authorization header generated successfully");

        if let Some(callback) = progress_callback {
            callback(UploadProgress {
                image_id: key.to_string(),
                progress: 0.0,
                bytes_uploaded: 0,
                total_bytes: data.len() as u64,
                speed: None,
            });
        }

        log_debug!(
            method = "PUT",
            url = %url,
            content_type = %content_type,
            data_size = data.len(),
            "Sending HTTP PUT request"
        );

        let result = log_timing!(
            {
                let response = self
                    .client
                    .put(&url)
                    .header("Date", date)
                    .header("Authorization", authorization)
                    .header("Content-Type", content_type)
                    .body(data.to_vec())
                    .send()
                    .await
                    .map_err(|e| {
                        log_error!(
                            operation = "aliyun_oss_upload",
                            error = %e,
                            url = %url,
                            "HTTP request failed"
                        );
                        e
                    })?;

                let status_code = response.status().as_u16();
                log_debug!(
                    status_code = status_code,
                    status_text = %response.status(),
                    "Received HTTP response"
                );

                if response.status().is_success() {
                    log_info!(
                        operation = "aliyun_oss_upload",
                        key = %key,
                        bucket = %self.config.bucket,
                        status_code = status_code,
                        success = true,
                        "Upload completed successfully"
                    );

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
                    let status_text = response.status().to_string();
                    let error_text = response
                        .text()
                        .await
                        .unwrap_or_else(|_| "Unknown error".to_string());

                    log_error!(
                        operation = "aliyun_oss_upload",
                        key = %key,
                        bucket = %self.config.bucket,
                        endpoint = %self.config.endpoint,
                        status_code = status_code,
                        status_text = %status_text,
                        error_response = %error_text,
                        success = false,
                        "Upload failed with error response"
                    );

                    // Parse XML error for more specific logging
                    if error_text.contains("InvalidBucketName") {
                        log_error!(
                            operation = "aliyun_oss_upload",
                            bucket = %self.config.bucket,
                            error_type = "InvalidBucketName",
                            "Bucket name validation failed on server side - check bucket name format and existence"
                        );
                    } else if error_text.contains("NoSuchBucket") {
                        log_error!(
                            operation = "aliyun_oss_upload",
                            bucket = %self.config.bucket,
                            error_type = "NoSuchBucket",
                            "Bucket does not exist - check bucket name and region"
                        );
                    } else if error_text.contains("AccessDenied") {
                        log_error!(
                            operation = "aliyun_oss_upload",
                            error_type = "AccessDenied",
                            "Access denied - check credentials and permissions"
                        );
                    }

                    Err(crate::utils::AppError::OSSOperation(format!(
                        "Upload failed: {}",
                        error_text
                    )))
                }
            },
            "aliyun_oss_upload"
        );

        result
    }

    fn get_object_url(&self, key: &str) -> String {
        if let Some(cdn_domain) = &self.config.cdn_domain {
            format!("https://{}/{}", cdn_domain, key)
        } else {
            format!(
                "https://{}.{}/{}",
                self.config.bucket, self.config.endpoint, key
            )
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

    fn parse_bucket_list_xml(&self, xml_body: &str) -> Result<Vec<String>> {
        // 解析腾讯云 COS 返回的 bucket 列表 XML
        // 查找 <Bucket><Name>bucket-name</Name></Bucket> 模式
        let mut bucket_names = Vec::new();

        // 使用正则表达式提取 <Name> 标签中的 bucket 名称
        let re = regex::Regex::new(r"<Name>(.*?)</Name>").map_err(|e| {
            println!(
                "❌ TencentCOS: Failed to compile regex for bucket name extraction: {}",
                e
            );
            crate::utils::AppError::Configuration("Failed to parse bucket list".to_string())
        })?;

        for cap in re.captures_iter(xml_body) {
            if let Some(name) = cap.get(1) {
                let bucket_name = name.as_str().to_string();
                println!("📋 TencentCOS: Found bucket: {}", bucket_name);
                bucket_names.push(bucket_name);
            }
        }

        println!(
            "✅ TencentCOS: Extracted {} bucket names from XML",
            bucket_names.len()
        );
        Ok(bucket_names)
    }

    fn get_authorization(
        &self,
        method: &str,
        uri: &str,
        headers: &HashMap<String, String>,
        params: &HashMap<String, String>,
    ) -> String {
        use hmac::{Hmac, Mac};
        use sha1::Sha1;

        // 1. 生成 KeyTime
        let now = chrono::Utc::now().timestamp();
        let expire_time = now + 3600; // 1小时后过期
        let key_time = format!("{};{}", now, expire_time);

        // 2. 生成 SignKey
        type HmacSha1 = Hmac<Sha1>;
        let mut sign_key_mac =
            HmacSha1::new_from_slice(self.config.access_key_secret.as_bytes()).unwrap();
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
        let http_string = format!(
            "{}\n{}\n{}\n{}\n",
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
    use sha1::{Digest, Sha1};
    let mut hasher = Sha1::new();
    hasher.update(data.as_bytes());
    hex::encode(hasher.finalize())
}

#[async_trait]
impl OSSProviderTrait for TencentCOS {
    async fn test_connection(&self) -> Result<OSSConnectionTest> {
        println!("🔧 TencentCOS: Starting service connection test...");

        let start_time = Instant::now();

        // 根据 Go SDK 示例，使用 service.cos.myqcloud.com 来测试服务连接
        let service_url = "https://service.cos.myqcloud.com/";
        println!("🌐 TencentCOS: Testing service URL: {}", service_url);

        // 准备请求头 - 使用 GET 请求而不是 HEAD
        let host = "service.cos.myqcloud.com";
        let date = chrono::Utc::now()
            .format("%a, %d %b %Y %H:%M:%S GMT")
            .to_string();

        let mut headers = HashMap::new();
        headers.insert("host".to_string(), host.to_string());
        headers.insert("date".to_string(), date.clone());

        let params = HashMap::new();

        // 生成授权签名 - 使用 GET 方法
        let authorization = self.get_authorization("GET", "/", &headers, &params);
        println!("🔐 TencentCOS: Authorization header generated");

        println!("📡 TencentCOS: Sending GET request to service endpoint...");
        let response = self
            .client
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
                    println!("📝 Request error - check credentials format");
                }
                e
            })?;

        let status_code = response.status().as_u16();
        let status_text = response.status().to_string();
        let latency = start_time.elapsed().as_millis() as u64;
        println!(
            "📊 TencentCOS: Response status: {} ({})",
            status_code, status_text
        );

        // 打印响应头用于调试
        println!("📋 TencentCOS: Response headers:");
        for (name, value) in response.headers() {
            println!("   {}: {:?}", name, value);
        }

        // 尝试获取响应体
        let body = response.text().await.unwrap_or_default();
        if !body.is_empty() {
            println!(
                "📄 TencentCOS: Response body (first 500 chars): {}",
                &body[..std::cmp::min(500, body.len())]
            );
        }

        // 腾讯云 COS 服务的成功状态码
        match status_code {
            200 => {
                // 解析 bucket 列表
                println!("📋 TencentCOS: Received XML response, parsing bucket list...");

                let available_buckets = match self.parse_bucket_list_xml(&body) {
                    Ok(buckets) => {
                        println!(
                            "✅ TencentCOS: Successfully parsed {} buckets",
                            buckets.len()
                        );
                        Some(buckets)
                    }
                    Err(e) => {
                        println!("⚠️  TencentCOS: Failed to parse bucket list: {}", e);
                        None
                    }
                };

                // 检查指定的 bucket 是否存在
                let bucket_exists = available_buckets.as_ref().map(|buckets| {
                    println!(
                        "🔍 TencentCOS: Looking for bucket '{}' in available buckets: {:?}",
                        self.config.bucket, buckets
                    );
                    buckets.contains(&self.config.bucket)
                });

                println!(
                    "📋 TencentCOS: Bucket existence check result: {:?}",
                    bucket_exists
                );

                match bucket_exists {
                    Some(true) => {
                        println!(
                            "✅ TencentCOS: Bucket '{}' found in available buckets",
                            self.config.bucket
                        );
                        Ok(OSSConnectionTest {
                            success: true,
                            error: None,
                            latency: Some(latency),
                            bucket_exists: Some(true),
                            available_buckets,
                        })
                    }
                    Some(false) => {
                        println!(
                            "❌ TencentCOS: Bucket '{}' not found in available buckets",
                            self.config.bucket
                        );
                        let error_msg = format!("存储桶 '{}' 不存在或不可访问", self.config.bucket);

                        Ok(OSSConnectionTest {
                            success: false,
                            error: Some(error_msg),
                            latency: Some(latency),
                            bucket_exists: Some(false),
                            available_buckets,
                        })
                    }
                    None => {
                        println!("⚠️  TencentCOS: Could not verify bucket existence due to parsing error");
                        Ok(OSSConnectionTest {
                            success: true,
                            error: Some("无法解析存储桶列表，但服务连接正常".to_string()),
                            latency: Some(latency),
                            bucket_exists: None,
                            available_buckets: None,
                        })
                    }
                }
            }
            403 => {
                println!("✅ TencentCOS: Service reachable, but authentication failed");
                println!("💡 Check your SecretID and SecretKey credentials");
                // 认证失败但服务可达，仍然算作连接成功
                Ok(OSSConnectionTest {
                    success: false,
                    error: Some("认证失败，请检查 SecretID 和 SecretKey".to_string()),
                    latency: Some(latency),
                    bucket_exists: None,
                    available_buckets: None,
                })
            }
            _ => {
                let error_msg = format!(
                    "TencentCOS service connection failed with status: {} ({})",
                    status_code, status_text
                );
                println!("❌ {}", error_msg);
                Ok(OSSConnectionTest {
                    success: false,
                    error: Some(error_msg),
                    latency: Some(latency),
                    bucket_exists: None,
                    available_buckets: None,
                })
            }
        }
    }

    async fn upload(
        &self,
        key: &str,
        data: &[u8],
        content_type: &str,
        progress_callback: Option<&ProgressCallback>,
    ) -> Result<String> {
        log_info!(
            operation = "tencent_cos_upload",
            key = %key,
            bucket = %self.config.bucket,
            endpoint = %self.config.endpoint,
            region = %self.config.region,
            content_type = %content_type,
            data_size = data.len(),
            "Starting Tencent COS upload operation"
        );

        // 验证bucket格式包含APPID（格式：bucketname-appid）
        if !self.config.bucket.contains('-') {
            log_error!(
                operation = "tencent_cos_upload",
                bucket = %self.config.bucket,
                error = "Bucket format validation failed",
                "Tencent COS bucket format should be: bucketname-appid"
            );
            return Err(crate::utils::AppError::Configuration(
                "腾讯云COS bucket格式错误，应为：bucket-name-appid".to_string(),
            ));
        }

        let url = format!(
            "https://{}.cos.{}.myqcloud.com/{}",
            self.config.bucket, self.config.region, key
        );
        log_debug!(
            upload_url = %url,
            "Generated Tencent COS upload URL"
        );

        if let Some(callback) = progress_callback {
            callback(UploadProgress {
                image_id: key.to_string(),
                progress: 0.0,
                bytes_uploaded: 0,
                total_bytes: data.len() as u64,
                speed: None,
            });
        }

        // 按照官方API要求准备请求头
        let host = format!(
            "{}.cos.{}.myqcloud.com",
            self.config.bucket, self.config.region
        );
        let date = chrono::Utc::now()
            .format("%a, %d %b %Y %H:%M:%S GMT")
            .to_string();
        let content_length = data.len().to_string();

        log_debug!(
            host = %host,
            date = %date,
            content_length = %content_length,
            "Generated request headers"
        );

        // 计算Content-MD5（可选但推荐）
        let mut hasher = md5::Context::new();
        hasher.consume(data);
        let digest = hasher.compute();
        let md5_hash =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &digest.0);

        log_debug!(
            content_md5_hash = %md5_hash,
            "Calculated Content-MD5"
        );

        let mut headers = HashMap::new();
        headers.insert("host".to_string(), host.clone());
        headers.insert("date".to_string(), date.clone());
        headers.insert("content-type".to_string(), content_type.to_string());
        headers.insert("content-length".to_string(), content_length.clone());
        headers.insert("content-md5".to_string(), md5_hash.clone());

        let params = HashMap::new();
        let uri = format!("/{}", key);

        log_debug!(
            uri = %uri,
            "Generated URI for signing"
        );

        // 生成授权签名
        let authorization = self.get_authorization("PUT", &uri, &headers, &params);
        log_debug!("Tencent COS authorization header generated successfully");

        log_debug!(
            method = "PUT",
            url = %url,
            content_type = %content_type,
            data_size = data.len(),
            "Sending HTTP PUT request to Tencent COS"
        );

        let result = log_timing!(
            {
                let response = self
                    .client
                    .put(&url)
                    .header("Host", &host)
                    .header("Date", &date)
                    .header("Content-Type", content_type)
                    .header("Content-Length", &content_length)
                    .header("Content-MD5", &md5_hash)
                    .header("Authorization", &authorization)
                    .body(data.to_vec())
                    .send()
                    .await
                    .map_err(|e| {
                        log_error!(
                            operation = "tencent_cos_upload",
                            error = %e,
                            url = %url,
                            "HTTP request failed"
                        );
                        e
                    })?;

                let status_code = response.status().as_u16();
                log_debug!(
                    status_code = status_code,
                    status_text = %response.status(),
                    "Received HTTP response from Tencent COS"
                );

                if response.status().is_success() {
                    log_info!(
                        operation = "tencent_cos_upload",
                        key = %key,
                        bucket = %self.config.bucket,
                        status_code = status_code,
                        success = true,
                        "Upload completed successfully"
                    );

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
                    let status_text = response.status().to_string();
                    let error_text = response
                        .text()
                        .await
                        .unwrap_or_else(|_| "Unknown error".to_string());

                    log_error!(
                        operation = "tencent_cos_upload",
                        key = %key,
                        bucket = %self.config.bucket,
                        endpoint = %self.config.endpoint,
                        status_code = status_code,
                        status_text = %status_text,
                        error_response = %error_text,
                        success = false,
                        "Upload failed with error response"
                    );

                    // Parse specific error types for Tencent COS
                    if error_text.contains("NoSuchBucket") || error_text.contains("BucketNotExists")
                    {
                        log_error!(
                            operation = "tencent_cos_upload",
                            bucket = %self.config.bucket,
                            error_type = "NoSuchBucket",
                            "Bucket does not exist - check bucket name format (should be bucketname-appid) and region"
                        );
                    } else if error_text.contains("InvalidBucketName") {
                        log_error!(
                            operation = "tencent_cos_upload",
                            bucket = %self.config.bucket,
                            error_type = "InvalidBucketName",
                            "Invalid bucket name format - should be bucketname-appid"
                        );
                    } else if error_text.contains("AccessDenied")
                        || error_text.contains("SignatureDoesNotMatch")
                    {
                        log_error!(
                            operation = "tencent_cos_upload",
                            error_type = "AccessDenied",
                            "Access denied - check SecretID, SecretKey and bucket permissions"
                        );
                    }

                    Err(crate::utils::AppError::OSSOperation(format!(
                        "Upload failed: {}",
                        error_text
                    )))
                }
            },
            "tencent_cos_upload"
        );

        result
    }

    fn get_object_url(&self, key: &str) -> String {
        if let Some(cdn_domain) = &self.config.cdn_domain {
            format!("https://{}/{}", cdn_domain, key)
        } else {
            format!(
                "https://{}.cos.{}.myqcloud.com/{}",
                self.config.bucket, self.config.region, key
            )
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

    fn get_authorization(
        &self,
        method: &str,
        uri: &str,
        headers: &HashMap<String, String>,
        query_params: &HashMap<String, String>,
    ) -> String {
        use hmac::{Hmac, Mac};
        use sha2::{Digest, Sha256};

        // 1. Create timestamp and date
        let now = chrono::Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let date_stamp = now.format("%Y%m%d").to_string();

        // 2. Create canonical request
        let host = format!(
            "{}.s3.{}.amazonaws.com",
            self.config.bucket, self.config.region
        );

        // Sort headers
        let mut canonical_headers = Vec::new();
        let mut signed_headers = Vec::new();

        let mut all_headers = headers.clone();
        all_headers.insert("host".to_string(), host.clone());
        all_headers.insert("x-amz-date".to_string(), amz_date.clone());

        let mut header_keys: Vec<_> = all_headers.keys().collect();
        header_keys.sort();

        for key in &header_keys {
            let key_lower = key.to_lowercase();
            if let Some(value) = all_headers.get(*key) {
                canonical_headers.push(format!("{}:{}", key_lower, value.trim()));
                signed_headers.push(key_lower);
            }
        }

        let canonical_headers_str = canonical_headers.join("\n");
        let signed_headers_str = signed_headers.join(";");

        // Sort query parameters
        let mut canonical_query_params = Vec::new();
        let mut param_keys: Vec<_> = query_params.keys().collect();
        param_keys.sort();

        for key in param_keys {
            if let Some(value) = query_params.get(key) {
                canonical_query_params.push(format!(
                    "{}={}",
                    urlencoding::encode(key),
                    urlencoding::encode(value)
                ));
            }
        }
        let canonical_query_string = canonical_query_params.join("&");

        // Create payload hash (for unsigned payload)
        let payload_hash = "UNSIGNED-PAYLOAD";

        let canonical_request = format!(
            "{}\n{}\n{}\n{}\n\n{}\n{}",
            method,
            uri,
            canonical_query_string,
            canonical_headers_str,
            signed_headers_str,
            payload_hash
        );

        // 3. Create string to sign
        let algorithm = "AWS4-HMAC-SHA256";
        let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, self.config.region);

        let mut hasher = Sha256::new();
        hasher.update(canonical_request.as_bytes());
        let canonical_request_hash = hex::encode(hasher.finalize());

        let string_to_sign = format!(
            "{}\n{}\n{}\n{}",
            algorithm, amz_date, credential_scope, canonical_request_hash
        );

        // 4. Calculate signature
        type HmacSha256 = Hmac<Sha256>;

        // Create signing key
        let k_secret = format!("AWS4{}", self.config.access_key_secret);
        let mut k_date = HmacSha256::new_from_slice(k_secret.as_bytes()).unwrap();
        k_date.update(date_stamp.as_bytes());
        let k_date_result = k_date.finalize().into_bytes();

        let mut k_region = HmacSha256::new_from_slice(&k_date_result).unwrap();
        k_region.update(self.config.region.as_bytes());
        let k_region_result = k_region.finalize().into_bytes();

        let mut k_service = HmacSha256::new_from_slice(&k_region_result).unwrap();
        k_service.update(b"s3");
        let k_service_result = k_service.finalize().into_bytes();

        let mut k_signing = HmacSha256::new_from_slice(&k_service_result).unwrap();
        k_signing.update(b"aws4_request");
        let signing_key = k_signing.finalize().into_bytes();

        // Calculate final signature
        let mut signature_mac = HmacSha256::new_from_slice(&signing_key).unwrap();
        signature_mac.update(string_to_sign.as_bytes());
        let signature = hex::encode(signature_mac.finalize().into_bytes());

        // 5. Create authorization header
        format!(
            "{} Credential={}/{}, SignedHeaders={}, Signature={}",
            algorithm, self.config.access_key_id, credential_scope, signed_headers_str, signature
        )
    }
}

#[async_trait]
impl OSSProviderTrait for AWSS3 {
    async fn test_connection(&self) -> Result<OSSConnectionTest> {
        println!("🔧 AWSS3: Starting authenticated connection test...");
        let url = format!(
            "https://{}.s3.{}.amazonaws.com/",
            self.config.bucket, self.config.region
        );
        println!("🌐 AWSS3: Testing URL: {}", url);

        let start_time = Instant::now();

        // Prepare headers for AWS signature V4
        let mut headers = HashMap::new();
        headers.insert(
            "content-type".to_string(),
            "application/x-amz-json-1.0".to_string(),
        );

        let query_params = HashMap::new();
        let authorization = self.get_authorization("HEAD", "/", &headers, &query_params);

        // Get the generated timestamp from authorization
        let now = chrono::Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let host = format!(
            "{}.s3.{}.amazonaws.com",
            self.config.bucket, self.config.region
        );

        println!("🔐 AWSS3: Authorization header generated");
        println!("📡 AWSS3: Sending authenticated HEAD request...");

        let response = self
            .client
            .head(&url)
            .header("Host", host)
            .header("X-Amz-Date", amz_date)
            .header("Authorization", authorization)
            .send()
            .await
            .map_err(|e| {
                println!("❌ AWSS3: HTTP request failed: {}", e);
                e
            })?;

        let status_code = response.status().as_u16();
        let latency = start_time.elapsed().as_millis() as u64;
        println!(
            "📊 AWSS3: Response status: {} ({})",
            status_code,
            response.status()
        );

        if response.status().is_success() || status_code == 403 {
            // 403 means we reached the service but authentication failed
            println!("✅ AWSS3: Connection test successful in {}ms", latency);
            let error_msg = if status_code == 403 {
                Some("Authentication failed - check credentials".to_string())
            } else {
                None
            };

            Ok(OSSConnectionTest {
                success: true,
                error: error_msg,
                latency: Some(latency),
                bucket_exists: None, // AWS doesn't provide bucket validation in simple connection test
                available_buckets: None,
            })
        } else {
            let error_msg = format!(
                "AWSS3 connection test failed with status: {}",
                response.status()
            );
            println!("❌ {}", error_msg);

            // Try to get response body for more details
            if let Ok(body) = response.text().await {
                if !body.is_empty() {
                    println!("📄 AWSS3: Response body: {}", body);
                }
            }

            Ok(OSSConnectionTest {
                success: false,
                error: Some(error_msg),
                latency: Some(latency),
                bucket_exists: None,
                available_buckets: None,
            })
        }
    }

    async fn upload(
        &self,
        key: &str,
        data: &[u8],
        content_type: &str,
        progress_callback: Option<&ProgressCallback>,
    ) -> Result<String> {
        let url = format!(
            "https://{}.s3.{}.amazonaws.com/{}",
            self.config.bucket, self.config.region, key
        );

        if let Some(callback) = progress_callback {
            callback(UploadProgress {
                image_id: key.to_string(),
                progress: 0.0,
                bytes_uploaded: 0,
                total_bytes: data.len() as u64,
                speed: None,
            });
        }

        // Prepare headers for AWS signature V4
        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), content_type.to_string());

        let query_params = HashMap::new();
        let uri = format!("/{}", key);
        let authorization = self.get_authorization("PUT", &uri, &headers, &query_params);

        // Get the generated timestamp
        let now = chrono::Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let host = format!(
            "{}.s3.{}.amazonaws.com",
            self.config.bucket, self.config.region
        );

        let response = self
            .client
            .put(&url)
            .header("Host", host)
            .header("X-Amz-Date", amz_date)
            .header("Content-Type", content_type)
            .header("Authorization", authorization)
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
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            Err(crate::utils::AppError::OSSOperation(format!(
                "Upload failed: {}",
                error_text
            )))
        }
    }

    fn get_object_url(&self, key: &str) -> String {
        if let Some(cdn_domain) = &self.config.cdn_domain {
            format!("https://{}/{}", cdn_domain, key)
        } else {
            format!(
                "https://{}.s3.{}.amazonaws.com/{}",
                self.config.bucket, self.config.region, key
            )
        }
    }
}

// Main OSS Service that manages different providers
pub struct OSSService {
    provider: Box<dyn OSSProviderTrait>,
}

impl OSSService {
    pub fn new(config: OSSConfig) -> Result<Self> {
        log_info!(
            operation = "oss_service_new",
            provider = ?config.provider,
            bucket = %config.bucket,
            endpoint = %config.endpoint,
            region = %config.region,
            "Creating OSS service with provider configuration"
        );

        let provider: Box<dyn OSSProviderTrait> = match config.provider {
            OSSProvider::Aliyun => {
                log_info!("Creating Aliyun OSS provider");
                Box::new(AliyunOSS::new(config))
            }
            OSSProvider::Tencent => {
                log_info!("Creating Tencent COS provider");
                Box::new(TencentCOS::new(config))
            }
            OSSProvider::AWS => {
                log_info!("Creating AWS S3 provider");
                Box::new(AWSS3::new(config))
            }
            OSSProvider::Custom => {
                log_error!("Custom provider not implemented");
                return Err(crate::utils::AppError::Configuration(
                    "Custom provider not implemented".to_string(),
                ));
            }
        };

        Ok(Self { provider })
    }

    pub async fn upload_image(
        &self,
        key: &str,
        data: &[u8],
        progress_callback: Option<ProgressCallback>,
    ) -> Result<String> {
        log_debug!(
            operation = "oss_service_upload_image",
            key = %key,
            data_size = data.len(),
            "Delegating upload to provider implementation"
        );

        let content_type = self.detect_content_type(data);
        log_debug!(
            detected_content_type = %content_type,
            "Content type detected"
        );

        self.provider
            .upload(key, data, &content_type, progress_callback.as_ref())
            .await
    }

    pub async fn test_connection(&self) -> Result<OSSConnectionTest> {
        println!("🔍 OSSService: Starting provider-specific connection test...");
        self.provider.test_connection().await
    }

    #[allow(dead_code)]
    pub async fn upload_multiple(
        &self,
        images: Vec<(String, Vec<u8>)>,
    ) -> Result<Vec<UploadResult>> {
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
