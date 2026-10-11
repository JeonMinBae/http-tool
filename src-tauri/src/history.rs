use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::appdata::{data_dir, write_atomic};
use crate::error::{AppError, AppResult};

/// Response bodies larger than this are truncated before being stored.
pub const MAX_BODY: usize = 1024 * 1024;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistorySummary {
    pub id: String,
    pub time: i64,
    pub method: String,
    pub url: String,
    pub status: Option<u16>,
    pub elapsed_ms: Option<u64>,
    pub error: Option<String>,
}

fn validate_id(id: &str) -> AppResult<()> {
    if !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
        Ok(())
    } else {
        Err(AppError::Invalid(format!("invalid history id: {id}")))
    }
}

fn read_index(dir: &Path) -> AppResult<Vec<HistorySummary>> {
    match fs::read_to_string(dir.join("index.json")) {
        Ok(t) => Ok(serde_json::from_str(&t).unwrap_or_default()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(e.into()),
    }
}

/// Truncates `result.bodyBase64` to MAX_BODY decoded bytes, keeping valid base64.
fn truncate_body(entry: &mut Value) -> bool {
    let max_b64 = MAX_BODY.div_ceil(3) * 4;
    if let Some(Value::String(b64)) = entry.pointer_mut("/result/bodyBase64") {
        if b64.len() > max_b64 {
            b64.truncate(max_b64);
            return true;
        }
    }
    false
}

fn summary(entry: &Value) -> AppResult<HistorySummary> {
    let s = |p: &str| entry.pointer(p).and_then(Value::as_str).map(str::to_string);
    Ok(HistorySummary {
        id: s("/id").ok_or_else(|| AppError::Invalid("history entry without id".into()))?,
        time: entry.pointer("/time").and_then(Value::as_i64).unwrap_or(0),
        method: s("/method").unwrap_or_default(),
        url: s("/url").unwrap_or_default(),
        status: entry.pointer("/result/status").and_then(Value::as_u64).map(|v| v as u16),
        elapsed_ms: entry.pointer("/result/elapsedMs").and_then(Value::as_u64),
        error: s("/error"),
    })
}

pub fn append(dir: &Path, mut entry: Value, limit: usize) -> AppResult<()> {
    let sum = summary(&entry)?;
    validate_id(&sum.id)?;
    if truncate_body(&mut entry) {
        entry["truncated"] = Value::Bool(true);
    }
    fs::create_dir_all(dir)?;
    write_atomic(&dir.join(format!("{}.json", sum.id)), &serde_json::to_vec(&entry)?)?;
    let mut index = read_index(dir)?;
    index.insert(0, sum);
    let keep = limit.max(1).min(index.len());
    for old in index.drain(keep..) {
        let _ = fs::remove_file(dir.join(format!("{}.json", old.id)));
    }
    write_atomic(&dir.join("index.json"), &serde_json::to_vec(&index)?)
}

pub fn get(dir: &Path, id: &str) -> AppResult<Value> {
    validate_id(id)?;
    Ok(serde_json::from_str(&fs::read_to_string(dir.join(format!("{id}.json")))?)?)
}

pub fn clear(dir: &Path) -> AppResult<()> {
    if dir.exists() {
        fs::remove_dir_all(dir)?;
    }
    Ok(())
}

fn history_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(data_dir(app)?.join("history"))
}

#[tauri::command]
pub fn history_append(app: AppHandle, entry: Value, limit: usize) -> AppResult<()> {
    append(&history_dir(&app)?, entry, limit)
}

#[tauri::command]
pub fn history_list(app: AppHandle) -> AppResult<Vec<HistorySummary>> {
    read_index(&history_dir(&app)?)
}

#[tauri::command]
pub fn history_get(app: AppHandle, id: String) -> AppResult<Value> {
    get(&history_dir(&app)?, &id)
}

#[tauri::command]
pub fn history_clear(app: AppHandle) -> AppResult<()> {
    clear(&history_dir(&app)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn entry(id: &str, body: &str) -> Value {
        json!({ "id": id, "time": 1, "method": "GET", "url": "http://a", "result": { "status": 200, "elapsedMs": 5, "bodyBase64": body } })
    }

    #[test]
    fn keeps_only_the_latest_entries() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..5 {
            append(dir.path(), entry(&format!("e{i}"), "QQ=="), 3).unwrap();
        }
        let ids: Vec<_> = read_index(dir.path()).unwrap().into_iter().map(|s| s.id).collect();
        assert_eq!(ids, vec!["e4", "e3", "e2"]);
        assert!(!dir.path().join("e0.json").exists());
        assert!(dir.path().join("e2.json").exists());
    }

    #[test]
    fn truncates_large_bodies() {
        let dir = tempfile::tempdir().unwrap();
        let big = "A".repeat(MAX_BODY * 2);
        append(dir.path(), entry("big", &big), 10).unwrap();
        let stored = get(dir.path(), "big").unwrap();
        let b64 = stored["result"]["bodyBase64"].as_str().unwrap();
        assert_eq!(b64.len() % 4, 0);
        assert!(b64.len() <= MAX_BODY.div_ceil(3) * 4);
        assert_eq!(stored["truncated"], json!(true));
    }

    #[test]
    fn summarizes_failed_requests() {
        let dir = tempfile::tempdir().unwrap();
        append(dir.path(), json!({ "id": "x", "time": 2, "method": "POST", "url": "http://b", "error": "boom" }), 10).unwrap();
        let s = &read_index(dir.path()).unwrap()[0];
        assert_eq!((s.status, s.error.as_deref()), (None, Some("boom")));
    }

    #[test]
    fn rejects_path_like_ids() {
        let dir = tempfile::tempdir().unwrap();
        assert!(get(dir.path(), "../x").is_err());
        assert!(append(dir.path(), entry("../x", ""), 10).is_err());
    }
}
