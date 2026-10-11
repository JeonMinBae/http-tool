use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    pub collection_roots: Mutex<Vec<PathBuf>>,
}
