#[cfg(test)]
mod tests {
    use crate::commands::*;
    use crate::models::*;
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

    // Helper function to create a temporary markdown file
    fn create_temp_markdown_file(content: &str) -> (TempDir, String) {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.md");
        let mut file = fs::File::create(&file_path).unwrap();
        file.write_all(content.as_bytes()).unwrap();
        (temp_dir, file_path.to_string_lossy().to_string())
    }

    // Helper function to create a temporary image file
    fn create_temp_image_file() -> (TempDir, String) {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.png");

        // Create a minimal PNG file (1x1 pixel)
        let png_data = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
            0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
            0x49, 0x48, 0x44, 0x52, // IHDR
            0x00, 0x00, 0x00, 0x01, // Width: 1
            0x00, 0x00, 0x00, 0x01, // Height: 1
            0x08, 0x02, 0x00, 0x00, 0x00, // Bit depth, color type, etc.
            0x90, 0x77, 0x53, 0xDE, // CRC
            0x00, 0x00, 0x00, 0x0C, // IDAT chunk length
            0x49, 0x44, 0x41, 0x54, // IDAT
            0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, // Data
            0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, // CRC
            0x00, 0x00, 0x00, 0x00, // IEND chunk length
            0x49, 0x45, 0x4E, 0x44, // IEND
            0xAE, 0x42, 0x60, 0x82, // CRC
        ];

        fs::write(&file_path, png_data).unwrap();
        (temp_dir, file_path.to_string_lossy().to_string())
    }

    // Helper function to create a test OSS config
    fn create_test_oss_config() -> OSSConfig {
        OSSConfig {
            provider: OSSProvider::Aliyun,
            endpoint: "https://oss-cn-hangzhou.aliyuncs.com".to_string(),
            access_key_id: "test_key_id".to_string(),
            access_key_secret: "test_key_secret".to_string(),
            bucket: "test-bucket".to_string(),
            region: "cn-hangzhou".to_string(),
            path_template: "images/{date}/{filename}".to_string(),
            cdn_domain: Some("https://cdn.example.com".to_string()),
            compression_enabled: true,
            compression_quality: 80,
        }
    }

    // ============================================================================
    // Parameter Validation Tests
    // ============================================================================

    #[test]
    fn test_validate_file_paths_empty() {
        let result = validate_file_paths(&[]);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("cannot be empty"));
    }

    #[test]
    fn test_validate_file_paths_too_many() {
        let paths: Vec<String> = (0..101).map(|i| format!("file{}.md", i)).collect();
        let result = validate_file_paths(&paths);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Too many files"));
    }

    #[test]
    fn test_validate_file_paths_path_traversal() {
        let paths = vec!["../../../etc/passwd".to_string()];
        let result = validate_file_paths(&paths);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Invalid file path"));
    }

    #[test]
    fn test_validate_file_paths_nonexistent() {
        let paths = vec!["/nonexistent/file.md".to_string()];
        let result = validate_file_paths(&paths);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("File not found"));
    }

    #[test]
    fn test_validate_image_ids_empty() {
        let result = validate_image_ids(&[]);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("cannot be empty"));
    }

    #[test]
    fn test_validate_image_ids_too_many() {
        let ids: Vec<String> = (0..51)
            .map(|i| format!("12345678-1234-1234-1234-12345678901{:01}", i))
            .collect();
        let result = validate_image_ids(&ids);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Too many images"));
    }

    #[test]
    fn test_validate_image_ids_invalid_format() {
        let ids = vec!["invalid-id".to_string()];
        let result = validate_image_ids(&ids);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Invalid image ID format"));
    }

    #[test]
    fn test_validate_image_ids_valid() {
        let ids = vec!["12345678-1234-1234-1234-123456789012".to_string()];
        let result = validate_image_ids(&ids);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_oss_config_empty_endpoint() {
        let mut config = create_test_oss_config();
        config.endpoint = "".to_string();
        let result = validate_oss_config_params(&config);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("endpoint cannot be empty"));
    }

    #[test]
    fn test_validate_oss_config_invalid_endpoint() {
        let mut config = create_test_oss_config();
        config.endpoint = "invalid-url".to_string();
        let result = validate_oss_config_params(&config);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("must be a valid URL"));
    }

    #[test]
    fn test_validate_oss_config_invalid_compression_quality() {
        let mut config = create_test_oss_config();
        config.compression_quality = 150;
        let result = validate_oss_config_params(&config);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("must be between 0-100"));
    }

    #[test]
    fn test_validate_oss_config_valid() {
        let config = create_test_oss_config();
        let result = validate_oss_config_params(&config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_pagination_zero_page() {
        let result = validate_pagination(Some(0), Some(20));
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("must be greater than 0"));
    }

    #[test]
    fn test_validate_pagination_zero_page_size() {
        let result = validate_pagination(Some(1), Some(0));
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("must be between 1-100"));
    }

    #[test]
    fn test_validate_pagination_large_page_size() {
        let result = validate_pagination(Some(1), Some(150));
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("must be between 1-100"));
    }

    #[test]
    fn test_validate_pagination_valid() {
        let result = validate_pagination(Some(2), Some(50));
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), (2, 50));
    }

    #[test]
    fn test_validate_pagination_defaults() {
        let result = validate_pagination(None, None);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), (1, 20));
    }

    // ============================================================================
    // Command Integration Tests
    // ============================================================================

    #[tokio::test]
    async fn test_scan_markdown_files_empty_paths() {
        let result = scan_markdown_files(vec![]).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_scan_markdown_files_invalid_path() {
        let result = scan_markdown_files(vec!["../invalid.md".to_string()]).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid file path"));
    }

    #[tokio::test]
    async fn test_get_image_info_empty_path() {
        let result = get_image_info("".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_get_image_info_invalid_path() {
        let result = get_image_info("../invalid.png".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid image path"));
    }

    #[tokio::test]
    async fn test_get_image_info_nonexistent() {
        let result = get_image_info("/nonexistent/image.png".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[tokio::test]
    async fn test_generate_thumbnail_empty_path() {
        let result = generate_thumbnail("".to_string(), 100).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_generate_thumbnail_invalid_size() {
        let (_temp_dir, image_path) = create_temp_image_file();
        let result = generate_thumbnail(image_path, 0).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be between 1-1024"));
    }

    #[tokio::test]
    async fn test_generate_thumbnail_large_size() {
        let (_temp_dir, image_path) = create_temp_image_file();
        let result = generate_thumbnail(image_path, 2000).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be between 1-1024"));
    }

    #[tokio::test]
    async fn test_upload_images_empty_ids() {
        let config = create_test_oss_config();
        let result = upload_images(vec![], config).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_upload_images_invalid_config() {
        let mut config = create_test_oss_config();
        config.endpoint = "".to_string();
        let ids = vec!["12345678-1234-1234-1234-123456789012".to_string()];
        let result = upload_images(ids, config).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("endpoint cannot be empty"));
    }

    #[tokio::test]
    async fn test_get_upload_progress_empty_id() {
        let result = get_upload_progress("".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_get_upload_progress_invalid_id() {
        let result = get_upload_progress("invalid-id".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid task ID format"));
    }

    #[tokio::test]
    async fn test_cancel_upload_empty_id() {
        let result = cancel_upload("".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_retry_upload_empty_id() {
        let result = retry_upload("".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_save_oss_config_invalid() {
        let mut config = create_test_oss_config();
        config.bucket = "".to_string();
        let result = save_oss_config(config).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Bucket name cannot be empty"));
    }

    #[tokio::test]
    async fn test_test_oss_connection_invalid() {
        let mut config = create_test_oss_config();
        config.access_key_id = "".to_string();
        let result = test_oss_connection(config).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Access key ID cannot be empty"));
    }

    #[tokio::test]
    async fn test_validate_oss_config_invalid() {
        let mut config = create_test_oss_config();
        config.region = "".to_string();
        let result = validate_oss_config(config).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Region cannot be empty"));
    }

    #[tokio::test]
    async fn test_list_oss_objects_invalid_config() {
        let mut config = create_test_oss_config();
        config.endpoint = "invalid-url".to_string();
        let result = list_oss_objects(config, "prefix".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be a valid URL"));
    }

    #[tokio::test]
    async fn test_list_oss_objects_long_prefix() {
        let config = create_test_oss_config();
        let long_prefix = "a".repeat(1001);
        let result = list_oss_objects(config, long_prefix).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Prefix too long"));
    }

    #[tokio::test]
    async fn test_replace_markdown_links_empty() {
        let result = replace_markdown_links(vec![]).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_replace_markdown_links_too_many() {
        let replacements: Vec<LinkReplacement> = (0..1001)
            .map(|i| LinkReplacement {
                file_path: format!("file{}.md", i),
                line: 1,
                column: 1,
                old_link: "old".to_string(),
                new_link: "new".to_string(),
            })
            .collect();
        let result = replace_markdown_links(replacements).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Too many replacements"));
    }

    #[tokio::test]
    async fn test_replace_markdown_links_invalid_path() {
        let replacements = vec![LinkReplacement {
            file_path: "../invalid.md".to_string(),
            line: 1,
            column: 1,
            old_link: "old".to_string(),
            new_link: "new".to_string(),
        }];
        let result = replace_markdown_links(replacements).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid file path"));
    }

    #[tokio::test]
    async fn test_create_backup_empty_path() {
        let result = create_backup("".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_create_backup_invalid_path() {
        let result = create_backup("../invalid.md".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid file path"));
    }

    #[tokio::test]
    async fn test_restore_from_backup_empty_id() {
        let result = restore_from_backup("".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_restore_from_backup_invalid_id() {
        let result = restore_from_backup("invalid-id".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid backup ID format"));
    }

    #[tokio::test]
    async fn test_list_backups_invalid_path() {
        let result = list_backups(Some("../invalid.md".to_string())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid file path"));
    }

    #[tokio::test]
    async fn test_get_upload_history_invalid_pagination() {
        let result = get_upload_history(Some(0), Some(20)).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be greater than 0"));
    }

    #[tokio::test]
    async fn test_get_upload_history_valid_pagination() {
        let result = get_upload_history(Some(2), Some(10)).await;
        assert!(result.is_ok());
        let paginated = result.unwrap();
        assert_eq!(paginated.page, 2);
        assert_eq!(paginated.page_size, 10);
    }

    #[tokio::test]
    async fn test_validate_file_path_empty() {
        let result = validate_file_path("".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_validate_file_path_invalid() {
        let result = validate_file_path("../invalid".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid file path"));
    }

    #[tokio::test]
    async fn test_validate_file_path_nonexistent() {
        let result = validate_file_path("/nonexistent/file".to_string()).await;
        assert!(result.is_ok());
        assert!(!result.unwrap()); // Should return false for non-existent files
    }

    #[tokio::test]
    async fn test_get_file_size_empty() {
        let result = get_file_size("".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_get_file_size_invalid_path() {
        let result = get_file_size("../invalid".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid file path"));
    }

    #[tokio::test]
    async fn test_get_file_size_nonexistent() {
        let result = get_file_size("/nonexistent/file".to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[tokio::test]
    async fn test_get_app_version() {
        let result = get_app_version().await;
        assert!(result.is_ok());
        let version = result.unwrap();
        assert!(!version.is_empty());
        assert_eq!(version, env!("CARGO_PKG_VERSION"));
    }

    // ============================================================================
    // Integration Tests with Real Files
    // ============================================================================

    #[tokio::test]
    async fn test_create_backup_with_real_file() {
        let (_temp_dir, file_path) = create_temp_markdown_file("# Test\n![image](./test.png)");
        let result = create_backup(file_path).await;
        // The backup function might succeed or fail depending on implementation
        // but validation should pass (no validation errors)
        match result {
            Ok(_) => {
                // Backup succeeded, which is fine
            }
            Err(error_msg) => {
                // If it fails, it shouldn't be due to validation errors
                assert!(!error_msg.contains("cannot be empty"));
                assert!(!error_msg.contains("Invalid file path"));
            }
        }
    }

    #[tokio::test]
    async fn test_get_file_size_with_real_file() {
        let (_temp_dir, file_path) = create_temp_markdown_file("# Test Content");
        let result = get_file_size(file_path).await;
        assert!(result.is_ok());
        assert!(result.unwrap() > 0);
    }

    #[tokio::test]
    async fn test_validate_file_path_with_real_file() {
        let (_temp_dir, file_path) = create_temp_markdown_file("# Test");
        let result = validate_file_path(file_path).await;
        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    // ============================================================================
    // Link Replacement Command Tests
    // ============================================================================

    #[tokio::test]
    async fn test_replace_markdown_links_with_result_empty() {
        let result = replace_markdown_links_with_result(vec![]).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_replace_markdown_links_with_result_too_many() {
        let replacements: Vec<LinkReplacement> = (0..1001)
            .map(|i| LinkReplacement {
                file_path: format!("file{}.md", i),
                line: 1,
                column: 1,
                old_link: "old".to_string(),
                new_link: "new".to_string(),
            })
            .collect();
        let result = replace_markdown_links_with_result(replacements).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Too many replacements"));
    }

    #[tokio::test]
    async fn test_replace_markdown_links_with_result_invalid_path() {
        let replacements = vec![LinkReplacement {
            file_path: "../invalid.md".to_string(),
            line: 1,
            column: 1,
            old_link: "old".to_string(),
            new_link: "new".to_string(),
        }];
        let result = replace_markdown_links_with_result(replacements).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid file path"));
    }

    #[tokio::test]
    async fn test_replace_markdown_links_with_result_empty_old_link() {
        let (_temp_dir, file_path) = create_temp_markdown_file("# Test");
        let replacements = vec![LinkReplacement {
            file_path,
            line: 1,
            column: 1,
            old_link: "".to_string(),
            new_link: "new".to_string(),
        }];
        let result = replace_markdown_links_with_result(replacements).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Old link cannot be empty"));
    }

    #[tokio::test]
    async fn test_replace_markdown_links_with_result_empty_new_link() {
        let (_temp_dir, file_path) = create_temp_markdown_file("# Test");
        let replacements = vec![LinkReplacement {
            file_path,
            line: 1,
            column: 1,
            old_link: "old".to_string(),
            new_link: "".to_string(),
        }];
        let result = replace_markdown_links_with_result(replacements).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("New link cannot be empty"));
    }

    #[tokio::test]
    async fn test_replace_markdown_links_with_result_nonexistent_file() {
        let replacements = vec![LinkReplacement {
            file_path: "/nonexistent/file.md".to_string(),
            line: 1,
            column: 1,
            old_link: "old".to_string(),
            new_link: "new".to_string(),
        }];
        let result = replace_markdown_links_with_result(replacements).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("File not found"));
    }

    #[tokio::test]
    async fn test_replace_single_file_links_empty_path() {
        let result = replace_single_file_links("".to_string(), vec![]).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_replace_single_file_links_empty_replacements() {
        let (_temp_dir, file_path) = create_temp_markdown_file("# Test");
        let result = replace_single_file_links(file_path, vec![]).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_replace_single_file_links_too_many() {
        let (_temp_dir, file_path) = create_temp_markdown_file("# Test");
        let replacements: Vec<LinkReplacement> = (0..101)
            .map(|i| LinkReplacement {
                file_path: file_path.clone(),
                line: 1,
                column: i + 1,
                old_link: format!("old{}", i),
                new_link: format!("new{}", i),
            })
            .collect();
        let result = replace_single_file_links(file_path, replacements).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Too many replacements"));
    }

    #[tokio::test]
    async fn test_replace_single_file_links_mismatched_file() {
        let (_temp_dir, file_path) = create_temp_markdown_file("# Test");
        let replacements = vec![LinkReplacement {
            file_path: "/different/file.md".to_string(),
            line: 1,
            column: 1,
            old_link: "old".to_string(),
            new_link: "new".to_string(),
        }];
        let result = replace_single_file_links(file_path, replacements).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be for the same file"));
    }

    #[tokio::test]
    async fn test_replace_single_file_links_invalid_path() {
        let replacements = vec![LinkReplacement {
            file_path: "../invalid.md".to_string(),
            line: 1,
            column: 1,
            old_link: "old".to_string(),
            new_link: "new".to_string(),
        }];
        let result = replace_single_file_links("../invalid.md".to_string(), replacements).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid file path"));
    }

    #[tokio::test]
    async fn test_rollback_file_changes_empty() {
        let result = rollback_file_changes(vec![]).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[tokio::test]
    async fn test_rollback_file_changes_too_many() {
        let backups: Vec<BackupInfo> = (0..51)
            .map(|i| BackupInfo {
                id: format!("12345678-1234-1234-1234-12345678901{:01}", i),
                original_path: format!("file{}.md", i),
                backup_path: format!("backup{}.backup", i),
                timestamp: chrono::Utc::now(),
                size: 100,
                checksum: None,
            })
            .collect();
        let result = rollback_file_changes(backups).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Too many backups"));
    }

    #[tokio::test]
    async fn test_rollback_file_changes_empty_backup_path() {
        let backups = vec![BackupInfo {
            id: "12345678-1234-1234-1234-123456789012".to_string(),
            original_path: "file.md".to_string(),
            backup_path: "".to_string(),
            timestamp: chrono::Utc::now(),
            size: 100,
            checksum: None,
        }];
        let result = rollback_file_changes(backups).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Backup path cannot be empty"));
    }

    #[tokio::test]
    async fn test_rollback_file_changes_empty_original_path() {
        let backups = vec![BackupInfo {
            id: "12345678-1234-1234-1234-123456789012".to_string(),
            original_path: "".to_string(),
            backup_path: "backup.backup".to_string(),
            timestamp: chrono::Utc::now(),
            size: 100,
            checksum: None,
        }];
        let result = rollback_file_changes(backups).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Original path cannot be empty"));
    }

    #[tokio::test]
    async fn test_rollback_file_changes_invalid_backup_path() {
        let backups = vec![BackupInfo {
            id: "12345678-1234-1234-1234-123456789012".to_string(),
            original_path: "file.md".to_string(),
            backup_path: "../invalid.backup".to_string(),
            timestamp: chrono::Utc::now(),
            size: 100,
            checksum: None,
        }];
        let result = rollback_file_changes(backups).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid backup path"));
    }

    #[tokio::test]
    async fn test_rollback_file_changes_invalid_original_path() {
        let backups = vec![BackupInfo {
            id: "12345678-1234-1234-1234-123456789012".to_string(),
            original_path: "../invalid.md".to_string(),
            backup_path: "backup.backup".to_string(),
            timestamp: chrono::Utc::now(),
            size: 100,
            checksum: None,
        }];
        let result = rollback_file_changes(backups).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid original path"));
    }

    #[tokio::test]
    async fn test_rollback_file_changes_nonexistent_backup() {
        let backups = vec![BackupInfo {
            id: "12345678-1234-1234-1234-123456789012".to_string(),
            original_path: "file.md".to_string(),
            backup_path: "/nonexistent/backup.backup".to_string(),
            timestamp: chrono::Utc::now(),
            size: 100,
            checksum: None,
        }];
        let result = rollback_file_changes(backups).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Backup file not found"));
    }

    // ============================================================================
    // Integration Tests for Link Replacement with Real Files
    // ============================================================================

    #[tokio::test]
    async fn test_replace_markdown_links_with_result_real_file() {
        let content = "Here's an image: ![Alt text](./test.png)";
        let (_temp_dir, file_path) = create_temp_markdown_file(content);

        let replacements = vec![LinkReplacement {
            file_path: file_path.clone(),
            line: 1,
            column: 31,
            old_link: "./test.png".to_string(),
            new_link: "https://cdn.example.com/test.png".to_string(),
        }];

        let result = replace_markdown_links_with_result(replacements).await;
        assert!(result.is_ok());

        let batch_result = result.unwrap();
        assert_eq!(batch_result.total_files, 1);
        assert_eq!(batch_result.total_successful_replacements, 1);
        assert_eq!(batch_result.total_failed_replacements, 0);

        // Verify the file was actually modified
        let updated_content = std::fs::read_to_string(&file_path).unwrap();
        assert!(updated_content.contains("https://cdn.example.com/test.png"));
        assert!(!updated_content.contains("./test.png"));
    }

    #[tokio::test]
    async fn test_replace_single_file_links_real_file() {
        let content = "![Image 1](./img1.png) and ![Image 2](./img2.jpg)";
        let (_temp_dir, file_path) = create_temp_markdown_file(content);

        let replacements = vec![
            LinkReplacement {
                file_path: file_path.clone(),
                line: 1,
                column: 13,
                old_link: "./img1.png".to_string(),
                new_link: "https://cdn.example.com/img1.png".to_string(),
            },
            LinkReplacement {
                file_path: file_path.clone(),
                line: 1,
                column: 43,
                old_link: "./img2.jpg".to_string(),
                new_link: "https://cdn.example.com/img2.jpg".to_string(),
            },
        ];

        let result = replace_single_file_links(file_path.clone(), replacements).await;
        assert!(result.is_ok());

        let replacement_result = result.unwrap();
        assert_eq!(replacement_result.successful_replacements, 2);
        assert_eq!(replacement_result.failed_replacements.len(), 0);
        assert_eq!(replacement_result.total_replacements, 2);

        // Verify the file was actually modified
        let updated_content = std::fs::read_to_string(&file_path).unwrap();
        assert!(updated_content.contains("https://cdn.example.com/img1.png"));
        assert!(updated_content.contains("https://cdn.example.com/img2.jpg"));
        assert!(!updated_content.contains("./img1.png"));
        assert!(!updated_content.contains("./img2.jpg"));

        // Verify backup was created
        assert!(!replacement_result.backup_info.backup_path.is_empty());
        assert!(std::path::Path::new(&replacement_result.backup_info.backup_path).exists());
    }
}
