use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::State;
use tokio::task::AbortHandle;

use crate::error::AppResult;

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum StreamEvent {
    /// A chunk of the response body (UTF-8, lossily decoded at chunk boundaries kept intact).
    Chunk { text: String },
    End,
    Error { message: String },
}

/// Running response streams, cancellable by id.
#[derive(Default, Clone)]
pub struct StreamRegistry(Arc<Mutex<HashMap<String, AbortHandle>>>);

/// Splits off any incomplete UTF-8 sequence at the end of `buf` so chunks are always valid text.
fn take_valid_utf8(buf: &mut Vec<u8>) -> String {
    let valid = match std::str::from_utf8(buf) {
        Ok(_) => buf.len(),
        Err(e) if e.error_len().is_none() => e.valid_up_to(),
        Err(_) => buf.len(), // invalid bytes: decode lossily
    };
    let rest = buf.split_off(valid);
    let text = String::from_utf8_lossy(buf).to_string();
    *buf = rest;
    text
}

pub async fn forward(resp: reqwest::Response, mut sink: impl FnMut(StreamEvent)) {
    let mut body = resp.bytes_stream();
    let mut pending: Vec<u8> = vec![];
    while let Some(chunk) = body.next().await {
        match chunk {
            Ok(bytes) => {
                pending.extend_from_slice(&bytes);
                let text = take_valid_utf8(&mut pending);
                if !text.is_empty() {
                    sink(StreamEvent::Chunk { text });
                }
            }
            Err(e) => {
                sink(StreamEvent::Error { message: e.to_string() });
                return;
            }
        }
    }
    if !pending.is_empty() {
        sink(StreamEvent::Chunk { text: String::from_utf8_lossy(&pending).to_string() });
    }
    sink(StreamEvent::End);
}

impl StreamRegistry {
    pub fn spawn(&self, id: String, resp: reqwest::Response, sink: impl FnMut(StreamEvent) + Send + 'static) {
        let registry = self.clone();
        let key = id.clone();
        let task = tokio::spawn(async move {
            forward(resp, sink).await;
            registry.0.lock().unwrap().remove(&key);
        });
        self.0.lock().unwrap().insert(id, task.abort_handle());
    }

    pub fn cancel(&self, id: &str) -> bool {
        match self.0.lock().unwrap().remove(id) {
            Some(h) => {
                h.abort();
                true
            }
            None => false,
        }
    }
}

#[tauri::command]
pub fn stream_cancel(streams: State<StreamRegistry>, stream_id: String) -> AppResult<bool> {
    Ok(streams.cancel(&stream_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cookies::CookieJar;
    use crate::http::client::send_with;
    use crate::http::types::*;
    use httpmock::prelude::*;

    fn req(url: String) -> PreparedRequest {
        PreparedRequest {
            method: "GET".into(),
            url,
            headers: vec![],
            body: PreparedBody::None,
            timeout_ms: 0,
            follow_redirects: true,
            verify_ssl: true,
            proxy: ProxyConfig { mode: "none".into(), url: String::new(), bypass: String::new() },
        }
    }

    #[tokio::test]
    async fn event_stream_is_returned_unread_and_forwarded() {
        let server = MockServer::start();
        server.mock(|w, t| {
            w.path("/sse");
            t.status(200).header("content-type", "text/event-stream").body("data: a\n\ndata: 한\n\n");
        });
        let (result, resp) = send_with(req(server.url("/sse")), &CookieJar::in_memory(), true).await.unwrap();
        assert!(result.streaming);
        let mut events = vec![];
        forward(resp.unwrap(), |e| events.push(e)).await;
        let text: String = events.iter().filter_map(|e| if let StreamEvent::Chunk { text } = e { Some(text.as_str()) } else { None }).collect();
        assert_eq!(text, "data: a\n\ndata: 한\n\n");
        assert_eq!(events.last(), Some(&StreamEvent::End));
    }

    #[tokio::test]
    async fn non_stream_responses_are_read_normally() {
        let server = MockServer::start();
        server.mock(|w, t| {
            w.path("/j");
            t.status(200).header("content-type", "application/json").body("{}");
        });
        let (result, resp) = send_with(req(server.url("/j")), &CookieJar::in_memory(), true).await.unwrap();
        assert!(!result.streaming && resp.is_none());
        assert_eq!(result.size, 2);
    }

    #[test]
    fn keeps_split_utf8_sequences_for_the_next_chunk() {
        let mut buf = "가".as_bytes()[..2].to_vec();
        assert_eq!(take_valid_utf8(&mut buf), "");
        buf.extend_from_slice(&"가".as_bytes()[2..]);
        assert_eq!(take_valid_utf8(&mut buf), "가");
        assert!(buf.is_empty());
    }
}
