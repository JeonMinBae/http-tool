use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// Present for `.yaml` files only.
    pub content: Option<String>,
    pub children: Vec<FsEntry>,
}

/// Canonicalizes the nearest existing ancestor so that paths which do not exist yet
/// (new files, rename targets) can still be checked.
fn canonical_anchor(p: &Path) -> AppResult<PathBuf> {
    let mut cur = p;
    let mut rest: Vec<&std::ffi::OsStr> = vec![];
    loop {
        if cur.exists() {
            let mut base = dunce::canonicalize(cur)?;
            for part in rest.iter().rev() {
                base.push(part);
            }
            return Ok(base);
        }
        match (cur.parent(), cur.file_name()) {
            (Some(parent), Some(name)) => {
                rest.push(name);
                cur = parent;
            }
            _ => return Err(AppError::Invalid(format!("invalid path: {}", p.display()))),
        }
    }
}

pub fn ensure_inside(roots: &[PathBuf], p: &Path) -> AppResult<PathBuf> {
    let canon = canonical_anchor(p)?;
    if canon.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err(AppError::Invalid(format!("invalid path: {}", p.display())));
    }
    if roots.iter().any(|r| canon.starts_with(r)) {
        Ok(canon)
    } else {
        Err(AppError::Invalid(format!("outside collection: {}", p.display())))
    }
}

fn ensure_strictly_inside(roots: &[PathBuf], p: &Path) -> AppResult<PathBuf> {
    let canon = ensure_inside(roots, p)?;
    if roots.iter().any(|r| r == &canon) {
        return Err(AppError::Invalid("cannot modify collection root".into()));
    }
    Ok(canon)
}

pub fn read_tree_at(dir: &Path) -> AppResult<FsEntry> {
    let mut children = vec![];
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            children.push(read_tree_at(&path)?);
        } else if name.ends_with(".yaml") {
            children.push(FsEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                content: Some(fs::read_to_string(&path)?),
                children: vec![],
            });
        }
    }
    children.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(FsEntry {
        name: dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        path: dir.to_string_lossy().to_string(),
        is_dir: true,
        content: None,
        children,
    })
}

fn copy_recursive(from: &Path, to: &Path) -> AppResult<()> {
    if from.is_dir() {
        fs::create_dir_all(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &to.join(entry.file_name()))?;
        }
    } else {
        fs::copy(from, to)?;
    }
    Ok(())
}

fn no_overwrite(p: &Path) -> AppResult<()> {
    if p.exists() {
        return Err(AppError::Invalid(format!("already exists: {}", p.display())));
    }
    Ok(())
}

fn roots(state: &State<AppState>) -> Vec<PathBuf> {
    state.collection_roots.lock().unwrap().clone()
}

/// Registers a collection root so that later file operations inside it are allowed.
#[tauri::command]
pub fn collection_register(state: State<AppState>, root: String) -> AppResult<String> {
    let canon = dunce::canonicalize(&root)?;
    if !canon.is_dir() {
        return Err(AppError::Invalid(format!("not a directory: {root}")));
    }
    let mut roots = state.collection_roots.lock().unwrap();
    if !roots.contains(&canon) {
        roots.push(canon.clone());
    }
    Ok(canon.to_string_lossy().to_string())
}

#[tauri::command]
pub fn collection_unregister(state: State<AppState>, root: String) -> AppResult<()> {
    let canon = dunce::canonicalize(&root).unwrap_or_else(|_| PathBuf::from(&root));
    state.collection_roots.lock().unwrap().retain(|r| r != &canon);
    Ok(())
}

#[tauri::command]
pub fn fs_read_tree(state: State<AppState>, root: String) -> AppResult<FsEntry> {
    let p = ensure_inside(&roots(&state), Path::new(&root))?;
    read_tree_at(&p)
}

#[tauri::command]
pub fn fs_read_file(state: State<AppState>, path: String) -> AppResult<String> {
    let p = ensure_strictly_inside(&roots(&state), Path::new(&path))?;
    Ok(fs::read_to_string(p)?)
}

#[tauri::command]
pub fn fs_write_file(state: State<AppState>, path: String, content: String) -> AppResult<()> {
    let p = ensure_strictly_inside(&roots(&state), Path::new(&path))?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(p, content)?;
    Ok(())
}

#[tauri::command]
pub fn fs_create_dir(state: State<AppState>, path: String) -> AppResult<()> {
    let p = ensure_strictly_inside(&roots(&state), Path::new(&path))?;
    no_overwrite(&p)?;
    fs::create_dir_all(p)?;
    Ok(())
}

#[tauri::command]
pub fn fs_rename(state: State<AppState>, from: String, to: String) -> AppResult<()> {
    let r = roots(&state);
    let from = ensure_strictly_inside(&r, Path::new(&from))?;
    let to = ensure_strictly_inside(&r, Path::new(&to))?;
    // Case-only renames on case-insensitive file systems resolve to the same entry.
    if from.to_string_lossy().to_lowercase() != to.to_string_lossy().to_lowercase() {
        no_overwrite(&to)?;
    }
    if to.starts_with(&from) && to != from {
        return Err(AppError::Invalid("cannot move a folder into itself".into()));
    }
    fs::rename(from, to)?;
    Ok(())
}

#[tauri::command]
pub fn fs_copy(state: State<AppState>, from: String, to: String) -> AppResult<()> {
    let r = roots(&state);
    let from = ensure_strictly_inside(&r, Path::new(&from))?;
    let to = ensure_strictly_inside(&r, Path::new(&to))?;
    no_overwrite(&to)?;
    copy_recursive(&from, &to)
}

#[tauri::command]
pub fn fs_delete(state: State<AppState>, path: String) -> AppResult<()> {
    let p = ensure_strictly_inside(&roots(&state), Path::new(&path))?;
    if p.is_dir() {
        fs::remove_dir_all(p)?;
    } else {
        fs::remove_file(p)?;
    }
    Ok(())
}

/// A folder inside an open collection (the root included) that may be shown in the OS file manager.
fn dir_to_open(roots: &[PathBuf], p: &Path) -> AppResult<PathBuf> {
    let canon = ensure_inside(roots, p)?;
    if !canon.is_dir() {
        return Err(AppError::Invalid(format!("not a folder: {}", p.display())));
    }
    Ok(canon)
}

#[tauri::command]
pub fn fs_open_dir(state: State<AppState>, path: String) -> AppResult<()> {
    let dir = dir_to_open(&roots(&state), Path::new(&path))?;
    tauri_plugin_opener::open_path(dir, None::<&str>).map_err(|e| AppError::Invalid(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, Vec<PathBuf>) {
        let dir = tempfile::tempdir().unwrap();
        let root = dunce::canonicalize(dir.path()).unwrap().join("col");
        fs::create_dir_all(root.join("users")).unwrap();
        fs::write(root.join("collection.yaml"), "kind: collection").unwrap();
        fs::write(root.join("users/get.yaml"), "kind: http").unwrap();
        fs::write(root.join("users/notes.txt"), "x").unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        (dir, vec![root])
    }

    #[test]
    fn dir_to_open_allows_folders_inside_roots_only() {
        let (_d, roots) = setup();
        assert!(dir_to_open(&roots, &roots[0]).is_ok());
        assert!(dir_to_open(&roots, &roots[0].join("users")).is_ok());
        assert!(dir_to_open(&roots, &roots[0].join("collection.yaml")).is_err());
        let outside = tempfile::tempdir().unwrap();
        assert!(dir_to_open(&roots, outside.path()).is_err());
    }

    #[test]
    fn allows_new_paths_inside_root() {
        let (_d, roots) = setup();
        assert!(ensure_inside(&roots, &roots[0].join("new/deep/file.yaml")).is_ok());
    }

    #[test]
    fn rejects_paths_outside_root() {
        let (_d, roots) = setup();
        let outside = roots[0].parent().unwrap().join("other.yaml");
        assert!(ensure_inside(&roots, &outside).is_err());
        assert!(ensure_inside(&roots, &roots[0].join("../escape.yaml")).is_err());
    }

    #[test]
    fn rejects_modifying_root_itself() {
        let (_d, roots) = setup();
        assert!(ensure_strictly_inside(&roots, &roots[0]).is_err());
    }

    #[test]
    fn tree_includes_only_yaml_and_dirs_and_skips_hidden() {
        let (_d, roots) = setup();
        let tree = read_tree_at(&roots[0]).unwrap();
        let names: Vec<_> = tree.children.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, vec!["collection.yaml", "users"]);
        let users = &tree.children[1];
        assert_eq!(users.children.len(), 1);
        assert_eq!(users.children[0].content.as_deref(), Some("kind: http"));
    }

    #[test]
    fn copies_directories_recursively() {
        let (_d, roots) = setup();
        copy_recursive(&roots[0].join("users"), &roots[0].join("users-copy")).unwrap();
        assert!(roots[0].join("users-copy/get.yaml").exists());
    }
}
