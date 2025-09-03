// Example usage of the Tauri API integration
// This file demonstrates how to use the type-safe Tauri API client

import { tauriAPI, fileOperations, configOperations, uploadOperations, historyOperations } from '../tauri-api';
import { withErrorHandling, withRetry, getUserFriendlyErrorMessage, TauriError } from '../error-handler';
import { OSSProvider, type OSSConfig } from '../types';

/**
 * Example: Scanning markdown files for images
 */
export async function scanMarkdownExample() {
  try {
    const filePaths = ['/path/to/document.md', '/path/to/another.md'];

    // Using the centralized API
    const results = await tauriAPI.scanMarkdownFiles(filePaths);

    // Or using the convenience method
    // const results = await fileOperations.scanMarkdownFiles(filePaths);

    console.log('Scan results:', results);

    // Process results
    for (const result of results) {
      if (result.status === 'Success') {
        console.log(`Found ${result.images.length} images in ${result.file_path}`);

        // Get detailed info for each image
        for (const image of result.images) {
          if (image.exists) {
            const imageInfo = await tauriAPI.getImageInfo(image.absolute_path);
            console.log(`Image ${image.id}: ${imageInfo.width}x${imageInfo.height} ${imageInfo.format}`);
          }
        }
      } else {
        console.error(`Error scanning ${result.file_path}:`, result.error);
      }
    }

    return results;
  } catch (error) {
    console.error('Failed to scan markdown files:', error);
    throw error;
  }
}

/**
 * Example: Configuring OSS storage with error handling
 */
export async function configureOSSExample() {
  const config: OSSConfig = {
    provider: OSSProvider.Aliyun,
    endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
    access_key_id: 'your-access-key',
    access_key_secret: 'your-secret-key',
    bucket: 'your-bucket-name',
    region: 'cn-hangzhou',
    path_template: 'images/{year}/{month}/{filename}',
    cdn_domain: 'https://cdn.example.com',
    compression_enabled: true,
    compression_quality: 80,
  };

  try {
    // Validate configuration first
    const validation = await withErrorHandling(
      () => tauriAPI.validateOSSConfig(config),
      'Configuration validation'
    );

    if (!validation.valid) {
      console.error('Configuration errors:', validation.errors);
      return false;
    }

    // Test connection with retry
    const connectionTest = await withRetry(
      () => tauriAPI.testOSSConnection(config),
      3,
      2000,
      'OSS connection test'
    );

    if (!connectionTest.success) {
      console.error('Connection test failed:', connectionTest.error);
      return false;
    }

    console.log(`Connection successful! Latency: ${connectionTest.latency}ms`);

    // Save configuration
    await tauriAPI.saveOSSConfig(config);
    console.log('Configuration saved successfully');

    return true;
  } catch (error) {
    if (error instanceof TauriError) {
      const userMessage = getUserFriendlyErrorMessage(error);
      console.error(`${userMessage.title}: ${userMessage.message}`);
      console.log('Suggestions:', userMessage.suggestions);
    } else {
      console.error('Unexpected error:', error);
    }
    return false;
  }
}

/**
 * Example: Uploading images with progress tracking
 */
export async function uploadImagesExample() {
  try {
    // Load saved configuration
    const config = await tauriAPI.loadOSSConfig();
    if (!config) {
      throw new Error('No OSS configuration found. Please configure storage first.');
    }

    // Example image IDs (would come from scanning results)
    const imageIds = ['image-1-uuid', 'image-2-uuid', 'image-3-uuid'];

    console.log(`Starting upload of ${imageIds.length} images...`);

    // Start upload
    const uploadResults = await tauriAPI.uploadImages(imageIds, config);

    // Process results
    const successful = uploadResults.filter(r => r.success);
    const failed = uploadResults.filter(r => !r.success);

    console.log(`Upload completed: ${successful.length} successful, ${failed.length} failed`);

    // Log successful uploads
    for (const result of successful) {
      console.log(`✓ ${result.image_id}: ${result.uploaded_url}`);
    }

    // Log failed uploads
    for (const result of failed) {
      console.error(`✗ ${result.image_id}: ${result.error}`);
    }

    return uploadResults;
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}

/**
 * Example: Managing upload history
 */
export async function manageHistoryExample() {
  try {
    // Get paginated history
    const historyPage = await tauriAPI.getUploadHistory(1, 10);

    console.log(`History: ${historyPage.items.length} items (${historyPage.total} total)`);

    // Display recent operations
    for (const record of historyPage.items) {
      const status = record.success ? '✓' : '✗';
      const duration = record.duration ? `${record.duration}ms` : 'N/A';

      console.log(
        `${status} ${record.operation} - ${record.image_count} images - ${duration} - ${record.timestamp}`
      );

      if (!record.success && record.error_message) {
        console.log(`  Error: ${record.error_message}`);
      }
    }

    // Get statistics
    const stats = await tauriAPI.getHistoryStatistics();
    console.log('Statistics:', {
      totalOperations: stats.total_records,
      successRate: `${((stats.successful_operations / stats.total_records) * 100).toFixed(1)}%`,
      totalImagesUploaded: stats.total_images_processed,
      averageDuration: `${stats.average_duration}ms`,
    });

    return { history: historyPage, stats };
  } catch (error) {
    console.error('Failed to get history:', error);
    throw error;
  }
}

/**
 * Example: File backup and recovery
 */
export async function backupAndRecoveryExample() {
  const filePath = '/path/to/document.md';

  try {
    // Create backup before modification
    console.log('Creating backup...');
    const backup = await tauriAPI.createBackup(filePath);
    console.log(`Backup created: ${backup.id} -> ${backup.backup_path}`);

    // Simulate file modification (would be done by link replacement)
    console.log('File would be modified here...');

    // List all backups for this file
    const backups = await tauriAPI.listBackups(filePath);
    console.log(`Found ${backups.length} backups for ${filePath}`);

    // If something goes wrong, restore from backup
    if (Math.random() > 0.5) { // Simulate random failure
      console.log('Simulating failure - restoring from backup...');
      await tauriAPI.restoreFromBackup(backup.id);
      console.log('File restored successfully');
    }

    return backup;
  } catch (error) {
    console.error('Backup/recovery failed:', error);
    throw error;
  }
}

/**
 * Example: Complete workflow - scan, upload, and update links
 */
export async function completeWorkflowExample() {
  try {
    console.log('Starting complete workflow...');

    // 1. Scan markdown files
    const scanResults = await scanMarkdownExample();

    // 2. Extract image IDs that exist
    const imageIds: string[] = [];
    for (const result of scanResults) {
      if (result.status === 'Success') {
        for (const image of result.images) {
          if (image.exists) {
            imageIds.push(image.id);
          }
        }
      }
    }

    if (imageIds.length === 0) {
      console.log('No images found to upload');
      return;
    }

    // 3. Upload images
    console.log(`Uploading ${imageIds.length} images...`);
    const config = await tauriAPI.loadOSSConfig();
    if (!config) {
      throw new Error('No OSS configuration found');
    }

    const uploadResults = await tauriAPI.uploadImages(imageIds, config);

    // 4. Prepare link replacements
    const replacements = [];
    for (const result of uploadResults) {
      if (result.success && result.uploaded_url) {
        // Find the corresponding image reference
        for (const scanResult of scanResults) {
          const image = scanResult.images.find(img => img.id === result.image_id);
          if (image) {
            replacements.push({
              file_path: scanResult.file_path,
              line: image.markdown_line,
              column: image.markdown_column,
              old_link: image.original_path,
              new_link: result.uploaded_url,
            });
          }
        }
      }
    }

    // 5. Replace links in markdown files
    if (replacements.length > 0) {
      console.log(`Replacing ${replacements.length} links...`);
      const replacementResult = await tauriAPI.replaceMarkdownLinksWithResult(replacements);

      console.log(`Replacement completed: ${replacementResult.total_successful_replacements} successful`);

      // 6. Add to history
      await tauriAPI.addHistoryRecord(
        'complete_workflow',
        scanResults.map(r => r.file_path),
        imageIds.length,
        replacementResult.total_failed_replacements === 0,
        undefined,
        Date.now() - performance.now(),
        undefined,
        replacementResult.total_failed_replacements > 0 ? 'Some replacements failed' : undefined
      );
    }

    console.log('Workflow completed successfully!');
  } catch (error) {
    console.error('Workflow failed:', error);

    // Add failed operation to history
    try {
      await tauriAPI.addHistoryRecord(
        'complete_workflow',
        [],
        0,
        false,
        undefined,
        undefined,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
    } catch (historyError) {
      console.error('Failed to record error in history:', historyError);
    }

    throw error;
  }
}

// Import updater examples
import { updaterExamples } from './updater-usage-examples';

// Export all examples for easy testing
export const examples = {
  scanMarkdown: scanMarkdownExample,
  configureOSS: configureOSSExample,
  uploadImages: uploadImagesExample,
  manageHistory: manageHistoryExample,
  backupAndRecovery: backupAndRecoveryExample,
  completeWorkflow: completeWorkflowExample,
  // Updater examples
  ...updaterExamples,
};