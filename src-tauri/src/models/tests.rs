#[cfg(test)]
mod models_tests {
    use crate::models::*;

    #[test]
    fn test_image_reference_creation() {
        let image_ref = ImageReference::new(
            "./images/test.png".to_string(),
            "/absolute/path/images/test.png".to_string(),
            10,
            5,
        );

        assert!(!image_ref.id.is_empty());
        assert_eq!(image_ref.original_path, "./images/test.png");
        assert_eq!(image_ref.absolute_path, "/absolute/path/images/test.png");
        assert_eq!(image_ref.markdown_line, 10);
        assert_eq!(image_ref.markdown_column, 5);
        assert!(!image_ref.exists); // Default value
        assert_eq!(image_ref.size, 0); // Default value
    }

    #[test]
    fn test_upload_task_creation() {
        let task = UploadTask::new("image123".to_string());

        assert!(!task.id.is_empty());
        assert_eq!(task.image_id, "image123");
        assert!(matches!(task.status, UploadStatus::Pending));
        assert_eq!(task.progress, 0.0);
        assert!(task.uploaded_url.is_none());
        assert!(task.error.is_none());
        assert!(task.start_time.is_none());
        assert!(task.end_time.is_none());
    }

    #[test]
    fn test_app_state_default() {
        let state = AppState::default();

        assert!(state.current_files.is_empty());
        assert!(state.scanned_images.is_empty());
        assert!(state.selected_images.is_empty());
        assert!(state.upload_tasks.is_empty());
        assert!(state.oss_config.is_none());
        assert!(!state.is_scanning);
        assert!(!state.is_uploading);
    }

    #[test]
    fn test_scan_result_serialization() {
        let scan_result = ScanResult {
            file_path: "/path/to/file.md".to_string(),
            images: vec![],
            status: ScanStatus::Success,
            error: None,
        };

        let json = serde_json::to_string(&scan_result).unwrap();
        let deserialized: ScanResult = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.file_path, scan_result.file_path);
        assert!(matches!(deserialized.status, ScanStatus::Success));
        assert!(deserialized.error.is_none());
    }

    #[test]
    fn test_oss_config_serialization() {
        let config = OSSConfig {
            provider: OSSProvider::Aliyun,
            endpoint: "https://oss-cn-hangzhou.aliyuncs.com".to_string(),
            access_key_id: "test_key".to_string(),
            access_key_secret: "test_secret".to_string(),
            bucket: "test-bucket".to_string(),
            region: "cn-hangzhou".to_string(),
            path_template: "images/{date}/{filename}".to_string(),
            cdn_domain: Some("https://cdn.example.com".to_string()),
            compression_enabled: true,
            compression_quality: 80,
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: OSSConfig = serde_json::from_str(&json).unwrap();

        assert!(matches!(deserialized.provider, OSSProvider::Aliyun));
        assert_eq!(deserialized.endpoint, config.endpoint);
        assert_eq!(deserialized.bucket, config.bucket);
        assert_eq!(deserialized.compression_quality, 80);
        assert!(deserialized.compression_enabled);
    }

    #[test]
    fn test_upload_result_creation() {
        let result = UploadResult {
            image_id: "img123".to_string(),
            success: true,
            uploaded_url: Some("https://example.com/image.png".to_string()),
            error: None,
        };

        assert_eq!(result.image_id, "img123");
        assert!(result.success);
        assert!(result.uploaded_url.is_some());
        assert!(result.error.is_none());
    }

    #[test]
    fn test_link_replacement_creation() {
        let replacement = LinkReplacement {
            file_path: "/path/to/file.md".to_string(),
            line: 15,
            column: 20,
            old_link: "./images/old.png".to_string(),
            new_link: "https://cdn.example.com/new.png".to_string(),
        };

        assert_eq!(replacement.file_path, "/path/to/file.md");
        assert_eq!(replacement.line, 15);
        assert_eq!(replacement.column, 20);
        assert_eq!(replacement.old_link, "./images/old.png");
        assert_eq!(replacement.new_link, "https://cdn.example.com/new.png");
    }

    #[test]
    fn test_paginated_result() {
        let items = vec!["item1".to_string(), "item2".to_string()];
        let paginated = PaginatedResult {
            items: items.clone(),
            total: 10,
            page: 1,
            page_size: 2,
            has_more: true,
        };

        assert_eq!(paginated.items.len(), 2);
        assert_eq!(paginated.total, 10);
        assert_eq!(paginated.page, 1);
        assert_eq!(paginated.page_size, 2);
        assert!(paginated.has_more);
    }

    #[test]
    fn test_validation_result() {
        let valid_result = ValidationResult {
            valid: true,
            errors: vec![],
        };

        let invalid_result = ValidationResult {
            valid: false,
            errors: vec!["Error 1".to_string(), "Error 2".to_string()],
        };

        assert!(valid_result.valid);
        assert!(valid_result.errors.is_empty());

        assert!(!invalid_result.valid);
        assert_eq!(invalid_result.errors.len(), 2);
    }
}
