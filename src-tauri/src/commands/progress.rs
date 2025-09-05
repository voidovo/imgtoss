use crate::models::UploadProgress;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

/// Progress notification system for async operations
#[derive(Clone)]
pub struct ProgressNotifier {
    progress_map: Arc<Mutex<HashMap<String, UploadProgress>>>,
    sender: broadcast::Sender<UploadProgress>,
    app_handle: Option<AppHandle>,
}

impl ProgressNotifier {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(1000);
        Self {
            progress_map: Arc::new(Mutex::new(HashMap::new())),
            sender,
            app_handle: None,
        }
    }

    #[allow(dead_code)]
    pub fn with_app_handle(app_handle: AppHandle) -> Self {
        let (sender, _) = broadcast::channel(1000);
        Self {
            progress_map: Arc::new(Mutex::new(HashMap::new())),
            sender,
            app_handle: Some(app_handle),
        }
    }

    #[allow(dead_code)]
    pub fn set_app_handle(&mut self, app_handle: AppHandle) {
        self.app_handle = Some(app_handle);
    }

    /// Update progress for a specific task
    pub fn update_progress(&self, task_id: String, progress: UploadProgress) -> Result<(), String> {
        // Update the progress map
        {
            let mut map = self.progress_map.lock().map_err(|e| e.to_string())?;
            map.insert(task_id.clone(), progress.clone());
        }

        // Broadcast the update
        if let Err(_) = self.sender.send(progress.clone()) {
            // No receivers, which is fine
        }

        // Emit Tauri event for frontend listeners
        if let Some(app_handle) = &self.app_handle {
            let _ = app_handle.emit("upload-progress", &progress);
        }

        Ok(())
    }

    /// Get current progress for a task
    pub fn get_progress(&self, task_id: &str) -> Result<Option<UploadProgress>, String> {
        let map = self.progress_map.lock().map_err(|e| e.to_string())?;
        Ok(map.get(task_id).cloned())
    }

    /// Remove progress tracking for a completed task
    pub fn remove_progress(&self, task_id: &str) -> Result<(), String> {
        let mut map = self.progress_map.lock().map_err(|e| e.to_string())?;
        map.remove(task_id);
        Ok(())
    }

    /// Get a receiver for progress updates
    #[allow(dead_code)]
    pub fn subscribe(&self) -> broadcast::Receiver<UploadProgress> {
        self.sender.subscribe()
    }

    /// Get all current progress states
    pub fn get_all_progress(&self) -> Result<Vec<UploadProgress>, String> {
        let map = self.progress_map.lock().map_err(|e| e.to_string())?;
        Ok(map.values().cloned().collect())
    }

    /// Clear all progress data
    pub fn clear_all(&self) -> Result<(), String> {
        let mut map = self.progress_map.lock().map_err(|e| e.to_string())?;
        map.clear();
        Ok(())
    }
}

impl Default for ProgressNotifier {
    fn default() -> Self {
        Self::new()
    }
}

// Global progress notifier instance
lazy_static::lazy_static! {
    pub static ref PROGRESS_NOTIFIER: ProgressNotifier = ProgressNotifier::new();
}

/// Helper function to create progress update
#[allow(dead_code)]
pub fn create_progress_update(
    image_id: String,
    progress: f32,
    bytes_uploaded: u64,
    total_bytes: u64,
    speed: Option<u64>,
) -> UploadProgress {
    UploadProgress {
        image_id,
        progress,
        bytes_uploaded,
        total_bytes,
        speed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_progress_notifier_creation() {
        let notifier = ProgressNotifier::new();
        assert!(notifier.get_all_progress().unwrap().is_empty());
    }

    #[test]
    fn test_progress_update_and_get() {
        let notifier = ProgressNotifier::new();
        let task_id = "test-task-123".to_string();
        let progress = create_progress_update("image-123".to_string(), 50.0, 1024, 2048, Some(512));

        // Update progress
        assert!(notifier
            .update_progress(task_id.clone(), progress.clone())
            .is_ok());

        // Get progress
        let retrieved = notifier.get_progress(&task_id).unwrap();
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.image_id, "image-123");
        assert_eq!(retrieved.progress, 50.0);
        assert_eq!(retrieved.bytes_uploaded, 1024);
        assert_eq!(retrieved.total_bytes, 2048);
        assert_eq!(retrieved.speed, Some(512));
    }

    #[test]
    fn test_progress_remove() {
        let notifier = ProgressNotifier::new();
        let task_id = "test-task-456".to_string();
        let progress = create_progress_update("image-456".to_string(), 100.0, 2048, 2048, None);

        // Add progress
        notifier.update_progress(task_id.clone(), progress).unwrap();
        assert!(notifier.get_progress(&task_id).unwrap().is_some());

        // Remove progress
        notifier.remove_progress(&task_id).unwrap();
        assert!(notifier.get_progress(&task_id).unwrap().is_none());
    }

    #[test]
    fn test_get_all_progress() {
        let notifier = ProgressNotifier::new();

        // Add multiple progress entries
        for i in 0..3 {
            let task_id = format!("task-{}", i);
            let progress = create_progress_update(
                format!("image-{}", i),
                (i as f32) * 33.33,
                i * 1024,
                3072,
                Some(256),
            );
            notifier.update_progress(task_id, progress).unwrap();
        }

        let all_progress = notifier.get_all_progress().unwrap();
        assert_eq!(all_progress.len(), 3);
    }

    #[test]
    fn test_clear_all() {
        let notifier = ProgressNotifier::new();

        // Add some progress
        let progress =
            create_progress_update("image-clear".to_string(), 75.0, 1536, 2048, Some(128));
        notifier
            .update_progress("task-clear".to_string(), progress)
            .unwrap();

        assert_eq!(notifier.get_all_progress().unwrap().len(), 1);

        // Clear all
        notifier.clear_all().unwrap();
        assert!(notifier.get_all_progress().unwrap().is_empty());
    }

    #[test]
    fn test_subscribe() {
        let notifier = ProgressNotifier::new();
        let mut receiver = notifier.subscribe();

        // This test just ensures the subscription works
        // In a real scenario, you'd spawn a task to listen for updates
        assert!(receiver.try_recv().is_err()); // No messages yet
    }
}
