mod commands;
mod models;
mod services;
mod utils;

use commands::*;
use utils::init_logger;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger
    if let Err(e) = init_logger(None) {
        eprintln!("Failed to initialize logger: {}", e);
    }
    tauri::Builder::default()
        .plugin(
            tauri_plugin_stronghold::Builder::new(|_| {
                // 使用固定的应用密码，通过 Argon2 进行哈希处理
                b"imgtoss-secret-key-2024".to_vec()
            })
            .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // File and Scan Commands
            scan_markdown_files,
            get_image_info,
            generate_thumbnail,
            // Upload Commands
            upload_images,
            upload_images_with_ids,
            upload_images_batch,
            get_upload_progress,
            cancel_upload,
            retry_upload,
            // OSS Configuration Commands
            save_oss_config,
            load_oss_config,
            test_oss_connection,
            validate_oss_config,
            get_cached_connection_status,
            clear_connection_cache,
            list_oss_objects,
            export_oss_config,
            import_oss_config,
            // Multi-Config Management Commands
            get_all_configs,
            save_config_item,
            set_active_config,
            delete_config_item,
            get_active_config,
            // File Operations Commands
            replace_markdown_links,
            replace_markdown_links_with_result,
            replace_single_file_links,
            // History Commands
            get_upload_history,
            search_history,
            clear_history,
            export_history,
            get_history_statistics,
            // 上传历史记录命令
            add_upload_history_record,
            add_batch_upload_history_records,
            get_upload_history_records,
            find_duplicate_by_checksum,
            delete_upload_history_record,
            clear_upload_history,
            // 图片历史记录命令
            get_image_history,
            delete_image_history_record,
            clear_image_history,
            cleanup_old_history,
            get_file_operations,
            // Progress Monitoring Commands
            get_all_upload_progress,
            clear_upload_progress,
            generate_uuid,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
