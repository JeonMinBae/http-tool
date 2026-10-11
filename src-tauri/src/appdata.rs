use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

/// Only these documents may be read or written by the frontend.
fn validate_name(name: &str) -> AppResult<()> {
    const FIXED: [&str; 5] = ["globals", "environments", "settings", "workspace", "oauth-tokens"];
    let ok = FIXED.contains(&name)
        || name
            .strip_prefix("secrets/")
            .is_some_and(|h| h.len() == 64 && h.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()));
    if ok { Ok(()) } else { Err(AppError::Invalid(format!("unknown app data: {name}"))) }
}

pub fn data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_data_dir().map_err(|e| AppError::Invalid(e.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Writes through a temporary file and rename so readers never see a partial file.
pub fn write_atomic(path: &Path, content: &[u8]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, content)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn read_json_at(base: &Path, name: &str) -> AppResult<Option<serde_json::Value>> {
    validate_name(name)?;
    let path = base.join(format!("{name}.json"));
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(serde_json::from_str(&text)?)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn write_json_at(base: &Path, name: &str, value: &serde_json::Value) -> AppResult<()> {
    validate_name(name)?;
    write_atomic(&base.join(format!("{name}.json")), serde_json::to_string_pretty(value)?.as_bytes())
}

#[tauri::command]
pub fn appdata_read(app: AppHandle, name: String) -> AppResult<Option<serde_json::Value>> {
    read_json_at(&data_dir(&app)?, &name)
}

#[tauri::command]
pub fn appdata_write(app: AppHandle, name: String, value: serde_json::Value) -> AppResult<()> {
    write_json_at(&data_dir(&app)?, &name, &value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn round_trips_allowed_names() {
        let dir = tempfile::tempdir().unwrap();
        let hash = "a".repeat(64);
        write_json_at(dir.path(), "globals", &json!([1])).unwrap();
        write_json_at(dir.path(), &format!("secrets/{hash}"), &json!({"k": "v"})).unwrap();
        assert_eq!(read_json_at(dir.path(), "globals").unwrap(), Some(json!([1])));
        assert_eq!(read_json_at(dir.path(), &format!("secrets/{hash}")).unwrap(), Some(json!({"k": "v"})));
        assert!(!dir.path().join("globals.tmp").exists());
    }

    #[test]
    fn missing_file_reads_as_none() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_json_at(dir.path(), "settings").unwrap(), None);
    }

    #[test]
    fn rejects_unknown_names() {
        let dir = tempfile::tempdir().unwrap();
        for bad in ["../x", "secrets/../../x", "secrets/abc", "history", &format!("secrets/{}", "A".repeat(64))] {
            assert!(write_json_at(dir.path(), bad, &json!(1)).is_err(), "{bad}");
        }
    }
}
