mod error;
mod fs_commands;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            fs_commands::collection_register,
            fs_commands::collection_unregister,
            fs_commands::fs_read_tree,
            fs_commands::fs_read_file,
            fs_commands::fs_write_file,
            fs_commands::fs_create_dir,
            fs_commands::fs_rename,
            fs_commands::fs_copy,
            fs_commands::fs_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
