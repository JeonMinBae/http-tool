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

/// Reads a UTF-8 text file the user picked in an open dialog.
#[tauri::command]
pub fn file_read_text(path: String) -> AppResult<String> {
    Ok(std::fs::read_to_string(path)?)
}

/// Creates `<parent>/<name>` for a new collection, or `<name>-2`, `<name>-3` … when taken. Returns the new path.
#[tauri::command]
pub fn dir_create_unique(parent: String, name: String) -> AppResult<String> {
    create_unique_dir(std::path::Path::new(&parent), &name).map(|p| p.to_string_lossy().to_string())
}

fn create_unique_dir(parent: &std::path::Path, name: &str) -> AppResult<std::path::PathBuf> {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\']) {
        return Err(AppError::Invalid(format!("invalid folder name: {name}")));
    }
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
    fn rejects_path_like_names() {
        let dir = tempfile::tempdir().unwrap();
        assert!(create_unique_dir(dir.path(), "../x").is_err());
        assert!(create_unique_dir(dir.path(), "..").is_err());
        assert!(create_unique_dir(dir.path(), "").is_err());
    }
}
