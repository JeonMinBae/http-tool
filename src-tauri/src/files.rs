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
