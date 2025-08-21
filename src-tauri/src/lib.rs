mod commands;
mod models;
mod services;
mod utils;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // File and Scan Commands
            scan_markdown_files,
            get_image_info,
            generate_thumbnail,
            // Upload Commands
            upload_images,
            upload_images_batch,
            get_upload_progress,
            cancel_upload,
            retry_upload,
            // OSS Configuration Commands
            save_oss_config,
            load_oss_config,
            test_oss_connection,
            validate_oss_config,
            list_oss_objects,
            export_oss_config,
            import_oss_config,
            // File Operations Commands
            replace_markdown_links,
            replace_markdown_links_with_result,
            replace_single_file_links,
            rollback_file_changes,
            create_backup,
            restore_from_backup,
            list_backups,
            // History Commands
            get_upload_history,
            search_history,
            clear_history,
            export_history,
            add_history_record,
            get_history_statistics,
            delete_backup,
            cleanup_old_backups,
            cleanup_old_history,
            get_file_operations,
            // Progress Monitoring Commands
            get_all_upload_progress,
            clear_upload_progress,
            // Security and Health Commands
            health_check,
            validate_system_permissions,
            // Utility Commands
            get_app_version,
            validate_file_path,
            get_file_size,
            // Duplicate Detection Commands
            calculate_image_checksum,
            check_duplicate_by_checksum,
            check_duplicates_batch,
            get_duplicate_info,
            // System Health and Monitoring Commands
            get_system_health,
            get_notification_config,
            update_notification_config,
            send_notification,
            // Enhanced Upload Task Management Commands
            cancel_upload_task,
            retry_upload_task,
            get_upload_task_status,
            get_all_upload_tasks,
            // Debug Commands
            debug_tencent_cos_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
