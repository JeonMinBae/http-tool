mod appdata;
mod cookies;
mod error;
mod files;
mod fs_commands;
mod history;
mod http;
mod oauth;
mod state;
mod ws;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // wss:// connections build their TLS config from the process-wide provider.
    let _ = rustls::crypto::ring::default_provider().install_default();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .manage(oauth::OAuthListeners::default())
        .manage(http::stream::StreamRegistry::default())
        .manage(ws::WsRegistry::default())
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
            http::stream::stream_cancel,
            history::history_append,
            history::history_list,
            history::history_get,
            history::history_clear,
            oauth::oauth_listen,
            oauth::oauth_wait,
            ws::ws_connect,
            ws::ws_send,
            ws::ws_close,
            files::file_save_base64,
            files::file_pick_text,
            files::dir_create_unique,
            files::dir_create_new,
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
