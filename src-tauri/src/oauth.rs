use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;
use url::Url;

use crate::error::{AppError, AppResult};

const WAIT_TIMEOUT: Duration = Duration::from_secs(120);
const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>HTTP Tool</title>\
<body style=\"font-family:system-ui;padding:40px\"><h3>Authorization complete</h3>\
<p>You can close this window and return to HTTP Tool.</p></body>";

/// Loopback listeners waiting for an OAuth redirect, keyed by port.
#[derive(Default)]
pub struct OAuthListeners(Mutex<HashMap<u16, (TcpListener, String)>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenInfo {
    pub redirect_uri: String,
    pub port: u16,
}

/// Binds the loopback listener for `redirect_uri` (empty = random port, path /callback).
pub fn bind(redirect_uri: &str) -> AppResult<(TcpListener, String, String)> {
    if redirect_uri.trim().is_empty() {
        let l = TcpListener::bind("127.0.0.1:0")?;
        let port = l.local_addr()?.port();
        return Ok((l, "/callback".into(), format!("http://127.0.0.1:{port}/callback")));
    }
    let url = Url::parse(redirect_uri.trim()).map_err(|e| AppError::Invalid(format!("invalid redirect URI: {e}")))?;
    let host = url.host_str().unwrap_or_default();
    if url.scheme() != "http" || !(host == "127.0.0.1" || host == "localhost") {
        return Err(AppError::Invalid("redirect URI must be http://127.0.0.1:<port>/... or http://localhost:<port>/...".into()));
    }
    let port = url.port().unwrap_or(80);
    let l = TcpListener::bind(("127.0.0.1", port)).map_err(|e| AppError::Invalid(format!("cannot listen on port {port}: {e}")))?;
    Ok((l, url.path().to_string(), url.to_string()))
}

fn read_request_target(stream: &mut TcpStream) -> Option<String> {
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let mut buf = vec![0u8; 8192];
    let mut len = 0;
    while len < buf.len() {
        let n = stream.read(&mut buf[len..]).ok()?;
        if n == 0 {
            break;
        }
        len += n;
        if buf[..len].windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }
    let text = String::from_utf8_lossy(&buf[..len]);
    let line = text.lines().next()?;
    let mut parts = line.split_whitespace();
    (parts.next()? == "GET").then(|| parts.next().map(str::to_string))?
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

/// Accepts connections until one hits `path`; returns its query string.
pub fn wait_for_callback(listener: &TcpListener, path: &str, timeout: Duration) -> AppResult<String> {
    listener.set_nonblocking(true)?;
    let deadline = Instant::now() + timeout;
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let Some(target) = read_request_target(&mut stream) else { continue };
                let (p, q) = target.split_once('?').unwrap_or((target.as_str(), ""));
                if p == path {
                    respond(&mut stream, "200 OK", DONE_PAGE);
                    return Ok(q.to_string());
                }
                respond(&mut stream, "404 Not Found", "");
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err(AppError::Http("Timed out waiting for the OAuth redirect".into()));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => return Err(e.into()),
        }
    }
}

#[tauri::command]
pub fn oauth_listen(state: State<OAuthListeners>, redirect_uri: String) -> AppResult<ListenInfo> {
    let (listener, path, redirect_uri) = bind(&redirect_uri)?;
    let port = listener.local_addr()?.port();
    state.0.lock().unwrap().insert(port, (listener, path));
    Ok(ListenInfo { redirect_uri, port })
}

#[tauri::command]
pub async fn oauth_wait(state: State<'_, OAuthListeners>, port: u16) -> AppResult<String> {
    let (listener, path) = state.0.lock().unwrap().remove(&port).ok_or_else(|| AppError::Invalid("no OAuth listener".into()))?;
    tokio::task::spawn_blocking(move || wait_for_callback(&listener, &path, WAIT_TIMEOUT))
        .await
        .map_err(|e| AppError::Http(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get(port: u16, target: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(s, "GET {target} HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
        let mut out = String::new();
        let _ = s.read_to_string(&mut out);
        out
    }

    #[test]
    fn returns_query_of_matching_path_and_ignores_others() {
        let (listener, path, uri) = bind("").unwrap();
        let port = listener.local_addr().unwrap().port();
        assert_eq!(uri, format!("http://127.0.0.1:{port}/callback"));
        let client = std::thread::spawn(move || {
            let favicon = get(port, "/favicon.ico");
            let done = get(port, "/callback?code=abc&state=s");
            (favicon, done)
        });
        let q = wait_for_callback(&listener, &path, Duration::from_secs(5)).unwrap();
        let (favicon, done) = client.join().unwrap();
        assert_eq!(q, "code=abc&state=s");
        assert!(favicon.starts_with("HTTP/1.1 404"));
        assert!(done.contains("Authorization complete"));
    }

    #[test]
    fn rejects_non_loopback_redirects() {
        assert!(bind("https://example.com/cb").is_err());
        assert!(bind("http://evil.com:8080/cb").is_err());
    }

    #[test]
    fn times_out() {
        let (listener, path, _) = bind("").unwrap();
        assert!(wait_for_callback(&listener, &path, Duration::from_millis(100)).is_err());
    }
}
