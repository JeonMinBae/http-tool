use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::Connector;
use url::Url;

use crate::cookies::CookieJar;
use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    In,
    Out,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum WsEvent {
    Open { protocol: Option<String> },
    /// `data` is base64 when `binary` is true.
    Message { direction: Direction, binary: bool, data: String, at_ms: u64 },
    Close { code: Option<u16>, reason: String },
    Error { message: String },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsConnect {
    pub url: String,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub subprotocols: Vec<String>,
    #[serde(default = "default_true")]
    pub verify_ssl: bool,
}

fn default_true() -> bool {
    true
}

pub enum WsCommand {
    Send(Message),
    Close,
}

/// Open connections by id.
#[derive(Default)]
pub struct WsRegistry(Mutex<HashMap<String, mpsc::UnboundedSender<WsCommand>>>);

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

mod insecure {
    use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
    use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
    use rustls::{DigitallySignedStruct, SignatureScheme};

    /// Accepts any certificate (used only when "Verify SSL" is turned off).
    #[derive(Debug)]
    pub struct NoVerify;

    impl ServerCertVerifier for NoVerify {
        fn verify_server_cert(&self, _: &CertificateDer<'_>, _: &[CertificateDer<'_>], _: &ServerName<'_>, _: &[u8], _: UnixTime) -> Result<ServerCertVerified, rustls::Error> {
            Ok(ServerCertVerified::assertion())
        }
        fn verify_tls12_signature(&self, _: &[u8], _: &CertificateDer<'_>, _: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
            Ok(HandshakeSignatureValid::assertion())
        }
        fn verify_tls13_signature(&self, _: &[u8], _: &CertificateDer<'_>, _: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
            Ok(HandshakeSignatureValid::assertion())
        }
        fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
            rustls::crypto::ring::default_provider().signature_verification_algorithms.supported_schemes()
        }
    }
}

fn insecure_connector() -> Connector {
    let config = rustls::ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .expect("default TLS versions")
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(insecure::NoVerify))
        .with_no_client_auth();
    Connector::Rustls(Arc::new(config))
}

/// Opens the connection and spawns the pump task. Returns the command sender.
pub async fn connect(
    params: WsConnect,
    cookie_header: Option<String>,
    mut sink: impl FnMut(WsEvent) + Send + 'static,
) -> AppResult<mpsc::UnboundedSender<WsCommand>> {
    let mut request = params.url.as_str().into_client_request().map_err(|e| AppError::Invalid(format!("invalid WebSocket URL: {e}")))?;
    let headers = request.headers_mut();
    for (k, v) in &params.headers {
        let name = tokio_tungstenite::tungstenite::http::HeaderName::from_bytes(k.trim().as_bytes())
            .map_err(|_| AppError::Invalid(format!("invalid header name: {k}")))?;
        headers.append(name, HeaderValue::from_str(v).map_err(|_| AppError::Invalid(format!("invalid header value for {k}")))?);
    }
    if !params.subprotocols.is_empty() {
        headers.insert("sec-websocket-protocol", HeaderValue::from_str(&params.subprotocols.join(", ")).map_err(|e| AppError::Invalid(e.to_string()))?);
    }
    if let Some(c) = cookie_header {
        if !headers.contains_key("cookie") {
            headers.insert("cookie", HeaderValue::from_str(&c).map_err(|e| AppError::Invalid(e.to_string()))?);
        }
    }
    let connector = (!params.verify_ssl).then(insecure_connector);
    let (stream, response) = tokio_tungstenite::connect_async_tls_with_config(request, None, false, connector)
        .await
        .map_err(|e| AppError::Http(format!("WebSocket connection failed: {e}")))?;
    let protocol = response.headers().get("sec-websocket-protocol").and_then(|v| v.to_str().ok()).map(str::to_string);
    sink(WsEvent::Open { protocol });

    let (tx, mut rx) = mpsc::unbounded_channel::<WsCommand>();
    let (mut write, mut read) = stream.split();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                cmd = rx.recv() => match cmd {
                    Some(WsCommand::Send(msg)) => {
                        let event = match &msg {
                            Message::Text(t) => Some((false, t.to_string())),
                            Message::Binary(b) => Some((true, base64::engine::general_purpose::STANDARD.encode(b))),
                            _ => None,
                        };
                        if let Err(e) = write.send(msg).await {
                            sink(WsEvent::Error { message: e.to_string() });
                            break;
                        }
                        if let Some((binary, data)) = event {
                            sink(WsEvent::Message { direction: Direction::Out, binary, data, at_ms: now_ms() });
                        }
                    }
                    Some(WsCommand::Close) | None => {
                        let _ = write.send(Message::Close(Some(CloseFrame { code: 1000.into(), reason: "".into() }))).await;
                        // Wait briefly for the server's close frame.
                        let close = tokio::time::timeout(std::time::Duration::from_secs(2), async {
                            while let Some(Ok(m)) = read.next().await {
                                if let Message::Close(f) = m { return f; }
                            }
                            None
                        }).await.ok().flatten();
                        sink(WsEvent::Close { code: close.as_ref().map(|f| f.code.into()).or(Some(1000)), reason: close.map(|f| f.reason.to_string()).unwrap_or_default() });
                        break;
                    }
                },
                msg = read.next() => match msg {
                    Some(Ok(Message::Text(t))) => sink(WsEvent::Message { direction: Direction::In, binary: false, data: t.to_string(), at_ms: now_ms() }),
                    Some(Ok(Message::Binary(b))) => sink(WsEvent::Message { direction: Direction::In, binary: true, data: base64::engine::general_purpose::STANDARD.encode(&b), at_ms: now_ms() }),
                    Some(Ok(Message::Close(f))) => {
                        sink(WsEvent::Close { code: f.as_ref().map(|f| f.code.into()), reason: f.map(|f| f.reason.to_string()).unwrap_or_default() });
                        break;
                    }
                    Some(Ok(_)) => {} // ping/pong handled by tungstenite
                    Some(Err(e)) => {
                        sink(WsEvent::Error { message: e.to_string() });
                        break;
                    }
                    None => {
                        sink(WsEvent::Close { code: None, reason: "connection closed".into() });
                        break;
                    }
                },
            }
        }
    });
    Ok(tx)
}

#[tauri::command]
pub async fn ws_connect(
    registry: State<'_, WsRegistry>,
    jar: State<'_, CookieJar>,
    id: String,
    params: WsConnect,
    on_event: Channel<WsEvent>,
) -> AppResult<()> {
    // Cookies are matched on the equivalent http(s) URL.
    let cookie = Url::parse(&params.url.replacen("ws", "http", 1)).ok().and_then(|u| jar.header_for(&u));
    let tx = connect(params, cookie, move |e| {
        let _ = on_event.send(e);
    })
    .await?;
    if let Some(old) = registry.0.lock().unwrap().insert(id, tx) {
        let _ = old.send(WsCommand::Close);
    }
    Ok(())
}

#[tauri::command]
pub fn ws_send(registry: State<WsRegistry>, id: String, binary: bool, data: String) -> AppResult<()> {
    let msg = if binary {
        Message::Binary(base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| AppError::Invalid(format!("invalid base64: {e}")))?.into())
    } else {
        Message::Text(data.into())
    };
    let map = registry.0.lock().unwrap();
    let tx = map.get(&id).ok_or_else(|| AppError::Invalid("WebSocket is not connected".into()))?;
    tx.send(WsCommand::Send(msg)).map_err(|_| AppError::Invalid("WebSocket is closed".into()))
}

#[tauri::command]
pub fn ws_close(registry: State<WsRegistry>, id: String) -> AppResult<()> {
    if let Some(tx) = registry.0.lock().unwrap().remove(&id) {
        let _ = tx.send(WsCommand::Close);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::net::TcpListener;

    /// Echo server that also reports the requested subprotocol header.
    async fn echo_server() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            while let Ok((tcp, _)) = listener.accept().await {
                tokio::spawn(async move {
                    let mut ws = tokio_tungstenite::accept_async(tcp).await.unwrap();
                    while let Some(Ok(m)) = ws.next().await {
                        match m {
                            Message::Text(t) if t.as_str() == "bye" => {
                                let _ = ws.close(Some(CloseFrame { code: 4000.into(), reason: "server bye".into() })).await;
                            }
                            Message::Text(_) | Message::Binary(_) => ws.send(m).await.unwrap(),
                            _ => {}
                        }
                    }
                });
            }
        });
        format!("ws://{addr}")
    }

    async fn collect_until(rx: &mut mpsc::UnboundedReceiver<WsEvent>, n: usize) -> Vec<WsEvent> {
        let mut out = vec![];
        while out.len() < n {
            match tokio::time::timeout(Duration::from_secs(3), rx.recv()).await {
                Ok(Some(e)) => out.push(e),
                _ => break,
            }
        }
        out
    }

    fn params(url: String) -> WsConnect {
        WsConnect { url, headers: vec![("X-Test".into(), "1".into())], subprotocols: vec![], verify_ssl: true }
    }

    #[tokio::test]
    async fn echoes_text_and_binary() {
        let url = echo_server().await;
        let (etx, mut erx) = mpsc::unbounded_channel();
        let tx = connect(params(url), None, move |e| {
            let _ = etx.send(e);
        })
        .await
        .unwrap();
        tx.send(WsCommand::Send(Message::Text("hi".into()))).unwrap();
        tx.send(WsCommand::Send(Message::Binary(vec![1, 2, 3].into()))).unwrap();
        let events = collect_until(&mut erx, 5).await;
        assert_eq!(events[0], WsEvent::Open { protocol: None });
        let messages: Vec<_> = events
            .iter()
            .filter_map(|e| match e {
                WsEvent::Message { direction, binary, data, .. } => Some((direction.clone(), *binary, data.clone())),
                _ => None,
            })
            .collect();
        assert!(messages.contains(&(Direction::Out, false, "hi".into())));
        assert!(messages.contains(&(Direction::In, false, "hi".into())));
        assert!(messages.contains(&(Direction::In, true, "AQID".into())));
    }

    #[tokio::test]
    async fn reports_server_close() {
        let url = echo_server().await;
        let (etx, mut erx) = mpsc::unbounded_channel();
        let tx = connect(params(url), None, move |e| {
            let _ = etx.send(e);
        })
        .await
        .unwrap();
        tx.send(WsCommand::Send(Message::Text("bye".into()))).unwrap();
        let events = collect_until(&mut erx, 3).await;
        assert_eq!(events.last(), Some(&WsEvent::Close { code: Some(4000), reason: "server bye".into() }));
    }

    #[tokio::test]
    async fn client_close_emits_close_event() {
        let url = echo_server().await;
        let (etx, mut erx) = mpsc::unbounded_channel();
        let tx = connect(params(url), None, move |e| {
            let _ = etx.send(e);
        })
        .await
        .unwrap();
        tx.send(WsCommand::Close).unwrap();
        let events = collect_until(&mut erx, 2).await;
        assert!(matches!(events.last(), Some(WsEvent::Close { code: Some(1000), .. })));
    }

    #[tokio::test]
    async fn connection_failure_is_an_error() {
        let err = connect(params("ws://127.0.0.1:1".into()), None, |_| {}).await.unwrap_err();
        assert!(err.to_string().contains("WebSocket connection failed"));
    }
}
