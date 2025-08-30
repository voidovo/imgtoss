use crate::models::ImageInfo;
use crate::utils::{AppError, Result};
use crate::{log_debug, log_info, log_error, log_timing};
use image::{
    imageops::FilterType, GenericImageView, ImageFormat, ImageReader,
};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Cursor;
use std::path::Path;
use tokio::task;

/// Image processing service for thumbnail generation, compression, format conversion, and metadata extraction
pub struct ImageService;

impl ImageService {
    pub fn new() -> Self {
        Self
    }

    /// Generate a thumbnail for the given image
    ///
    /// # Arguments
    /// * `image_path` - Path to the source image file
    /// * `size` - Maximum dimension (width or height) for the thumbnail
    ///
    /// # Returns
    /// * `Result<Vec<u8>>` - JPEG encoded thumbnail data
    pub async fn generate_thumbnail(&self, image_path: &str, size: u32) -> Result<Vec<u8>> {
        log_info!(
            operation = "generate_thumbnail",
            image_path = image_path,
            thumbnail_size = size,
            "Starting thumbnail generation"
        );

        let image_path_clone = image_path.to_string();

        let result = task::spawn_blocking(move || {
            log_timing!({
                // Load the image
                log_debug!("Opening image file: {}", image_path_clone);
                let img = ImageReader::open(&image_path_clone)
                    .map_err(|e| {
                        log_error!(
                            error = %e,
                            file_path = %image_path_clone,
                            operation = "open_image",
                            "Failed to open image file"
                        );
                        AppError::ImageProcessing(format!("Failed to open image {}: {}", image_path_clone, e))
                    })?
                    .decode()
                    .map_err(|e| {
                        log_error!(
                            error = %e,
                            file_path = %image_path_clone,
                            operation = "decode_image",
                            "Failed to decode image file"
                        );
                        AppError::ImageProcessing(format!(
                            "Failed to decode image {}: {}",
                            image_path_clone, e
                        ))
                    })?;

                // Calculate thumbnail dimensions while maintaining aspect ratio
                let (width, height) = img.dimensions();
                log_debug!(
                    original_width = width,
                    original_height = height,
                    "Original image dimensions"
                );
                
                let (thumb_width, thumb_height) = if width > height {
                    let ratio = height as f32 / width as f32;
                    (size, (size as f32 * ratio) as u32)
                } else {
                    let ratio = width as f32 / height as f32;
                    ((size as f32 * ratio) as u32, size)
                };

                log_debug!(
                    thumb_width = thumb_width,
                    thumb_height = thumb_height,
                    "Calculated thumbnail dimensions"
                );

                // Resize the image using high-quality filtering
                log_debug!("Resizing image to thumbnail dimensions");
                let thumbnail = img.resize(thumb_width, thumb_height, FilterType::Lanczos3);

                // Convert RGBA to RGB if necessary (JPEG doesn't support alpha channel)
                log_debug!("Converting color format if needed");
                let thumbnail_rgb = match thumbnail.color() {
                    image::ColorType::Rgba8 => {
                        log_debug!("Converting RGBA8 to RGB8");
                        // Convert RGBA to RGB by removing alpha channel
                        image::DynamicImage::ImageRgb8(image::ImageBuffer::from_fn(
                            thumbnail.width(),
                            thumbnail.height(),
                            |x, y| {
                                let rgba = thumbnail.get_pixel(x, y);
                                image::Rgb([rgba[0], rgba[1], rgba[2]])
                            },
                        ))
                    }
                    image::ColorType::Rgba16 => {
                        log_debug!("Converting RGBA16 to RGB8");
                        // Convert RGBA16 to RGB8
                        let rgba16_img = thumbnail.to_rgba16();
                        image::DynamicImage::ImageRgb8(image::ImageBuffer::from_fn(
                            thumbnail.width(),
                            thumbnail.height(),
                            |x, y| {
                                let rgba = rgba16_img.get_pixel(x, y);
                                // Convert 16-bit to 8-bit
                                image::Rgb([
                                    (rgba[0] >> 8) as u8,
                                    (rgba[1] >> 8) as u8,
                                    (rgba[2] >> 8) as u8,
                                ])
                            },
                        ))
                    }
                    _ => {
                        log_debug!("Using original color format");
                        thumbnail // Already RGB or other compatible format
                    }
                };

                // Encode as JPEG with good quality
                log_debug!("Encoding thumbnail as JPEG");
                let mut buffer = Vec::new();
                let mut cursor = Cursor::new(&mut buffer);

                thumbnail_rgb
                    .write_to(&mut cursor, ImageFormat::Jpeg)
                    .map_err(|e| {
                        log_error!(
                            error = %e,
                            operation = "encode_thumbnail",
                            "Failed to encode thumbnail to JPEG"
                        );
                        AppError::ImageProcessing(format!("Failed to encode thumbnail: {}", e))
                    })?;

                log_debug!(
                    thumbnail_size_bytes = buffer.len(),
                    "Thumbnail encoding completed"
                );

                Ok(buffer)
            }, "generate_thumbnail")
        })
        .await
        .map_err(|e| {
            log_error!(
                error = %e,
                operation = "generate_thumbnail_task",
                "Task join error during thumbnail generation"
            );
            AppError::ImageProcessing(format!("Task join error: {}", e))
        })?;

        match result {
            Ok(thumbnail_data) => {
                log_info!(
                    operation = "generate_thumbnail",
                    image_path = image_path,
                    thumbnail_size_bytes = thumbnail_data.len(),
                    success = true,
                    "Thumbnail generation completed successfully"
                );
                Ok(thumbnail_data)
            }
            Err(e) => {
                log_error!(
                    operation = "generate_thumbnail",
                    image_path = image_path,
                    error = %e,
                    success = false,
                    "Thumbnail generation failed"
                );
                Err(e)
            }
        }
    }

    /// Compress an image with the specified quality
    ///
    /// # Arguments
    /// * `image_path` - Path to the source image file
    /// * `quality` - JPEG quality (1-100, where 100 is highest quality)
    ///
    /// # Returns
    /// * `Result<Vec<u8>>` - Compressed JPEG image data
    #[allow(dead_code)]
    pub async fn compress_image(&self, image_path: &str, quality: u8) -> Result<Vec<u8>> {
        let image_path = image_path.to_string();

        task::spawn_blocking(move || {
            // Validate quality parameter
            if quality == 0 || quality > 100 {
                return Err(AppError::ImageProcessing(
                    "Quality must be between 1 and 100".to_string(),
                ));
            }

            // Load the image
            let img = ImageReader::open(&image_path)
                .map_err(|e| {
                    AppError::ImageProcessing(format!("Failed to open image {}: {}", image_path, e))
                })?
                .decode()
                .map_err(|e| {
                    AppError::ImageProcessing(format!(
                        "Failed to decode image {}: {}",
                        image_path, e
                    ))
                })?;

            // Convert RGBA to RGB if necessary (JPEG doesn't support alpha channel)
            let img_rgb = match img.color() {
                image::ColorType::Rgba8 => {
                    // Convert RGBA to RGB by removing alpha channel
                    image::DynamicImage::ImageRgb8(image::ImageBuffer::from_fn(
                        img.width(),
                        img.height(),
                        |x, y| {
                            let rgba = img.get_pixel(x, y);
                            image::Rgb([rgba[0], rgba[1], rgba[2]])
                        },
                    ))
                }
                image::ColorType::Rgba16 => {
                    // Convert RGBA16 to RGB8
                    let rgba16_img = img.to_rgba16();
                    image::DynamicImage::ImageRgb8(image::ImageBuffer::from_fn(
                        img.width(),
                        img.height(),
                        |x, y| {
                            let rgba = rgba16_img.get_pixel(x, y);
                            // Convert 16-bit to 8-bit
                            image::Rgb([
                                (rgba[0] >> 8) as u8,
                                (rgba[1] >> 8) as u8,
                                (rgba[2] >> 8) as u8,
                            ])
                        },
                    ))
                }
                _ => img, // Already RGB or other compatible format
            };

            // Encode with specified quality
            let mut buffer = Vec::new();
            let mut cursor = Cursor::new(&mut buffer);

            // Use JPEG encoder with quality setting
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, quality);
            img_rgb.write_with_encoder(encoder).map_err(|e| {
                AppError::ImageProcessing(format!("Failed to compress image: {}", e))
            })?;

            Ok(buffer)
        })
        .await
        .map_err(|e| AppError::ImageProcessing(format!("Task join error: {}", e)))?
    }

    /// Convert image data to a different format
    ///
    /// # Arguments
    /// * `image_data` - Source image data as bytes
    /// * `target_format` - Target format ("jpeg", "png", "webp", "bmp", "tiff")
    ///
    /// # Returns
    /// * `Result<Vec<u8>>` - Converted image data
    #[allow(dead_code)]
    pub async fn convert_format(&self, image_data: &[u8], target_format: &str) -> Result<Vec<u8>> {
        let image_data = image_data.to_vec();
        let target_format = target_format.to_lowercase();

        task::spawn_blocking(move || {
            // Parse target format
            let format = match target_format.as_str() {
                "jpeg" | "jpg" => ImageFormat::Jpeg,
                "png" => ImageFormat::Png,
                "webp" => ImageFormat::WebP,
                "bmp" => ImageFormat::Bmp,
                "tiff" | "tif" => ImageFormat::Tiff,
                "gif" => ImageFormat::Gif,
                _ => {
                    return Err(AppError::ImageProcessing(format!(
                        "Unsupported target format: {}",
                        target_format
                    )))
                }
            };

            // Load image from bytes
            let img = image::load_from_memory(&image_data).map_err(|e| {
                AppError::ImageProcessing(format!("Failed to load image from memory: {}", e))
            })?;

            // Convert to target format
            let mut buffer = Vec::new();
            let mut cursor = Cursor::new(&mut buffer);

            // Handle JPEG format specially to convert RGBA to RGB
            if format == ImageFormat::Jpeg {
                let img_rgb = match img.color() {
                    image::ColorType::Rgba8 => {
                        // Convert RGBA to RGB by removing alpha channel
                        image::DynamicImage::ImageRgb8(image::ImageBuffer::from_fn(
                            img.width(),
                            img.height(),
                            |x, y| {
                                let rgba = img.get_pixel(x, y);
                                image::Rgb([rgba[0], rgba[1], rgba[2]])
                            },
                        ))
                    }
                    image::ColorType::Rgba16 => {
                        // Convert RGBA16 to RGB8
                        let rgba16_img = img.to_rgba16();
                        image::DynamicImage::ImageRgb8(image::ImageBuffer::from_fn(
                            img.width(),
                            img.height(),
                            |x, y| {
                                let rgba = rgba16_img.get_pixel(x, y);
                                // Convert 16-bit to 8-bit
                                image::Rgb([
                                    (rgba[0] >> 8) as u8,
                                    (rgba[1] >> 8) as u8,
                                    (rgba[2] >> 8) as u8,
                                ])
                            },
                        ))
                    }
                    _ => img, // Already RGB or other compatible format
                };

                img_rgb.write_to(&mut cursor, format).map_err(|e| {
                    AppError::ImageProcessing(format!(
                        "Failed to convert to {}: {}",
                        target_format, e
                    ))
                })?;
            } else {
                // For non-JPEG formats, use the original image
                img.write_to(&mut cursor, format).map_err(|e| {
                    AppError::ImageProcessing(format!(
                        "Failed to convert to {}: {}",
                        target_format, e
                    ))
                })?;
            }

            Ok(buffer)
        })
        .await
        .map_err(|e| AppError::ImageProcessing(format!("Task join error: {}", e)))?
    }

    /// Extract metadata information from an image file
    ///
    /// # Arguments
    /// * `image_path` - Path to the image file
    ///
    /// # Returns
    /// * `Result<ImageInfo>` - Image metadata including dimensions, format, size, and color space
    pub async fn get_image_info(&self, image_path: &str) -> Result<ImageInfo> {
        let image_path = image_path.to_string();

        task::spawn_blocking(move || {
            // Get file size
            let metadata = fs::metadata(&image_path).map_err(|e| {
                AppError::ImageProcessing(format!("Failed to read file metadata: {}", e))
            })?;
            let file_size = metadata.len();

            // Load image to get dimensions and format
            let reader = ImageReader::open(&image_path).map_err(|e| {
                AppError::ImageProcessing(format!("Failed to open image {}: {}", image_path, e))
            })?;

            // Try to get format without fully decoding
            let format_name = reader
                .format()
                .map(|f| format!("{:?}", f).to_lowercase())
                .unwrap_or_else(|| "unknown".to_string());

            // Decode to get dimensions and color info
            let img = reader.decode().map_err(|e| {
                AppError::ImageProcessing(format!("Failed to decode image {}: {}", image_path, e))
            })?;

            let (width, height) = img.dimensions();

            // Determine color space based on image color type
            let color_space = match img.color() {
                image::ColorType::L8 | image::ColorType::L16 => Some("Grayscale".to_string()),
                image::ColorType::La8 | image::ColorType::La16 => {
                    Some("Grayscale with Alpha".to_string())
                }
                image::ColorType::Rgb8 | image::ColorType::Rgb16 | image::ColorType::Rgb32F => {
                    Some("RGB".to_string())
                }
                image::ColorType::Rgba8 | image::ColorType::Rgba16 | image::ColorType::Rgba32F => {
                    Some("RGBA".to_string())
                }
                _ => None,
            };

            Ok(ImageInfo {
                width,
                height,
                format: format_name,
                size: file_size,
                color_space,
            })
        })
        .await
        .map_err(|e| AppError::ImageProcessing(format!("Task join error: {}", e)))?
    }

    /// Validate if a file is a supported image format
    ///
    /// # Arguments
    /// * `image_path` - Path to the file to validate
    ///
    /// # Returns
    /// * `Result<bool>` - True if the file is a supported image format
    #[allow(dead_code)]
    pub async fn is_supported_image(&self, image_path: &str) -> Result<bool> {
        let image_path = image_path.to_string();

        task::spawn_blocking(move || {
            // Check file extension first for quick validation
            let path = Path::new(&image_path);
            if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
                let ext_lower = extension.to_lowercase();
                match ext_lower.as_str() {
                    "jpg" | "jpeg" | "png" | "webp" | "bmp" | "tiff" | "tif" | "gif" => {
                        // Try to open the image to confirm it's valid
                        match ImageReader::open(&image_path) {
                            Ok(reader) => match reader.decode() {
                                Ok(_) => Ok(true),
                                Err(_) => Ok(false),
                            },
                            Err(_) => Ok(false),
                        }
                    }
                    _ => Ok(false),
                }
            } else {
                Ok(false)
            }
        })
        .await
        .map_err(|e| AppError::ImageProcessing(format!("Task join error: {}", e)))?
    }

    /// Get optimal compression quality based on image characteristics
    ///
    /// # Arguments
    /// * `image_path` - Path to the image file
    /// * `target_size_kb` - Target file size in kilobytes (optional)
    ///
    /// # Returns
    /// * `Result<u8>` - Recommended quality setting (1-100)
    #[allow(dead_code)]
    pub async fn get_optimal_quality(
        &self,
        image_path: &str,
        target_size_kb: Option<u64>,
    ) -> Result<u8> {
        let image_info = self.get_image_info(image_path).await?;

        // Base quality on image size and target
        let base_quality = if let Some(target_kb) = target_size_kb {
            let current_size_kb = image_info.size / 1024;
            if current_size_kb <= target_kb {
                95 // High quality if already small enough
            } else {
                // Calculate quality based on compression ratio needed
                let ratio = target_kb as f32 / current_size_kb as f32;
                let quality = (ratio * 100.0).min(95.0).max(30.0) as u8;
                quality
            }
        } else {
            // Default quality based on image dimensions
            let pixel_count = image_info.width * image_info.height;
            if pixel_count > 4_000_000 {
                // > 4MP
                75
            } else if pixel_count > 1_000_000 {
                // > 1MP
                85
            } else {
                90
            }
        };

        Ok(base_quality)
    }

    /// Calculate SHA256 checksum for an image file
    ///
    /// # Arguments
    /// * `image_path` - Path to the image file
    ///
    /// # Returns
    /// * `Result<String>` - Hexadecimal SHA256 checksum
    pub async fn calculate_checksum(&self, image_path: &str) -> Result<String> {
        let image_path = image_path.to_string();

        task::spawn_blocking(move || {
            // Read the file
            let data = fs::read(&image_path).map_err(|e| {
                AppError::FileSystem(format!("Failed to read image file {}: {}", image_path, e))
            })?;

            // Calculate SHA256 hash
            let mut hasher = Sha256::new();
            hasher.update(&data);
            let result = hasher.finalize();

            // Convert to hex string
            Ok(format!("{:x}", result))
        })
        .await
        .map_err(|e| AppError::ImageProcessing(format!("Task join error: {}", e)))?
    }

    /// Calculate SHA256 checksum for image data
    ///
    /// # Arguments
    /// * `image_data` - Image data as bytes
    ///
    /// # Returns
    /// * `Result<String>` - Hexadecimal SHA256 checksum
    #[allow(dead_code)]
    pub async fn calculate_checksum_from_data(&self, image_data: &[u8]) -> Result<String> {
        let data = image_data.to_vec();

        task::spawn_blocking(move || {
            // Calculate SHA256 hash
            let mut hasher = Sha256::new();
            hasher.update(&data);
            let result = hasher.finalize();

            // Convert to hex string
            Ok(format!("{:x}", result))
        })
        .await
        .map_err(|e| AppError::ImageProcessing(format!("Task join error: {}", e)))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::DynamicImage;
    use std::fs;
    use tempfile::TempDir;

    // Helper function to create a simple test image
    fn create_test_image(width: u32, height: u32) -> Vec<u8> {
        use image::{ImageBuffer, Rgb};

        let img = ImageBuffer::from_fn(width, height, |x, y| {
            let r = (x % 256) as u8;
            let g = (y % 256) as u8;
            let b = ((x + y) % 256) as u8;
            Rgb([r, g, b])
        });

        let dynamic_img = DynamicImage::ImageRgb8(img);
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);
        dynamic_img.write_to(&mut cursor, ImageFormat::Png).unwrap();
        buffer
    }

    // Helper function to create a test image file
    fn create_test_image_file(
        temp_dir: &TempDir,
        filename: &str,
        width: u32,
        height: u32,
    ) -> String {
        let image_data = if filename.ends_with(".jpg") || filename.ends_with(".jpeg") {
            create_test_image_jpeg(width, height)
        } else {
            create_test_image(width, height)
        };
        let image_path = temp_dir.path().join(filename);
        fs::write(&image_path, image_data).unwrap();
        image_path.to_string_lossy().to_string()
    }

    // Helper function to create a JPEG test image
    fn create_test_image_jpeg(width: u32, height: u32) -> Vec<u8> {
        use image::{ImageBuffer, Rgb};

        let img = ImageBuffer::from_fn(width, height, |x, y| {
            let r = (x % 256) as u8;
            let g = (y % 256) as u8;
            let b = ((x + y) % 256) as u8;
            Rgb([r, g, b])
        });

        let dynamic_img = DynamicImage::ImageRgb8(img);
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);
        dynamic_img
            .write_to(&mut cursor, ImageFormat::Jpeg)
            .unwrap();
        buffer
    }

    #[tokio::test]
    async fn test_generate_thumbnail() {
        let temp_dir = TempDir::new().unwrap();
        let service = ImageService::new();

        // Create a test image
        let image_path = create_test_image_file(&temp_dir, "test.png", 800, 600);

        // Generate thumbnail
        let thumbnail_data = service.generate_thumbnail(&image_path, 150).await.unwrap();

        // Verify thumbnail was generated
        assert!(!thumbnail_data.is_empty());

        // Load thumbnail and verify dimensions
        let thumbnail_img = image::load_from_memory(&thumbnail_data).unwrap();
        let (thumb_width, thumb_height) = thumbnail_img.dimensions();

        // Should maintain aspect ratio and fit within 150px
        assert!(thumb_width <= 150);
        assert!(thumb_height <= 150);

        // For 800x600 image with max size 150, width should be around 150 and height around 112
        // Allow for small rounding differences
        assert!(thumb_width >= 149 && thumb_width <= 150);
        assert!(thumb_height >= 112 && thumb_height <= 113);
    }

    #[tokio::test]
    async fn test_generate_thumbnail_portrait() {
        let temp_dir = TempDir::new().unwrap();
        let service = ImageService::new();

        // Create a portrait test image
        let image_path = create_test_image_file(&temp_dir, "portrait.png", 600, 800);

        // Generate thumbnail
        let thumbnail_data = service.generate_thumbnail(&image_path, 150).await.unwrap();

        // Load thumbnail and verify dimensions
        let thumbnail_img = image::load_from_memory(&thumbnail_data).unwrap();
        let (thumb_width, thumb_height) = thumbnail_img.dimensions();

        // For 600x800 image with max size 150, height should be around 150 and width around 112
        // Allow for small rounding differences
        assert!(thumb_width >= 112 && thumb_width <= 113);
        assert!(thumb_height >= 149 && thumb_height <= 150);
    }

    #[tokio::test]
    async fn test_generate_thumbnail_invalid_path() {
        let service = ImageService::new();

        let result = service.generate_thumbnail("nonexistent.png", 150).await;
        assert!(result.is_err());

        if let Err(AppError::ImageProcessing(msg)) = result {
            assert!(msg.contains("Failed to open image"));
        } else {
            panic!("Expected ImageProcessing error");
        }
    }

    #[tokio::test]
    async fn test_compress_image() {
        let temp_dir = TempDir::new().unwrap();
        let service = ImageService::new();

        // Create a test image
        let image_path = create_test_image_file(&temp_dir, "test.png", 400, 300);

        // Compress with different quality levels
        let high_quality = service.compress_image(&image_path, 90).await.unwrap();
        let low_quality = service.compress_image(&image_path, 30).await.unwrap();

        // Low quality should result in smaller file
        assert!(low_quality.len() < high_quality.len());

        // Both should be valid images
        assert!(image::load_from_memory(&high_quality).is_ok());
        assert!(image::load_from_memory(&low_quality).is_ok());
    }

    #[tokio::test]
    async fn test_compress_image_invalid_quality() {
        let temp_dir = TempDir::new().unwrap();
        let service = ImageService::new();

        let image_path = create_test_image_file(&temp_dir, "test.png", 100, 100);

        // Test invalid quality values
        let result_zero = service.compress_image(&image_path, 0).await;
        assert!(result_zero.is_err());

        let result_over = service.compress_image(&image_path, 101).await;
        assert!(result_over.is_err());
    }

    #[tokio::test]
    async fn test_convert_format() {
        let service = ImageService::new();

        // Create test image data
        let png_data = create_test_image(200, 150);

        // Convert PNG to JPEG
        let jpeg_data = service.convert_format(&png_data, "jpeg").await.unwrap();
        assert!(!jpeg_data.is_empty());

        // Verify it's a valid JPEG
        let jpeg_img = image::load_from_memory(&jpeg_data).unwrap();
        assert_eq!(jpeg_img.dimensions(), (200, 150));

        // Convert to WebP
        let webp_data = service.convert_format(&png_data, "webp").await.unwrap();
        assert!(!webp_data.is_empty());

        // Convert to BMP
        let bmp_data = service.convert_format(&png_data, "bmp").await.unwrap();
        assert!(!bmp_data.is_empty());
    }

    #[tokio::test]
    async fn test_convert_format_unsupported() {
        let service = ImageService::new();
        let png_data = create_test_image(100, 100);

        let result = service.convert_format(&png_data, "xyz").await;
        assert!(result.is_err());

        if let Err(AppError::ImageProcessing(msg)) = result {
            assert!(msg.contains("Unsupported target format"));
        } else {
            panic!("Expected ImageProcessing error");
        }
    }

    #[tokio::test]
    async fn test_convert_format_invalid_data() {
        let service = ImageService::new();
        let invalid_data = vec![1, 2, 3, 4, 5]; // Not image data

        let result = service.convert_format(&invalid_data, "jpeg").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_get_image_info() {
        let temp_dir = TempDir::new().unwrap();
        let service = ImageService::new();

        // Create a test image
        let image_path = create_test_image_file(&temp_dir, "info_test.png", 640, 480);

        // Get image info
        let info = service.get_image_info(&image_path).await.unwrap();

        assert_eq!(info.width, 640);
        assert_eq!(info.height, 480);
        assert_eq!(info.format, "png");
        assert!(info.size > 0);
        assert_eq!(info.color_space, Some("RGB".to_string()));
    }

    #[tokio::test]
    async fn test_get_image_info_nonexistent() {
        let service = ImageService::new();

        let result = service.get_image_info("nonexistent.png").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_is_supported_image() {
        let temp_dir = TempDir::new().unwrap();
        let service = ImageService::new();

        // Create valid image files
        let png_path = create_test_image_file(&temp_dir, "test.png", 100, 100);
        let jpg_path = create_test_image_file(&temp_dir, "test.jpg", 100, 100);

        // Test valid images
        assert!(service.is_supported_image(&png_path).await.unwrap());
        assert!(service.is_supported_image(&jpg_path).await.unwrap());

        // Create invalid file
        let invalid_path = temp_dir.path().join("invalid.txt");
        fs::write(&invalid_path, "not an image").unwrap();

        assert!(!service
            .is_supported_image(&invalid_path.to_string_lossy())
            .await
            .unwrap());

        // Test nonexistent file
        assert!(!service.is_supported_image("nonexistent.png").await.unwrap());
    }

    #[tokio::test]
    async fn test_get_optimal_quality() {
        let temp_dir = TempDir::new().unwrap();
        let service = ImageService::new();

        // Create test images of different sizes
        let small_image = create_test_image_file(&temp_dir, "small.png", 200, 200);
        let medium_image = create_test_image_file(&temp_dir, "medium.png", 1000, 1000);
        let large_image = create_test_image_file(&temp_dir, "large.png", 3000, 3000);

        // Test without target size
        let small_quality = service
            .get_optimal_quality(&small_image, None)
            .await
            .unwrap();
        let medium_quality = service
            .get_optimal_quality(&medium_image, None)
            .await
            .unwrap();
        let large_quality = service
            .get_optimal_quality(&large_image, None)
            .await
            .unwrap();

        // Larger images should get lower quality
        assert!(small_quality >= medium_quality);
        assert!(medium_quality >= large_quality);

        // Test with target size
        let target_quality = service
            .get_optimal_quality(&large_image, Some(500))
            .await
            .unwrap();
        assert!(target_quality >= 30);
        assert!(target_quality <= 95);
    }

    #[tokio::test]
    async fn test_service_creation() {
        let service = ImageService::new();
        // Just verify we can create the service without panicking
        assert!(true);
    }

    #[tokio::test]
    async fn test_thumbnail_edge_cases() {
        let temp_dir = TempDir::new().unwrap();
        let service = ImageService::new();

        // Test very small image
        let tiny_image = create_test_image_file(&temp_dir, "tiny.png", 10, 10);
        let thumbnail = service.generate_thumbnail(&tiny_image, 150).await.unwrap();
        let thumb_img = image::load_from_memory(&thumbnail).unwrap();
        let (w, h) = thumb_img.dimensions();
        assert!(w <= 150 && h <= 150);

        // Test square image
        let square_image = create_test_image_file(&temp_dir, "square.png", 500, 500);
        let thumbnail = service
            .generate_thumbnail(&square_image, 100)
            .await
            .unwrap();
        let thumb_img = image::load_from_memory(&thumbnail).unwrap();
        let (w, h) = thumb_img.dimensions();
        assert_eq!(w, 100);
        assert_eq!(h, 100);
    }

    #[tokio::test]
    async fn test_format_conversion_case_insensitive() {
        let service = ImageService::new();
        let png_data = create_test_image(100, 100);

        // Test different case variations
        let jpeg_upper = service.convert_format(&png_data, "JPEG").await.unwrap();
        let jpeg_lower = service.convert_format(&png_data, "jpeg").await.unwrap();
        let jpg = service.convert_format(&png_data, "jpg").await.unwrap();

        // All should produce valid images
        assert!(image::load_from_memory(&jpeg_upper).is_ok());
        assert!(image::load_from_memory(&jpeg_lower).is_ok());
        assert!(image::load_from_memory(&jpg).is_ok());
    }
}
