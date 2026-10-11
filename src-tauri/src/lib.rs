mod appdata;
mod cookies;
mod error;
mod fs_commands;
mod http;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            let dir = appdata::data_dir(app.handle())?;
            app.manage(cookies::CookieJar::load(dir.join("cookies.json")));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            appdata::appdata_read,
            appdata::appdata_write,
            cookies::cookie_list,
            cookies::cookie_upsert,
            cookies::cookie_delete,
            cookies::cookie_clear,
            http::client::http_send,
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
