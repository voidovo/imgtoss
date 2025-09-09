use crate::models::ImageInfo;
use crate::utils::{AppError, Result};
use crate::{log_debug, log_error, log_info, log_timing};
use image::{imageops::FilterType, GenericImageView, ImageFormat, ImageReader};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Cursor;
use std::path::Path;
use tokio::task;

/// Image processing service for thumbnail generation, compression, format conversion, and metadata extraction
#[derive(Clone)]
pub struct ImageService {
    cache_dir: Option<std::path::PathBuf>,
    client: Option<reqwest::Client>,
}

impl ImageService {
    pub fn new() -> Self {
        Self {
            cache_dir: None,
            client: None,
        }
    }

    /// Create a new ImageService with caching enabled
    pub fn with_cache() -> Result<Self> {
        let cache_dir = Self::get_cache_directory()?;

        // 确保缓存目录存在
        std::fs::create_dir_all(&cache_dir).map_err(|e| {
            AppError::FileSystem(format!("Failed to create cache directory: {}", e))
        })?;

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

        Ok(Self {
            cache_dir: Some(cache_dir),
            client: Some(client),
        })
    }

    /// Get cache directory path
    fn get_cache_directory() -> Result<std::path::PathBuf> {
        let app_data_dir = dirs::data_dir()
            .ok_or_else(|| {
                AppError::Configuration("Could not determine data directory".to_string())
            })?
            .join("imgtoss")
            .join("thumbnails");

        Ok(app_data_dir)
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
            log_timing!(
                {
                    // Load the image
                    log_debug!("Opening image file: {}", image_path_clone);

                    // Check if file exists first
                    if !std::path::Path::new(&image_path_clone).exists() {
                        return Err(AppError::ImageProcessing(format!(
                            "Image file does not exist: {}",
                            image_path_clone
                        )));
                    }

                    // Check file size
                    let metadata = std::fs::metadata(&image_path_clone).map_err(|e| {
                        AppError::ImageProcessing(format!(
                            "Failed to read file metadata {}: {}",
                            image_path_clone, e
                        ))
                    })?;

                    log_debug!(file_size = metadata.len(), "File metadata retrieved");

                    if metadata.len() == 0 {
                        return Err(AppError::ImageProcessing(format!(
                            "Image file is empty: {}",
                            image_path_clone
                        )));
                    }

                    let reader = ImageReader::open(&image_path_clone).map_err(|e| {
                        log_error!(
                            error = %e,
                            file_path = %image_path_clone,
                            operation = "open_image",
                            "Failed to open image file"
                        );
                        AppError::ImageProcessing(format!(
                            "Failed to open image {}: {}",
                            image_path_clone, e
                        ))
                    })?;

                    // Try to detect format before decoding
                    let detected_format = reader.format();
                    log_debug!(
                        detected_format = ?detected_format,
                        "Image format detection result"
                    );

                    let img = reader.decode().map_err(|e| {
                        log_error!(
                            error = %e,
                            file_path = %image_path_clone,
                            detected_format = ?detected_format,
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
                },
                "generate_thumbnail"
            )
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
                (ratio * 100.0).clamp(30.0, 95.0) as u8
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

    /// Generate thumbnail from memory data
    ///
    /// # Arguments
    /// * `image_data` - Image data as bytes
    /// * `size` - Maximum dimension (width or height) for the thumbnail
    ///
    /// # Returns
    /// * `Result<Vec<u8>>` - JPEG encoded thumbnail data
    fn generate_thumbnail_from_memory(image_data: &[u8], size: u32) -> Result<Vec<u8>> {
        log_debug!(
            data_size = image_data.len(),
            thumbnail_size = size,
            "Starting thumbnail generation from memory"
        );

        // Validate input data
        if image_data.is_empty() {
            return Err(AppError::ImageProcessing("Image data is empty".to_string()));
        }

        // Load image from memory
        let img = image::load_from_memory(image_data).map_err(|e| {
            log_error!(
                error = %e,
                data_size = image_data.len(),
                operation = "load_from_memory",
                "Failed to load image from memory"
            );
            AppError::ImageProcessing(format!("Failed to load image from memory: {}", e))
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
    }

    /// Generate thumbnail synchronously (for use in blocking contexts)
    ///
    /// # Arguments
    /// * `image_path` - Path to the source image file
    /// * `size` - Maximum dimension (width or height) for the thumbnail
    ///
    /// # Returns
    /// * `Result<Vec<u8>>` - JPEG encoded thumbnail data
    fn generate_thumbnail_sync(image_path: &str, size: u32) -> Result<Vec<u8>> {
        log_debug!(
            image_path = image_path,
            thumbnail_size = size,
            "Starting synchronous thumbnail generation"
        );

        // Check if file exists first
        if !std::path::Path::new(image_path).exists() {
            return Err(AppError::ImageProcessing(format!(
                "Image file does not exist: {}",
                image_path
            )));
        }

        // Check file size
        let metadata = std::fs::metadata(image_path).map_err(|e| {
            AppError::ImageProcessing(format!(
                "Failed to read file metadata {}: {}",
                image_path, e
            ))
        })?;

        log_debug!(file_size = metadata.len(), "File metadata retrieved");

        if metadata.len() == 0 {
            return Err(AppError::ImageProcessing(format!(
                "Image file is empty: {}",
                image_path
            )));
        }

        let reader = ImageReader::open(image_path).map_err(|e| {
            log_error!(
                error = %e,
                file_path = image_path,
                operation = "open_image",
                "Failed to open image file"
            );
            AppError::ImageProcessing(format!("Failed to open image {}: {}", image_path, e))
        })?;

        // Try to detect format before decoding
        let detected_format = reader.format();
        log_debug!(
            detected_format = ?detected_format,
            "Image format detection result"
        );

        let img = reader.decode().map_err(|e| {
            log_error!(
                error = %e,
                file_path = image_path,
                detected_format = ?detected_format,
                operation = "decode_image",
                "Failed to decode image file"
            );
            AppError::ImageProcessing(format!("Failed to decode image {}: {}", image_path, e))
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

    // ============================================================================
    // Thumbnail Caching Methods
    // ============================================================================

    /// Get thumbnail with caching support (200x200px)
    pub async fn get_cached_thumbnail(&self, record_id: &str, image_url: &str) -> Result<Vec<u8>> {
        // Check if caching is enabled
        let (cache_dir, _client) = match (&self.cache_dir, &self.client) {
            (Some(dir), Some(client)) => (dir, client),
            _ => {
                return Err(AppError::Configuration(
                    "Caching not enabled. Use ImageService::with_cache()".to_string(),
                ))
            }
        };

        log_info!(
            operation = "get_cached_thumbnail",
            record_id = record_id,
            image_url = image_url,
            "Getting cached thumbnail"
        );

        let cache_path = cache_dir.join(format!("{}_200.jpg", record_id));

        // Check if cache exists
        if cache_path.exists() {
            log_debug!(
                cache_path = %cache_path.display(),
                "Loading thumbnail from cache"
            );

            match std::fs::read(&cache_path) {
                Ok(data) => {
                    log_info!(
                        operation = "get_cached_thumbnail",
                        record_id = record_id,
                        cache_hit = true,
                        "Thumbnail loaded from cache"
                    );
                    return Ok(data);
                }
                Err(e) => {
                    log_debug!(
                        error = %e,
                        cache_path = %cache_path.display(),
                        "Failed to read cached thumbnail, will regenerate"
                    );
                }
            }
        }

        // Cache miss, generate new thumbnail
        log_debug!("Cache miss, generating new thumbnail");
        self.generate_and_cache_thumbnail(record_id, image_url)
            .await
    }

    /// Generate and cache thumbnail from URL
    pub async fn generate_and_cache_thumbnail(
        &self,
        record_id: &str,
        image_url: &str,
    ) -> Result<Vec<u8>> {
        // Check if caching is enabled
        let (cache_dir, client) = match (&self.cache_dir, &self.client) {
            (Some(dir), Some(client)) => (dir, client),
            _ => {
                return Err(AppError::Configuration(
                    "Caching not enabled. Use ImageService::with_cache()".to_string(),
                ))
            }
        };

        log_info!(
            operation = "generate_and_cache_thumbnail",
            record_id = record_id,
            image_url = image_url,
            "Generating thumbnail from URL"
        );

        let record_id_clone = record_id.to_string();
        let image_url = image_url.to_string();
        let cache_path = cache_dir.join(format!("{}_200.jpg", record_id));
        let client = client.clone();

        let thumbnail_data = task::spawn_blocking(move || -> Result<Vec<u8>> {
            // Download image
            log_debug!("Downloading image from URL: {}", image_url);

            let rt = tokio::runtime::Handle::current();
            let image_data = rt
                .block_on(async {
                    let response = client
                        .get(&image_url)
                        .send()
                        .await
                        .map_err(|e| format!("Failed to send request: {}", e))?;

                    // Check response status
                    if !response.status().is_success() {
                        return Err(format!("HTTP error: {}", response.status()));
                    }

                    let bytes = response
                        .bytes()
                        .await
                        .map_err(|e| format!("Failed to read response bytes: {}", e))?;
                    Ok::<Vec<u8>, String>(bytes.to_vec())
                })
                .map_err(|e| {
                    AppError::ImageProcessing(format!("Failed to download image: {}", e))
                })?;

            log_debug!(
                image_size = image_data.len(),
                "Image downloaded successfully"
            );

            // Validate that we have actual image data
            if image_data.is_empty() {
                return Err(AppError::ImageProcessing(
                    "Downloaded image data is empty".to_string(),
                ));
            }

            // Try to generate thumbnail directly from memory first
            match Self::generate_thumbnail_from_memory(&image_data, 200) {
                Ok(thumbnail) => {
                    log_debug!(
                        thumbnail_size = thumbnail.len(),
                        "Thumbnail generated from memory successfully"
                    );

                    // Cache thumbnail
                    if let Err(e) = std::fs::write(&cache_path, &thumbnail) {
                        log_debug!(
                            error = %e,
                            cache_path = %cache_path.display(),
                            "Failed to cache thumbnail, but continuing"
                        );
                    } else {
                        log_debug!(
                            cache_path = %cache_path.display(),
                            "Thumbnail cached successfully"
                        );
                    }

                    return Ok(thumbnail);
                }
                Err(e) => {
                    log_debug!(
                        error = %e,
                        "Failed to generate thumbnail from memory, trying file approach"
                    );
                }
            }

            // Fallback: use file-based approach
            // Detect image format from data
            let format = image::guess_format(&image_data).map_err(|e| {
                AppError::ImageProcessing(format!("Failed to detect image format: {}", e))
            })?;

            // Get appropriate file extension
            let extension = match format {
                image::ImageFormat::Jpeg => "jpg",
                image::ImageFormat::Png => "png",
                image::ImageFormat::WebP => "webp",
                image::ImageFormat::Bmp => "bmp",
                image::ImageFormat::Tiff => "tiff",
                image::ImageFormat::Gif => "gif",
                _ => "jpg", // Default fallback
            };

            // Write to temporary file with correct extension
            let temp_dir = std::env::temp_dir();
            let temp_path = temp_dir.join(format!("temp_image_{}.{}", record_id_clone, extension));

            std::fs::write(&temp_path, &image_data)
                .map_err(|e| AppError::FileSystem(format!("Failed to write temp file: {}", e)))?;

            // Generate thumbnail from file
            let thumbnail = Self::generate_thumbnail_sync(temp_path.to_str().unwrap(), 200)?;

            // Clean up temp file
            let _ = std::fs::remove_file(&temp_path);

            log_debug!(
                thumbnail_size = thumbnail.len(),
                "Thumbnail generated from file successfully"
            );

            // Cache thumbnail
            if let Err(e) = std::fs::write(&cache_path, &thumbnail) {
                log_debug!(
                    error = %e,
                    cache_path = %cache_path.display(),
                    "Failed to cache thumbnail, but continuing"
                );
            } else {
                log_debug!(
                    cache_path = %cache_path.display(),
                    "Thumbnail cached successfully"
                );
            }

            Ok(thumbnail)
        })
        .await
        .map_err(|e| AppError::ImageProcessing(format!("Task join error: {}", e)))??;

        log_info!(
            operation = "generate_and_cache_thumbnail",
            record_id = record_id,
            thumbnail_size = thumbnail_data.len(),
            success = true,
            "Thumbnail generation completed"
        );

        Ok(thumbnail_data)
    }

    /// Clean up old cache files (30+ days)
    pub async fn cleanup_old_cache(&self) -> Result<usize> {
        let cache_dir = match &self.cache_dir {
            Some(dir) => dir.clone(),
            None => return Err(AppError::Configuration("Caching not enabled".to_string())),
        };

        log_info!(
            operation = "cleanup_old_cache",
            cache_dir = %cache_dir.display(),
            "Starting cache cleanup"
        );

        let deleted_count = task::spawn_blocking(move || -> Result<usize> {
            let mut deleted = 0;
            let cutoff_time =
                std::time::SystemTime::now() - std::time::Duration::from_secs(30 * 24 * 60 * 60); // 30天

            if !cache_dir.exists() {
                return Ok(0);
            }

            let entries = std::fs::read_dir(&cache_dir).map_err(|e| {
                AppError::FileSystem(format!("Failed to read cache directory: {}", e))
            })?;

            for entry in entries {
                let entry = entry.map_err(|e| {
                    AppError::FileSystem(format!("Failed to read directory entry: {}", e))
                })?;

                let path = entry.path();

                // Only process thumbnail files
                if !path.is_file() || path.extension().is_none_or(|ext| ext != "jpg") {
                    continue;
                }

                // Check file modification time
                match std::fs::metadata(&path) {
                    Ok(metadata) => {
                        if let Ok(modified) = metadata.modified() {
                            if modified < cutoff_time {
                                if let Err(e) = std::fs::remove_file(&path) {
                                    log_debug!(
                                        error = %e,
                                        file_path = %path.display(),
                                        "Failed to delete old cache file"
                                    );
                                } else {
                                    log_debug!(
                                        file_path = %path.display(),
                                        "Deleted old cache file"
                                    );
                                    deleted += 1;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log_debug!(
                            error = %e,
                            file_path = %path.display(),
                            "Failed to get file metadata"
                        );
                    }
                }
            }

            Ok(deleted)
        })
        .await
        .map_err(|e| AppError::ImageProcessing(format!("Task join error: {}", e)))??;

        log_info!(
            operation = "cleanup_old_cache",
            deleted_count = deleted_count,
            "Cache cleanup completed"
        );

        Ok(deleted_count)
    }

    /// Clean up cache by size limit
    #[allow(dead_code)]
    pub async fn cleanup_cache_by_size(&self, max_size_mb: u64) -> Result<usize> {
        let cache_dir = match &self.cache_dir {
            Some(dir) => dir.clone(),
            None => return Err(AppError::Configuration("Caching not enabled".to_string())),
        };

        log_info!(
            operation = "cleanup_cache_by_size",
            max_size_mb = max_size_mb,
            "Starting size-based cache cleanup"
        );

        let max_size_bytes = max_size_mb * 1024 * 1024;

        let deleted_count = task::spawn_blocking(move || -> Result<usize> {
            if !cache_dir.exists() {
                return Ok(0);
            }

            // Collect all cache files
            let mut files = Vec::new();
            let entries = std::fs::read_dir(&cache_dir).map_err(|e| {
                AppError::FileSystem(format!("Failed to read cache directory: {}", e))
            })?;

            for entry in entries {
                let entry = entry.map_err(|e| {
                    AppError::FileSystem(format!("Failed to read directory entry: {}", e))
                })?;

                let path = entry.path();

                if !path.is_file() || path.extension().is_none_or(|ext| ext != "jpg") {
                    continue;
                }

                if let Ok(metadata) = std::fs::metadata(&path) {
                    if let Ok(modified) = metadata.modified() {
                        files.push((path, metadata.len(), modified));
                    }
                }
            }

            // Sort by modification time (oldest first)
            files.sort_by_key(|(_, _, modified)| *modified);

            // Calculate total size
            let total_size: u64 = files.iter().map(|(_, size, _)| *size).sum();

            if total_size <= max_size_bytes {
                log_debug!(
                    total_size_mb = total_size / 1024 / 1024,
                    max_size_mb = max_size_mb,
                    "Cache size within limit, no cleanup needed"
                );
                return Ok(0);
            }

            // Delete oldest files until size is within limit
            let mut current_size = total_size;
            let mut deleted = 0;

            for (path, size, _) in files {
                if current_size <= max_size_bytes {
                    break;
                }

                if let Err(e) = std::fs::remove_file(&path) {
                    log_debug!(
                        error = %e,
                        file_path = %path.display(),
                        "Failed to delete cache file"
                    );
                } else {
                    log_debug!(
                        file_path = %path.display(),
                        file_size = size,
                        "Deleted cache file for size limit"
                    );
                    current_size -= size;
                    deleted += 1;
                }
            }

            Ok(deleted)
        })
        .await
        .map_err(|e| AppError::ImageProcessing(format!("Task join error: {}", e)))??;

        log_info!(
            operation = "cleanup_cache_by_size",
            deleted_count = deleted_count,
            "Size-based cache cleanup completed"
        );

        Ok(deleted_count)
    }

    /// Check if thumbnail cache exists
    #[allow(dead_code)]
    pub fn cache_exists(&self, record_id: &str) -> bool {
        match &self.cache_dir {
            Some(cache_dir) => {
                let cache_path = cache_dir.join(format!("{}_200.jpg", record_id));
                cache_path.exists()
            }
            None => false,
        }
    }

    /// Get cache statistics
    #[allow(dead_code)]
    pub async fn get_cache_stats(&self) -> Result<CacheStats> {
        let cache_dir = match &self.cache_dir {
            Some(dir) => dir.clone(),
            None => return Err(AppError::Configuration("Caching not enabled".to_string())),
        };

        let stats = task::spawn_blocking(move || -> Result<CacheStats> {
            if !cache_dir.exists() {
                return Ok(CacheStats {
                    total_files: 0,
                    total_size_bytes: 0,
                    oldest_file: None,
                    newest_file: None,
                });
            }

            let mut total_files = 0;
            let mut total_size = 0;
            let mut oldest: Option<std::time::SystemTime> = None;
            let mut newest: Option<std::time::SystemTime> = None;

            let entries = std::fs::read_dir(&cache_dir).map_err(|e| {
                AppError::FileSystem(format!("Failed to read cache directory: {}", e))
            })?;

            for entry in entries {
                let entry = entry.map_err(|e| {
                    AppError::FileSystem(format!("Failed to read directory entry: {}", e))
                })?;

                let path = entry.path();

                if !path.is_file() || path.extension().is_none_or(|ext| ext != "jpg") {
                    continue;
                }

                if let Ok(metadata) = std::fs::metadata(&path) {
                    total_files += 1;
                    total_size += metadata.len();

                    if let Ok(modified) = metadata.modified() {
                        match oldest {
                            None => oldest = Some(modified),
                            Some(old) if modified < old => oldest = Some(modified),
                            _ => {}
                        }

                        match newest {
                            None => newest = Some(modified),
                            Some(new) if modified > new => newest = Some(modified),
                            _ => {}
                        }
                    }
                }
            }

            Ok(CacheStats {
                total_files,
                total_size_bytes: total_size,
                oldest_file: oldest,
                newest_file: newest,
            })
        })
        .await
        .map_err(|e| AppError::ImageProcessing(format!("Task join error: {}", e)))??;

        Ok(stats)
    }
}

/// Cache statistics
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CacheStats {
    pub total_files: usize,
    pub total_size_bytes: u64,
    pub oldest_file: Option<std::time::SystemTime>,
    pub newest_file: Option<std::time::SystemTime>,
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
        assert!((149..=150).contains(&thumb_width));
        assert!((112..=113).contains(&thumb_height));
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
        assert!((112..=113).contains(&thumb_width));
        assert!((149..=150).contains(&thumb_height));
    }

    #[tokio::test]
    async fn test_generate_thumbnail_invalid_path() {
        let service = ImageService::new();

        let result = service.generate_thumbnail("nonexistent.png", 150).await;
        assert!(result.is_err());

        if let Err(AppError::ImageProcessing(msg)) = result {
            assert!(
                msg.contains("Image file does not exist") || msg.contains("Failed to open image")
            );
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
