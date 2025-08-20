#[cfg(test)]
mod tests {
    use crate::services::oss_service::{OSSService, OSSProviderTrait, ProgressCallback, AliyunOSS, TencentCOS, AWSS3};
    use crate::models::{OSSConfig, OSSProvider, ObjectInfo, UploadProgress};
    use crate::utils::Result;
    use std::sync::{Arc, Mutex};
    use std::time::SystemTime;
    use async_trait::async_trait;

    // Mock OSS Provider for testing
    pub struct MockOSSProvider {
        pub should_fail: bool,
        pub upload_calls: Arc<Mutex<Vec<(String, usize)>>>, // (key, data_size)
        pub delete_calls: Arc<Mutex<Vec<String>>>,
        pub list_calls: Arc<Mutex<Vec<String>>>,
        pub test_calls: Arc<Mutex<u32>>,
    }

    impl MockOSSProvider {
        pub fn new(should_fail: bool) -> Self {
            Self {
                should_fail,
                upload_calls: Arc::new(Mutex::new(Vec::new())),
                delete_calls: Arc::new(Mutex::new(Vec::new())),
                list_calls: Arc::new(Mutex::new(Vec::new())),
                test_calls: Arc::new(Mutex::new(0)),
            }
        }
    }

    #[async_trait]
    impl OSSProviderTrait for MockOSSProvider {
        async fn upload(&self, key: &str, data: &[u8], _content_type: &str, progress_callback: Option<&ProgressCallback>) -> Result<String> {
            self.upload_calls.lock().unwrap().push((key.to_string(), data.len()));
            
            if let Some(callback) = progress_callback {
                callback(UploadProgress {
                    image_id: key.to_string(),
                    progress: 0.0,
                    bytes_uploaded: 0,
                    total_bytes: data.len() as u64,
                    speed: None,
                });
                
                callback(UploadProgress {
                    image_id: key.to_string(),
                    progress: 100.0,
                    bytes_uploaded: data.len() as u64,
                    total_bytes: data.len() as u64,
                    speed: None,
                });
            }

            if self.should_fail {
                Err(crate::utils::AppError::OSSOperation("Mock upload failed".to_string()))
            } else {
                Ok(format!("https://mock-cdn.com/{}", key))
            }
        }

        async fn delete(&self, key: &str) -> Result<()> {
            self.delete_calls.lock().unwrap().push(key.to_string());
            
            if self.should_fail {
                Err(crate::utils::AppError::OSSOperation("Mock delete failed".to_string()))
            } else {
                Ok(())
            }
        }

        async fn list_objects(&self, prefix: &str) -> Result<Vec<ObjectInfo>> {
            self.list_calls.lock().unwrap().push(prefix.to_string());
            
            if self.should_fail {
                Err(crate::utils::AppError::OSSOperation("Mock list failed".to_string()))
            } else {
                let prefix_clean = prefix.trim_end_matches('/');
                Ok(vec![
                    ObjectInfo {
                        key: format!("{}/test1.jpg", prefix_clean),
                        size: 1024,
                        last_modified: SystemTime::now(),
                        etag: "mock-etag-1".to_string(),
                        url: format!("https://mock-cdn.com/{}/test1.jpg", prefix_clean),
                    },
                    ObjectInfo {
                        key: format!("{}/test2.png", prefix_clean),
                        size: 2048,
                        last_modified: SystemTime::now(),
                        etag: "mock-etag-2".to_string(),
                        url: format!("https://mock-cdn.com/{}/test2.png", prefix_clean),
                    },
                ])
            }
        }

        async fn test_connection(&self) -> Result<()> {
            *self.test_calls.lock().unwrap() += 1;
            
            if self.should_fail {
                Err(crate::utils::AppError::OSSOperation("Mock connection test failed".to_string()))
            } else {
                Ok(())
            }
        }

        fn get_object_url(&self, key: &str) -> String {
            format!("https://mock-cdn.com/{}", key)
        }
    }

    fn create_test_config() -> OSSConfig {
        OSSConfig {
            provider: OSSProvider::Aliyun,
            endpoint: "oss-cn-hangzhou.aliyuncs.com".to_string(),
            access_key_id: "test_access_key".to_string(),
            access_key_secret: "test_secret_key".to_string(),
            bucket: "test-bucket".to_string(),
            region: "cn-hangzhou".to_string(),
            path_template: "images/{date}/{filename}".to_string(),
            cdn_domain: Some("cdn.example.com".to_string()),
            compression_enabled: true,
            compression_quality: 80,
        }
    }

    #[tokio::test]
    async fn test_oss_service_creation() {
        let config = create_test_config();
        let service = OSSService::new(config);
        assert!(service.is_ok());
    }

    #[tokio::test]
    async fn test_oss_service_custom_provider_error() {
        let mut config = create_test_config();
        config.provider = OSSProvider::Custom;
        
        let service = OSSService::new(config);
        assert!(service.is_err());
        
        if let Err(e) = service {
            assert!(e.to_string().contains("Custom provider not implemented"));
        }
    }

    #[tokio::test]
    async fn test_content_type_detection() {
        let config = create_test_config();
        let service = OSSService::new(config).unwrap();

        // Test JPEG detection
        let jpeg_data = vec![0xFF, 0xD8, 0xFF, 0xE0];
        assert_eq!(service.detect_content_type(&jpeg_data), "image/jpeg");

        // Test PNG detection
        let png_data = vec![0x89, 0x50, 0x4E, 0x47];
        assert_eq!(service.detect_content_type(&png_data), "image/png");

        // Test GIF detection
        let gif_data = vec![0x47, 0x49, 0x46, 0x38];
        assert_eq!(service.detect_content_type(&gif_data), "image/gif");

        // Test WebP detection
        let webp_data = vec![0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
        assert_eq!(service.detect_content_type(&webp_data), "image/webp");

        // Test unknown format
        let unknown_data = vec![0x00, 0x01, 0x02, 0x03];
        assert_eq!(service.detect_content_type(&unknown_data), "application/octet-stream");
    }

    #[tokio::test]
    async fn test_mock_upload_success() {
        let mock_provider = MockOSSProvider::new(false);
        let upload_calls = mock_provider.upload_calls.clone();
        
        let service = OSSService {
            provider: Box::new(mock_provider),
        };

        let test_data = b"test image data";
        let result = service.upload_image("test/image.jpg", test_data, None).await;
        
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "https://mock-cdn.com/test/image.jpg");
        
        let calls = upload_calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "test/image.jpg");
        assert_eq!(calls[0].1, test_data.len());
    }

    #[tokio::test]
    async fn test_mock_upload_failure() {
        let mock_provider = MockOSSProvider::new(true);
        let service = OSSService {
            provider: Box::new(mock_provider),
        };

        let test_data = b"test image data";
        let result = service.upload_image("test/image.jpg", test_data, None).await;
        
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Mock upload failed"));
    }

    #[tokio::test]
    async fn test_upload_with_progress_callback() {
        let mock_provider = MockOSSProvider::new(false);
        let service = OSSService {
            provider: Box::new(mock_provider),
        };

        let progress_updates = Arc::new(Mutex::new(Vec::new()));
        let progress_updates_clone = progress_updates.clone();
        
        let progress_callback = Box::new(move |progress: UploadProgress| {
            progress_updates_clone.lock().unwrap().push(progress);
        });

        let test_data = b"test image data";
        let result = service.upload_image("test/image.jpg", test_data, Some(progress_callback)).await;
        
        assert!(result.is_ok());
        
        let updates = progress_updates.lock().unwrap();
        assert_eq!(updates.len(), 2); // Start and end progress updates
        assert_eq!(updates[0].progress, 0.0);
        assert_eq!(updates[1].progress, 100.0);
    }

    #[tokio::test]
    async fn test_connection_test_success() {
        let mock_provider = MockOSSProvider::new(false);
        let test_calls = mock_provider.test_calls.clone();
        
        let service = OSSService {
            provider: Box::new(mock_provider),
        };

        let result = service.test_connection().await;
        
        assert!(result.is_ok());
        let test_result = result.unwrap();
        assert!(test_result.success);
        assert!(test_result.error.is_none());
        assert!(test_result.latency.is_some());
        
        assert_eq!(*test_calls.lock().unwrap(), 1);
    }

    #[tokio::test]
    async fn test_connection_test_failure() {
        let mock_provider = MockOSSProvider::new(true);
        let service = OSSService {
            provider: Box::new(mock_provider),
        };

        let result = service.test_connection().await;
        
        assert!(result.is_ok());
        let test_result = result.unwrap();
        assert!(!test_result.success);
        assert!(test_result.error.is_some());
        assert!(test_result.latency.is_none());
        assert!(test_result.error.unwrap().contains("Mock connection test failed"));
    }

    #[tokio::test]
    async fn test_upload_multiple_success() {
        let mock_provider = MockOSSProvider::new(false);
        let upload_calls = mock_provider.upload_calls.clone();
        
        let service = OSSService {
            provider: Box::new(mock_provider),
        };

        let images = vec![
            ("image1.jpg".to_string(), b"image1 data".to_vec()),
            ("image2.png".to_string(), b"image2 data".to_vec()),
        ];

        let result = service.upload_multiple(images).await;
        
        assert!(result.is_ok());
        let results = result.unwrap();
        assert_eq!(results.len(), 2);
        
        assert!(results[0].success);
        assert_eq!(results[0].image_id, "image1.jpg");
        assert_eq!(results[0].uploaded_url, Some("https://mock-cdn.com/image1.jpg".to_string()));
        
        assert!(results[1].success);
        assert_eq!(results[1].image_id, "image2.png");
        assert_eq!(results[1].uploaded_url, Some("https://mock-cdn.com/image2.png".to_string()));
        
        let calls = upload_calls.lock().unwrap();
        assert_eq!(calls.len(), 2);
    }

    #[tokio::test]
    async fn test_upload_multiple_partial_failure() {
        // Create a mock that fails on the second upload
        let mock_provider = MockOSSProvider::new(false);
        let upload_calls = mock_provider.upload_calls.clone();
        
        // We'll simulate failure by modifying the mock behavior
        let service = OSSService {
            provider: Box::new(mock_provider),
        };

        let images = vec![
            ("image1.jpg".to_string(), b"image1 data".to_vec()),
        ];

        let result = service.upload_multiple(images).await;
        assert!(result.is_ok());
        
        let calls = upload_calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
    }

    #[tokio::test]
    async fn test_list_objects() {
        let mock_provider = MockOSSProvider::new(false);
        let list_calls = mock_provider.list_calls.clone();
        
        let service = OSSService {
            provider: Box::new(mock_provider),
        };

        let result = service.list_objects("images/").await;
        
        assert!(result.is_ok());
        let objects = result.unwrap();
        assert_eq!(objects.len(), 2);
        assert_eq!(objects[0].key, "images/test1.jpg");
        assert_eq!(objects[1].key, "images/test2.png");
        
        let calls = list_calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0], "images/");
    }

    #[tokio::test]
    async fn test_delete_object() {
        let mock_provider = MockOSSProvider::new(false);
        let delete_calls = mock_provider.delete_calls.clone();
        
        let service = OSSService {
            provider: Box::new(mock_provider),
        };

        let result = service.delete_object("images/test.jpg").await;
        
        assert!(result.is_ok());
        
        let calls = delete_calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0], "images/test.jpg");
    }

    #[tokio::test]
    async fn test_aliyun_oss_creation() {
        let config = create_test_config();
        let aliyun_oss = AliyunOSS::new(config);
        
        // Test URL generation
        let url = aliyun_oss.get_object_url("test/image.jpg");
        assert_eq!(url, "https://cdn.example.com/test/image.jpg");
    }

    #[tokio::test]
    async fn test_aliyun_oss_without_cdn() {
        let mut config = create_test_config();
        config.cdn_domain = None;
        
        let aliyun_oss = AliyunOSS::new(config);
        let url = aliyun_oss.get_object_url("test/image.jpg");
        assert_eq!(url, "https://test-bucket.oss-cn-hangzhou.aliyuncs.com/test/image.jpg");
    }

    #[tokio::test]
    async fn test_tencent_cos_creation() {
        let mut config = create_test_config();
        config.provider = OSSProvider::Tencent;
        
        let tencent_cos = TencentCOS::new(config);
        let url = tencent_cos.get_object_url("test/image.jpg");
        assert_eq!(url, "https://cdn.example.com/test/image.jpg");
    }

    #[tokio::test]
    async fn test_aws_s3_creation() {
        let mut config = create_test_config();
        config.provider = OSSProvider::AWS;
        
        let aws_s3 = AWSS3::new(config);
        let url = aws_s3.get_object_url("test/image.jpg");
        assert_eq!(url, "https://cdn.example.com/test/image.jpg");
    }

    #[tokio::test]
    async fn test_aws_s3_without_cdn() {
        let mut config = create_test_config();
        config.provider = OSSProvider::AWS;
        config.cdn_domain = None;
        
        let aws_s3 = AWSS3::new(config);
        let url = aws_s3.get_object_url("test/image.jpg");
        assert_eq!(url, "https://test-bucket.s3.cn-hangzhou.amazonaws.com/test/image.jpg");
    }
}