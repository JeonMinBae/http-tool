use base64::Engine;

use crate::error::{AppError, AppResult};

/// Writes bytes to a path the user picked in a save dialog.
#[tauri::command]
pub fn file_save_base64(path: String, data: String) -> AppResult<()> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| AppError::Invalid(e.to_string()))?;
    std::fs::write(path, bytes)?;
    Ok(())
}

/// Largest import file accepted (bytes).
const MAX_TEXT_FILE: u64 = 32 * 1024 * 1024;

#[derive(serde::Serialize)]
pub struct PickedText {
    pub name: String,
    pub content: String,
}

/// Shows an open dialog and reads the chosen UTF-8 file. The webview never supplies the path,
/// so this cannot be used to read arbitrary files. `None` when the dialog is cancelled.
#[tauri::command]
pub async fn file_pick_text(app: tauri::AppHandle, title: String, extensions: Vec<String>) -> AppResult<Option<PickedText>> {
    use tauri_plugin_dialog::DialogExt;
    let exts: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let Some(picked) = app.dialog().file().set_title(title).add_filter("Supported files", &exts).blocking_pick_file() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| AppError::Invalid(e.to_string()))?;
    let content = read_text_capped(&path, MAX_TEXT_FILE)?;
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    Ok(Some(PickedText { name, content }))
}

fn read_text_capped(path: &std::path::Path, max: u64) -> AppResult<String> {
    let size = std::fs::metadata(path)?.len();
    if size > max {
        return Err(AppError::Invalid(format!("file is too large ({size} bytes, limit {max})")));
    }
    Ok(std::fs::read_to_string(path)?)
}

/// Creates `<parent>/<name>` for a new collection, or `<name>-2`, `<name>-3` … when taken. Returns the new path.
#[tauri::command]
pub fn dir_create_unique(parent: String, name: String) -> AppResult<String> {
    create_unique_dir(std::path::Path::new(&parent), &name).map(|p| p.to_string_lossy().to_string())
}

/// Creates `<parent>/<name>` for a new, empty collection; fails when it already exists. Returns the new path.
#[tauri::command]
pub fn dir_create_new(parent: String, name: String) -> AppResult<String> {
    create_new_dir(std::path::Path::new(&parent), &name).map(|p| p.to_string_lossy().to_string())
}

fn check_dir_name(name: &str) -> AppResult<()> {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\']) {
        return Err(AppError::Invalid(format!("invalid folder name: {name}")));
    }
    Ok(())
}

fn create_new_dir(parent: &std::path::Path, name: &str) -> AppResult<std::path::PathBuf> {
    check_dir_name(name)?;
    let path = dunce::canonicalize(parent)?.join(name);
    // create_dir (not create_dir_all) fails atomically when the folder exists.
    std::fs::create_dir(&path).map_err(|e| match e.kind() {
        std::io::ErrorKind::AlreadyExists => AppError::Invalid(format!("folder already exists: {}", path.display())),
        _ => e.into(),
    })?;
    Ok(path)
}

fn create_unique_dir(parent: &std::path::Path, name: &str) -> AppResult<std::path::PathBuf> {
    check_dir_name(name)?;
    let parent = dunce::canonicalize(parent)?;
    let mut candidate = parent.join(name);
    let mut n = 2;
    while candidate.exists() {
        candidate = parent.join(format!("{name}-{n}"));
        n += 1;
    }
    std::fs::create_dir(&candidate)?;
    Ok(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_dir_with_plain_name_when_free() {
        let dir = tempfile::tempdir().unwrap();
        let p = create_unique_dir(dir.path(), "Pets").unwrap();
        assert_eq!(p.file_name().unwrap(), "Pets");
        assert!(p.is_dir());
    }

    #[test]
    fn creates_suffixed_dir_when_taken() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("Pets")).unwrap();
        std::fs::create_dir(dir.path().join("Pets-2")).unwrap();
        let p = create_unique_dir(dir.path(), "Pets").unwrap();
        assert_eq!(p.file_name().unwrap(), "Pets-3");
        assert!(p.is_dir());
    }

    #[test]
    fn read_text_capped_rejects_large_files() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.json");
        std::fs::write(&p, "{\"a\":1}").unwrap();
        assert_eq!(read_text_capped(&p, 100).unwrap(), "{\"a\":1}");
        assert!(read_text_capped(&p, 3).is_err());
    }

    #[test]
    fn create_new_dir_creates_once_and_rejects_existing_or_path_like_names() {
        let dir = tempfile::tempdir().unwrap();
        let p = create_new_dir(dir.path(), "Pets").unwrap();
        assert!(p.is_dir());
        assert!(create_new_dir(dir.path(), "Pets").unwrap_err().to_string().contains("already exists"));
        assert!(create_new_dir(dir.path(), "../x").is_err());
    }

    #[test]
    fn rejects_path_like_names() {
        let dir = tempfile::tempdir().unwrap();
        assert!(create_unique_dir(dir.path(), "../x").is_err());
        assert!(create_unique_dir(dir.path(), "..").is_err());
        assert!(create_unique_dir(dir.path(), "").is_err());
    }
}
