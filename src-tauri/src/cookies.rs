use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::Mutex;

use cookie_store::{CookieDomain, CookieExpiration, CookieStore};
use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};
use tauri::State;
use url::Url;

use crate::appdata::write_atomic;
use crate::error::{AppError, AppResult};

/// App-wide persistent cookie jar (one per app, shared by every collection).
pub struct CookieJar {
    store: Mutex<CookieStore>,
    path: Option<PathBuf>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CookieInfo {
    pub domain: String,
    pub host_only: bool,
    pub path: String,
    pub name: String,
    pub value: String,
    /// Unix epoch milliseconds; None for session cookies.
    pub expires: Option<i64>,
    pub http_only: bool,
    pub secure: bool,
}

impl CookieJar {
    #[cfg(test)]
    pub fn in_memory() -> Self {
        CookieJar { store: Mutex::new(CookieStore::default()), path: None }
    }

    pub fn load(path: PathBuf) -> Self {
        let store = File::open(&path)
            .ok()
            .and_then(|f| cookie_store::serde::json::load_all(BufReader::new(f)).ok())
            .unwrap_or_default();
        CookieJar { store: Mutex::new(store), path: Some(path) }
    }

    pub fn persist(&self) -> AppResult<()> {
        let Some(path) = &self.path else { return Ok(()) };
        let mut buf = vec![];
        cookie_store::serde::json::save_incl_expired_and_nonpersistent(&self.store.lock().unwrap(), &mut buf)
            .map_err(|e| AppError::Invalid(e.to_string()))?;
        write_atomic(path, &buf)
    }

    /// `Cookie` header value for `url`, or None when no cookie matches.
    pub fn header_for(&self, url: &Url) -> Option<String> {
        let store = self.store.lock().unwrap();
        let pairs: Vec<String> = store.get_request_values(url).map(|(n, v)| format!("{n}={v}")).collect();
        (!pairs.is_empty()).then(|| pairs.join("; "))
    }

    pub fn store_response(&self, url: &Url, headers: &HeaderMap) {
        let cookies = headers
            .get_all(reqwest::header::SET_COOKIE)
            .iter()
            .filter_map(|v| v.to_str().ok())
            .filter_map(|s| cookie_store::RawCookie::parse(s.to_string()).ok());
        self.store.lock().unwrap().store_response_cookies(cookies, url);
    }

    pub fn list(&self) -> Vec<CookieInfo> {
        let store = self.store.lock().unwrap();
        let mut out: Vec<CookieInfo> = store
            .iter_unexpired()
            .map(|c| CookieInfo {
                domain: String::from(&c.domain),
                host_only: matches!(c.domain, CookieDomain::HostOnly(_)),
                path: String::from(c.path.as_ref()),
                name: c.name().to_string(),
                value: c.value().to_string(),
                expires: match c.expires {
                    CookieExpiration::AtUtc(t) => Some(t.unix_timestamp() * 1000),
                    CookieExpiration::SessionEnd => None,
                },
                http_only: c.http_only().unwrap_or(false),
                secure: c.secure().unwrap_or(false),
            })
            .collect();
        out.sort_by(|a, b| (&a.domain, &a.path, &a.name).cmp(&(&b.domain, &b.path, &b.name)));
        out
    }

    pub fn upsert(&self, c: &CookieInfo) -> AppResult<()> {
        let domain = c.domain.trim_start_matches('.');
        let path = if c.path.starts_with('/') { c.path.clone() } else { "/".to_string() };
        let url = Url::parse(&format!("https://{domain}{path}")).map_err(|e| AppError::Invalid(e.to_string()))?;
        let mut s = format!("{}={}; Path={}", c.name, c.value, path);
        if !c.host_only {
            s.push_str(&format!("; Domain={domain}"));
        }
        if let Some(ms) = c.expires {
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64;
            s.push_str(&format!("; Max-Age={}", ((ms - now) / 1000).max(0)));
        }
        if c.http_only {
            s.push_str("; HttpOnly");
        }
        if c.secure {
            s.push_str("; Secure");
        }
        self.store
            .lock()
            .unwrap()
            .parse(&s, &url)
            .map_err(|e| AppError::Invalid(format!("invalid cookie: {e}")))?;
        Ok(())
    }

    pub fn delete(&self, domain: &str, path: &str, name: &str) {
        self.store.lock().unwrap().remove(domain, path, name);
    }

    pub fn clear(&self, domain: Option<&str>) {
        let mut store = self.store.lock().unwrap();
        match domain {
            None => store.clear(),
            Some(d) => {
                let doomed: Vec<(String, String, String)> = store
                    .iter_any()
                    .filter(|c| String::from(&c.domain) == d)
                    .map(|c| (d.to_string(), String::from(c.path.as_ref()), c.name().to_string()))
                    .collect();
                for (d, p, n) in doomed {
                    store.remove(&d, &p, &n);
                }
            }
        }
    }
}

#[tauri::command]
pub fn cookie_list(jar: State<CookieJar>) -> Vec<CookieInfo> {
    jar.list()
}

#[tauri::command]
pub fn cookie_upsert(jar: State<CookieJar>, cookie: CookieInfo) -> AppResult<()> {
    jar.upsert(&cookie)?;
    jar.persist()
}

#[tauri::command]
pub fn cookie_delete(jar: State<CookieJar>, domain: String, path: String, name: String) -> AppResult<()> {
    jar.delete(&domain, &path, &name);
    jar.persist()
}

#[tauri::command]
pub fn cookie_clear(jar: State<CookieJar>, domain: Option<String>) -> AppResult<()> {
    jar.clear(domain.as_deref());
    jar.persist()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn info(name: &str, domain: &str, host_only: bool) -> CookieInfo {
        CookieInfo {
            domain: domain.into(),
            host_only,
            path: "/".into(),
            name: name.into(),
            value: "v".into(),
            expires: None,
            http_only: false,
            secure: false,
        }
    }

    #[test]
    fn upsert_list_delete() {
        let jar = CookieJar::in_memory();
        jar.upsert(&info("a", "example.com", true)).unwrap();
        jar.upsert(&info("b", "example.com", false)).unwrap();
        let list = jar.list();
        assert_eq!(list.len(), 2);
        assert_eq!(jar.header_for(&Url::parse("https://example.com/x").unwrap()).unwrap().len(), "a=v; b=v".len());
        assert!(jar.header_for(&Url::parse("https://sub.example.com/").unwrap()).unwrap() == "b=v");
        jar.delete("example.com", "/", "a");
        assert_eq!(jar.list().len(), 1);
        jar.clear(Some("example.com"));
        assert!(jar.list().is_empty());
    }

    #[test]
    fn persists_session_cookies_across_reload() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cookies.json");
        let jar = CookieJar::load(path.clone());
        jar.upsert(&info("sid", "example.com", true)).unwrap();
        jar.persist().unwrap();
        let reloaded = CookieJar::load(path);
        assert_eq!(reloaded.list(), jar.list());
    }
}
