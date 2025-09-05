use crate::models::{
    BatchReplacementResult, ImageReference, LinkReplacement, ReplacementError, ReplacementResult,
    ScanResult, ScanStatus,
};
use crate::services::ImageService;
use crate::utils::{AppError, Result};
use crate::{log_debug, log_error, log_info, log_warn};
use regex::Regex;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tokio::fs as async_fs;

pub struct FileService {
    // Regex patterns for matching image references in Markdown
    image_patterns: Vec<Regex>,
    #[allow(dead_code)]
    image_service: ImageService,
}

impl FileService {
    pub fn new() -> Result<Self> {
        // Create regex patterns for different image reference formats (case-insensitive)
        let image_patterns = vec![
            // ![alt text](path/to/image.jpg) - path is in group 1
            Regex::new(r"(?i)!\[[^\]]*\]\(([^)]+\.(jpg|jpeg|png|gif|bmp|webp|svg))\)")?,
            // ![alt text](path/to/image.jpg "title") - path is in group 1
            Regex::new(
                r#"(?i)!\[[^\]]*\]\(([^)]+\.(jpg|jpeg|png|gif|bmp|webp|svg))\s+["'][^"']*["']\)"#,
            )?,
            // <img src="path/to/image.jpg" /> - path is in group 1
            Regex::new(
                r#"(?i)<img[^>]+src=["']([^"']*\.(jpg|jpeg|png|gif|bmp|webp|svg))["'][^>]*/?>"#,
            )?,
        ];

        Ok(Self {
            image_patterns,
            image_service: ImageService::new(),
        })
    }

    /// Scan multiple markdown files and extract image references
    pub async fn scan_markdown_files(&self, file_paths: Vec<String>) -> Result<Vec<ScanResult>> {
        let mut results = Vec::new();

        for file_path in file_paths {
            let result = self.scan_single_file(&file_path).await;
            results.push(result);
        }

        Ok(results)
    }

    /// Scan a single markdown file
    async fn scan_single_file(&self, file_path: &str) -> ScanResult {
        match self.scan_file_internal(file_path).await {
            Ok(images) => ScanResult {
                file_path: file_path.to_string(),
                images,
                status: ScanStatus::Success,
                error: None,
            },
            Err(e) => ScanResult {
                file_path: file_path.to_string(),
                images: vec![],
                status: ScanStatus::Error,
                error: Some(e.to_string()),
            },
        }
    }

    /// Internal implementation for scanning a file
    async fn scan_file_internal(&self, file_path: &str) -> Result<Vec<ImageReference>> {
        // Read file content
        let content = async_fs::read_to_string(file_path).await?;

        // Extract image references with file path context
        let mut images = self.extract_image_references(&content).await?;

        // Resolve relative paths and validate existence
        let base_dir = Path::new(file_path)
            .parent()
            .ok_or_else(|| AppError::FileSystem("Invalid file path".to_string()))?;

        for image in &mut images {
            // Resolve absolute path
            let absolute_path = if Path::new(&image.original_path).is_absolute() {
                PathBuf::from(&image.original_path)
            } else {
                base_dir.join(&image.original_path)
            };

            image.absolute_path = absolute_path.to_string_lossy().to_string();

            // Validate file existence and get metadata
            if let Ok(metadata) = fs::metadata(&absolute_path) {
                image.exists = true;
                image.size = metadata.len();
                image.last_modified = metadata.modified().unwrap_or(SystemTime::now());

                println!("Processing image: {}", &image.absolute_path);
                // 移除缩略图生成，直接使用原图预览
            } else {
                image.exists = false;
                image.size = 0;
                image.last_modified = SystemTime::now();
            }
        }

        Ok(images)
    }

    /// Extract image references from markdown content
    pub async fn extract_image_references(&self, content: &str) -> Result<Vec<ImageReference>> {
        let mut images = Vec::new();

        // Split content into lines for line/column tracking
        let lines: Vec<&str> = content.lines().collect();

        for (line_idx, line) in lines.iter().enumerate() {
            for pattern in &self.image_patterns {
                for capture in pattern.captures_iter(line) {
                    // Get the path from group 1 (which contains the full path for all patterns)
                    let path_match = capture.get(1).unwrap();
                    let image_path = path_match.as_str().to_string();

                    // Skip URLs (http/https)
                    if image_path.starts_with("http://") || image_path.starts_with("https://") {
                        continue;
                    }

                    let image_ref = ImageReference::new(
                        image_path,
                        String::new(),          // Will be set in scan_file_internal
                        line_idx + 1,           // Line numbers are 1-based
                        path_match.start() + 1, // Column numbers are 1-based
                    );

                    images.push(image_ref);
                }
            }
        }

        Ok(images)
    }

    /// Replace image links in a markdown file
    pub async fn replace_image_links(
        &self,
        file_path: &str,
        replacements: Vec<LinkReplacement>,
    ) -> Result<ReplacementResult> {
        log_info!(
            operation = "replace_image_links",
            file_path = %file_path,
            replacement_count = replacements.len(),
            "Starting image link replacement for file"
        );

        // Validate file exists
        let path = Path::new(file_path);
        if !path.exists() {
            log_error!(
                operation = "replace_image_links",
                file_path = %file_path,
                "File not found"
            );
            return Err(AppError::FileSystem(format!(
                "File not found: {}",
                file_path
            )));
        }

        log_debug!(
            operation = "replace_image_links",
            file_path = %file_path,
            "File exists, proceeding with replacements"
        );

        // Read file content
        let content = async_fs::read_to_string(file_path).await?;
        let lines: Vec<&str> = content.lines().collect();
        let mut modified_lines = lines
            .iter()
            .map(|&s| s.to_string())
            .collect::<Vec<String>>();

        log_debug!(
            operation = "replace_image_links",
            file_path = %file_path,
            total_lines = lines.len(),
            content_length = content.len(),
            "File content loaded"
        );

        let mut successful_replacements = 0;
        let mut failed_replacements = Vec::new();

        // Group replacements by file path (should all be the same file in this call)
        let file_replacements: Vec<&LinkReplacement> = replacements
            .iter()
            .filter(|r| r.file_path == file_path)
            .collect();

        log_debug!(
            operation = "replace_image_links",
            file_path = %file_path,
            filtered_replacements = file_replacements.len(),
            original_replacements = replacements.len(),
            "Filtered replacements for current file"
        );

        // Sort replacements by line number (descending) and column (descending)
        // to avoid offset issues when replacing multiple items on the same line
        let mut sorted_replacements = file_replacements.clone();
        sorted_replacements.sort_by(|a, b| match b.line.cmp(&a.line) {
            std::cmp::Ordering::Equal => b.column.cmp(&a.column),
            other => other,
        });

        log_debug!(
            operation = "replace_image_links",
            file_path = %file_path,
            "Replacements sorted by line and column (descending)"
        );

        for (replacement_index, replacement) in sorted_replacements.iter().enumerate() {
            log_debug!(
                operation = "process_replacement",
                replacement_index = replacement_index,
                file_path = %file_path,
                line = replacement.line,
                column = replacement.column,
                old_link = %replacement.old_link,
                new_link = %replacement.new_link,
                "Processing individual replacement"
            );

            // Validate line number
            if replacement.line == 0 || replacement.line > modified_lines.len() {
                log_warn!(
                    operation = "replacement_validation_failed",
                    file_path = %file_path,
                    line = replacement.line,
                    total_lines = modified_lines.len(),
                    error = "Invalid line number",
                    "Line number validation failed"
                );

                failed_replacements.push(ReplacementError {
                    replacement: (*replacement).clone(),
                    error: format!("Invalid line number: {}", replacement.line),
                });
                continue;
            }

            let line_index = replacement.line - 1; // Convert to 0-based index
            let line = &modified_lines[line_index];

            log_debug!(
                operation = "process_replacement",
                file_path = %file_path,
                line_index = line_index,
                line_content = %line,
                "Retrieved line content"
            );

            // Find the old link in the line
            if let Some(start_pos) = line.find(&replacement.old_link) {
                log_debug!(
                    operation = "find_old_link",
                    file_path = %file_path,
                    old_link = %replacement.old_link,
                    found_position = start_pos,
                    expected_column = replacement.column,
                    "Found old link in line"
                );

                // Verify the position matches approximately (allow some tolerance for column differences)
                let expected_pos = replacement.column.saturating_sub(1); // Convert to 0-based
                if start_pos.abs_diff(expected_pos) <= 5 {
                    // Allow 5 character tolerance
                    // Replace the old link with the new link
                    let new_line = line.replace(&replacement.old_link, &replacement.new_link);
                    modified_lines[line_index] = new_line.clone();
                    successful_replacements += 1;

                    log_info!(
                        operation = "replacement_success",
                        file_path = %file_path,
                        line = replacement.line,
                        old_link = %replacement.old_link,
                        new_link = %replacement.new_link,
                        new_line = %new_line,
                        "Successfully replaced link"
                    );
                } else {
                    log_warn!(
                        operation = "replacement_position_mismatch",
                        file_path = %file_path,
                        line = replacement.line,
                        expected_position = replacement.column,
                        found_position = start_pos + 1,
                        old_link = %replacement.old_link,
                        "Link position mismatch"
                    );

                    failed_replacements.push(ReplacementError {
                        replacement: (*replacement).clone(),
                        error: format!(
                            "Link position mismatch. Expected around column {}, found at {}",
                            replacement.column,
                            start_pos + 1
                        ),
                    });
                }
            } else {
                log_error!(
                    operation = "replacement_link_not_found",
                    file_path = %file_path,
                    line = replacement.line,
                    line_content = %line,
                    old_link = %replacement.old_link,
                    "Old link not found in line"
                );

                failed_replacements.push(ReplacementError {
                    replacement: (*replacement).clone(),
                    error: format!("Old link not found in line: '{}'", replacement.old_link),
                });
            }
        }

        // Write the modified content back to file
        let new_content = modified_lines.join("\n");
        async_fs::write(file_path, new_content).await?;

        Ok(ReplacementResult {
            file_path: file_path.to_string(),
            total_replacements: file_replacements.len(),
            successful_replacements,
            failed_replacements,
            duration: std::time::SystemTime::now(),
        })
    }

    /// Replace image links in multiple markdown files (batch operation)
    pub async fn replace_image_links_batch(
        &self,
        replacements: Vec<LinkReplacement>,
    ) -> Result<BatchReplacementResult> {
        log_info!(
            operation = "replace_image_links_batch",
            replacement_count = replacements.len(),
            "Starting batch image link replacement"
        );

        let start_time = std::time::Instant::now();

        // Group replacements by file path
        let mut file_groups: std::collections::HashMap<String, Vec<LinkReplacement>> =
            std::collections::HashMap::new();
        for (index, replacement) in replacements.into_iter().enumerate() {
            log_debug!(
                operation = "group_replacements",
                replacement_index = index,
                file_path = %replacement.file_path,
                old_link = %replacement.old_link,
                new_link = %replacement.new_link,
                line = replacement.line,
                column = replacement.column,
                "Processing replacement"
            );

            file_groups
                .entry(replacement.file_path.clone())
                .or_default()
                .push(replacement);
        }

        log_info!(
            operation = "replace_image_links_batch",
            total_files = file_groups.len(),
            "Grouped replacements by file"
        );

        let mut results = Vec::new();
        let mut total_successful = 0;
        let mut total_failed = 0;

        let total_files = file_groups.len();

        for (file_index, (file_path, file_replacements)) in file_groups.into_iter().enumerate() {
            log_info!(
                operation = "process_file",
                file_index = file_index,
                file_path = %file_path,
                replacement_count = file_replacements.len(),
                "Processing file replacements"
            );

            match self
                .replace_image_links(&file_path, file_replacements)
                .await
            {
                Ok(result) => {
                    log_info!(
                        operation = "file_replacement_success",
                        file_path = %file_path,
                        successful_replacements = result.successful_replacements,
                        failed_replacements = result.failed_replacements.len(),
                        total_replacements = result.total_replacements,
                        "File replacement completed successfully"
                    );

                    total_successful += result.successful_replacements;
                    total_failed += result.failed_replacements.len();
                    results.push(result);
                }
                Err(e) => {
                    log_error!(
                        operation = "file_replacement_error",
                        file_path = %file_path,
                        error = %e,
                        "Failed to process file replacements"
                    );
                    // Create a failed result for the entire file
                    let failed_result = ReplacementResult {
                        file_path: file_path.clone(),
                        total_replacements: 0,
                        successful_replacements: 0,
                        failed_replacements: vec![ReplacementError {
                            replacement: LinkReplacement {
                                file_path: file_path.clone(),
                                line: 0,
                                column: 0,
                                old_link: String::new(),
                                new_link: String::new(),
                            },
                            error: format!("File processing failed: {}", e),
                        }],
                        duration: SystemTime::now(),
                    };
                    total_failed += 1;
                    results.push(failed_result);
                }
            }
        }

        let duration = start_time.elapsed();

        Ok(BatchReplacementResult {
            results,
            total_files,
            total_successful_replacements: total_successful,
            total_failed_replacements: total_failed,
            duration,
            timestamp: SystemTime::now(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::path::PathBuf;
    use tempfile::{tempdir, NamedTempFile};
    use tokio::fs as async_fs;

    // Helper function to create a temporary markdown file
    async fn create_temp_md_file(content: &str) -> Result<PathBuf> {
        let temp_file = NamedTempFile::new()?;
        let path = temp_file.path().to_path_buf();
        async_fs::write(&path, content).await?;
        // Keep the file alive by forgetting the temp_file
        std::mem::forget(temp_file);
        Ok(path)
    }

    // Helper function to create a temporary image file
    async fn create_temp_image_file(dir: &Path, name: &str) -> Result<PathBuf> {
        let image_path = dir.join(name);
        // Create a simple 1x1 pixel PNG
        let png_data = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
            0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08,
            0xD7, 0x63, 0xF8, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x5C, 0xC2, 0x8A, 0xBC, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        async_fs::write(&image_path, png_data).await?;
        Ok(image_path)
    }

    #[tokio::test]
    async fn test_file_service_creation() {
        let service = FileService::new();
        assert!(service.is_ok());
    }

    #[tokio::test]
    async fn test_extract_image_references_markdown_syntax() {
        let service = FileService::new().unwrap();

        let content = r#"
# Test Document

Here's an image: ![Alt text](./images/test.png)

Another image with title: ![Another](../assets/photo.jpg "Photo title")

And one more: ![](relative/path/image.gif)

This should be ignored: ![Remote](https://example.com/image.png)
"#;

        let images = service.extract_image_references(content).await.unwrap();

        assert_eq!(images.len(), 3);

        // Check first image
        assert_eq!(images[0].original_path, "./images/test.png");
        assert_eq!(images[0].markdown_line, 4);

        // Check second image
        assert_eq!(images[1].original_path, "../assets/photo.jpg");
        assert_eq!(images[1].markdown_line, 6);

        // Check third image
        assert_eq!(images[2].original_path, "relative/path/image.gif");
        assert_eq!(images[2].markdown_line, 8);
    }

    #[tokio::test]
    async fn test_extract_image_references_html_syntax() {
        let service = FileService::new().unwrap();

        let content = r#"
<img src="./test.png" alt="Test" />
<img src="../another.jpg" width="100" height="200" />
<img src="https://example.com/remote.png" />
"#;

        let images = service.extract_image_references(content).await.unwrap();

        assert_eq!(images.len(), 2); // Remote image should be ignored
        assert_eq!(images[0].original_path, "./test.png");
        assert_eq!(images[1].original_path, "../another.jpg");
    }

    #[tokio::test]
    async fn test_scan_single_file_with_existing_images() {
        let temp_dir = tempdir().unwrap();
        let temp_dir_path = temp_dir.path();

        // Create test images
        create_temp_image_file(temp_dir_path, "test1.png")
            .await
            .unwrap();
        create_temp_image_file(temp_dir_path, "test2.jpg")
            .await
            .unwrap();

        // Create markdown content
        let md_content = format!(
            r#"
# Test Document

![Image 1]({}/test1.png)
![Image 2]({}/test2.jpg)
![Missing](./missing.png)
"#,
            temp_dir_path.display(),
            temp_dir_path.display()
        );

        let md_file = create_temp_md_file(&md_content).await.unwrap();

        let service = FileService::new().unwrap();
        let result = service.scan_single_file(&md_file.to_string_lossy()).await;

        assert!(matches!(result.status, ScanStatus::Success));
        assert_eq!(result.images.len(), 3);

        // Check existing images
        assert!(result.images[0].exists);
        assert!(result.images[0].size > 0);
        assert!(result.images[1].exists);
        assert!(result.images[1].size > 0);

        // Check missing image
        assert!(!result.images[2].exists);
        assert_eq!(result.images[2].size, 0);
    }

    #[tokio::test]
    async fn test_scan_multiple_files() {
        let temp_dir = tempdir().unwrap();
        let temp_dir_path = temp_dir.path();

        // Create test image
        create_temp_image_file(temp_dir_path, "shared.png")
            .await
            .unwrap();

        // Create first markdown file
        let md1_content = format!("![Shared Image]({}/shared.png)", temp_dir_path.display());
        let md1_file = create_temp_md_file(&md1_content).await.unwrap();

        // Create second markdown file
        let md2_content = "![Missing](./missing.jpg)";
        let md2_file = create_temp_md_file(md2_content).await.unwrap();

        let service = FileService::new().unwrap();
        let results = service
            .scan_markdown_files(vec![
                md1_file.to_string_lossy().to_string(),
                md2_file.to_string_lossy().to_string(),
            ])
            .await
            .unwrap();

        assert_eq!(results.len(), 2);

        // First file should succeed
        assert!(matches!(results[0].status, ScanStatus::Success));
        assert_eq!(results[0].images.len(), 1);
        assert!(results[0].images[0].exists);

        // Second file should also succeed (missing image is not an error)
        assert!(matches!(results[1].status, ScanStatus::Success));
        assert_eq!(results[1].images.len(), 1);
        assert!(!results[1].images[0].exists);
    }

    #[tokio::test]
    async fn test_relative_path_resolution() {
        let temp_dir = tempdir().unwrap();
        let temp_dir_path = temp_dir.path();

        // Create subdirectory structure
        let images_dir = temp_dir_path.join("images");
        async_fs::create_dir_all(&images_dir).await.unwrap();

        // Create image in subdirectory
        create_temp_image_file(&images_dir, "test.png")
            .await
            .unwrap();

        // Create markdown file in parent directory
        let md_content = "![Test Image](./images/test.png)";
        let md_file = temp_dir_path.join("test.md");
        async_fs::write(&md_file, md_content).await.unwrap();

        let service = FileService::new().unwrap();
        let result = service.scan_single_file(&md_file.to_string_lossy()).await;

        assert!(matches!(result.status, ScanStatus::Success));
        assert_eq!(result.images.len(), 1);
        assert!(result.images[0].exists);
        assert!(result.images[0].absolute_path.contains("images/test.png"));
    }

    #[tokio::test]
    async fn test_mixed_image_formats() {
        let service = FileService::new().unwrap();

        let content = r#"
![PNG](./test.png)
![JPG](./test.jpg)
![JPEG](./test.jpeg)
![GIF](./test.gif)
![BMP](./test.bmp)
![WEBP](./test.webp)
![SVG](./test.svg)
![Uppercase](./TEST.PNG)
"#;

        let images = service.extract_image_references(content).await.unwrap();

        assert_eq!(images.len(), 8);

        let expected_paths = [
            "./test.png",
            "./test.jpg",
            "./test.jpeg",
            "./test.gif",
            "./test.bmp",
            "./test.webp",
            "./test.svg",
            "./TEST.PNG",
        ];

        for (i, expected) in expected_paths.iter().enumerate() {
            assert_eq!(images[i].original_path, *expected);
        }
    }

    #[tokio::test]
    async fn test_scan_file_with_io_error() {
        let service = FileService::new().unwrap();
        let result = service.scan_single_file("/nonexistent/file.md").await;

        assert!(matches!(result.status, ScanStatus::Error));
        assert!(result.error.is_some());
        assert!(result.images.is_empty());
    }

    // ============================================================================
    // Link Replacement Tests
    // ============================================================================

    #[tokio::test]
    async fn test_replace_image_links_single_replacement() {
        let temp_dir = tempdir().unwrap();
        let md_file = temp_dir.path().join("test.md");

        let original_content = "Here's an image: ![Alt text](./images/test.png)";

        async_fs::write(&md_file, original_content).await.unwrap();

        let service = FileService::new().unwrap();

        let replacements = vec![LinkReplacement {
            file_path: md_file.to_string_lossy().to_string(),
            line: 1,
            column: 31, // Position where ./images/test.png starts
            old_link: "./images/test.png".to_string(),
            new_link: "https://cdn.example.com/test.png".to_string(),
        }];

        let result = service
            .replace_image_links(&md_file.to_string_lossy(), replacements)
            .await
            .unwrap();

        // Debug output
        println!(
            "Successful replacements: {}",
            result.successful_replacements
        );
        println!("Failed replacements: {}", result.failed_replacements.len());
        if !result.failed_replacements.is_empty() {
            println!("First failure: {}", result.failed_replacements[0].error);
        }

        assert_eq!(result.successful_replacements, 1);
        assert_eq!(result.failed_replacements.len(), 0);
        assert_eq!(result.total_replacements, 1);

        // Verify the file content was updated
        let updated_content = async_fs::read_to_string(&md_file).await.unwrap();
        println!("Updated content: '{}'", updated_content);
        assert!(updated_content.contains("https://cdn.example.com/test.png"));
        assert!(!updated_content.contains("./images/test.png"));
    }

    #[tokio::test]
    async fn test_replace_image_links_multiple_replacements() {
        let temp_dir = tempdir().unwrap();
        let md_file = temp_dir.path().join("test.md");

        let original_content = r#"# Test Document

![Image 1](./img1.png)
![Image 2](./img2.jpg)
![Image 3](./img3.gif)
"#;

        async_fs::write(&md_file, original_content).await.unwrap();

        let service = FileService::new().unwrap();

        let replacements = vec![
            LinkReplacement {
                file_path: md_file.to_string_lossy().to_string(),
                line: 3,
                column: 13,
                old_link: "./img1.png".to_string(),
                new_link: "https://cdn.example.com/img1.png".to_string(),
            },
            LinkReplacement {
                file_path: md_file.to_string_lossy().to_string(),
                line: 4,
                column: 13,
                old_link: "./img2.jpg".to_string(),
                new_link: "https://cdn.example.com/img2.jpg".to_string(),
            },
            LinkReplacement {
                file_path: md_file.to_string_lossy().to_string(),
                line: 5,
                column: 13,
                old_link: "./img3.gif".to_string(),
                new_link: "https://cdn.example.com/img3.gif".to_string(),
            },
        ];

        let result = service
            .replace_image_links(&md_file.to_string_lossy(), replacements)
            .await
            .unwrap();

        assert_eq!(result.successful_replacements, 3);
        assert_eq!(result.failed_replacements.len(), 0);
        assert_eq!(result.total_replacements, 3);

        // Verify the file content was updated
        let updated_content = async_fs::read_to_string(&md_file).await.unwrap();
        assert!(updated_content.contains("https://cdn.example.com/img1.png"));
        assert!(updated_content.contains("https://cdn.example.com/img2.jpg"));
        assert!(updated_content.contains("https://cdn.example.com/img3.gif"));
        assert!(!updated_content.contains("./img1.png"));
        assert!(!updated_content.contains("./img2.jpg"));
        assert!(!updated_content.contains("./img3.gif"));
    }

    #[tokio::test]
    async fn test_replace_image_links_with_failures() {
        let temp_dir = tempdir().unwrap();
        let md_file = temp_dir.path().join("test.md");

        let original_content = r#"# Test Document

![Image 1](./img1.png)
![Image 2](./img2.jpg)
"#;

        async_fs::write(&md_file, original_content).await.unwrap();

        let service = FileService::new().unwrap();

        let replacements = vec![
            LinkReplacement {
                file_path: md_file.to_string_lossy().to_string(),
                line: 3,
                column: 13,
                old_link: "./img1.png".to_string(),
                new_link: "https://cdn.example.com/img1.png".to_string(),
            },
            LinkReplacement {
                file_path: md_file.to_string_lossy().to_string(),
                line: 4,
                column: 13,
                old_link: "./nonexistent.jpg".to_string(), // This should fail
                new_link: "https://cdn.example.com/img2.jpg".to_string(),
            },
            LinkReplacement {
                file_path: md_file.to_string_lossy().to_string(),
                line: 10, // Invalid line number
                column: 13,
                old_link: "./img3.gif".to_string(),
                new_link: "https://cdn.example.com/img3.gif".to_string(),
            },
        ];

        let result = service
            .replace_image_links(&md_file.to_string_lossy(), replacements)
            .await
            .unwrap();

        assert_eq!(result.successful_replacements, 1);
        assert_eq!(result.failed_replacements.len(), 2);
        assert_eq!(result.total_replacements, 3);

        // Verify only the successful replacement was made
        let updated_content = async_fs::read_to_string(&md_file).await.unwrap();
        assert!(updated_content.contains("https://cdn.example.com/img1.png"));
        assert!(updated_content.contains("./img2.jpg")); // Should remain unchanged
        assert!(!updated_content.contains("./img1.png"));
    }

    #[tokio::test]
    async fn test_replace_image_links_batch() {
        let temp_dir = tempdir().unwrap();

        // Create first markdown file
        let md_file1 = temp_dir.path().join("test1.md");
        let content1 = r#"![Image 1](./img1.png)"#;
        async_fs::write(&md_file1, content1).await.unwrap();

        // Create second markdown file
        let md_file2 = temp_dir.path().join("test2.md");
        let content2 = r#"![Image 2](./img2.jpg)"#;
        async_fs::write(&md_file2, content2).await.unwrap();

        let service = FileService::new().unwrap();

        let replacements = vec![
            LinkReplacement {
                file_path: md_file1.to_string_lossy().to_string(),
                line: 1,
                column: 13,
                old_link: "./img1.png".to_string(),
                new_link: "https://cdn.example.com/img1.png".to_string(),
            },
            LinkReplacement {
                file_path: md_file2.to_string_lossy().to_string(),
                line: 1,
                column: 13,
                old_link: "./img2.jpg".to_string(),
                new_link: "https://cdn.example.com/img2.jpg".to_string(),
            },
        ];

        let result = service
            .replace_image_links_batch(replacements)
            .await
            .unwrap();

        assert_eq!(result.total_files, 2);
        assert_eq!(result.total_successful_replacements, 2);
        assert_eq!(result.total_failed_replacements, 0);
        assert_eq!(result.results.len(), 2);

        // Verify both files were updated
        let updated_content1 = async_fs::read_to_string(&md_file1).await.unwrap();
        let updated_content2 = async_fs::read_to_string(&md_file2).await.unwrap();

        assert!(updated_content1.contains("https://cdn.example.com/img1.png"));
        assert!(updated_content2.contains("https://cdn.example.com/img2.jpg"));
    }

    #[tokio::test]
    async fn test_replace_nonexistent_file() {
        let service = FileService::new().unwrap();

        let replacements = vec![LinkReplacement {
            file_path: "/nonexistent/file.md".to_string(),
            line: 1,
            column: 10,
            old_link: "./img.png".to_string(),
            new_link: "https://cdn.example.com/img.png".to_string(),
        }];

        let result = service
            .replace_image_links("/nonexistent/file.md", replacements)
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[tokio::test]
    async fn test_replace_with_same_line_multiple_links() {
        let temp_dir = tempdir().unwrap();
        let md_file = temp_dir.path().join("test.md");

        let original_content = r#"![Image 1](./img1.png) and ![Image 2](./img2.jpg) on same line"#;
        async_fs::write(&md_file, original_content).await.unwrap();

        let service = FileService::new().unwrap();

        let replacements = vec![
            LinkReplacement {
                file_path: md_file.to_string_lossy().to_string(),
                line: 1,
                column: 13,
                old_link: "./img1.png".to_string(),
                new_link: "https://cdn.example.com/img1.png".to_string(),
            },
            LinkReplacement {
                file_path: md_file.to_string_lossy().to_string(),
                line: 1,
                column: 43,
                old_link: "./img2.jpg".to_string(),
                new_link: "https://cdn.example.com/img2.jpg".to_string(),
            },
        ];

        let result = service
            .replace_image_links(&md_file.to_string_lossy(), replacements)
            .await
            .unwrap();

        assert_eq!(result.successful_replacements, 2);
        assert_eq!(result.failed_replacements.len(), 0);

        // Verify both replacements were made
        let updated_content = async_fs::read_to_string(&md_file).await.unwrap();
        assert!(updated_content.contains("https://cdn.example.com/img1.png"));
        assert!(updated_content.contains("https://cdn.example.com/img2.jpg"));
        assert!(!updated_content.contains("./img1.png"));
        assert!(!updated_content.contains("./img2.jpg"));
    }
}
