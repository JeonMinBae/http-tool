use std::time::{Duration, Instant};

use base64::Engine;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE, COOKIE, LOCATION};
use reqwest::{Client, Method, Proxy, RequestBuilder};
use tauri::State;
use url::Url;

use super::types::*;
use crate::cookies::CookieJar;
use crate::error::{AppError, AppResult};

const MAX_REDIRECTS: usize = 10;
const PREVIEW_LIMIT: usize = 1024 * 1024;
const DEFAULT_USER_AGENT: &str = concat!("HttpTool/", env!("CARGO_PKG_VERSION"));

pub fn build_client(req: &PreparedRequest) -> AppResult<Client> {
    let mut b = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .danger_accept_invalid_certs(!req.verify_ssl);
    if req.timeout_ms > 0 {
        b = b.timeout(Duration::from_millis(req.timeout_ms));
    }
    b = match req.proxy.mode.as_str() {
        "none" => b.no_proxy(),
        "manual" if !req.proxy.url.trim().is_empty() => {
            let proxy = Proxy::all(req.proxy.url.trim())
                .map_err(|e| AppError::Invalid(format!("invalid proxy url: {e}")))?
                .no_proxy(reqwest::NoProxy::from_string(&req.proxy.bypass));
            b.proxy(proxy)
        }
        _ => b, // system: reqwest reads env vars and OS proxy settings
    };
    b.build().map_err(|e| AppError::Http(e.to_string()))
}

fn has_header(headers: &[(String, String)], name: &str) -> bool {
    headers.iter().any(|(k, _)| k.eq_ignore_ascii_case(name))
}

fn to_header_map(headers: &[(String, String)]) -> AppResult<HeaderMap> {
    let mut map = HeaderMap::new();
    for (k, v) in headers {
        let name = HeaderName::from_bytes(k.trim().as_bytes())
            .map_err(|_| AppError::Invalid(format!("invalid header name: {k}")))?;
        let value = HeaderValue::from_str(v).map_err(|_| AppError::Invalid(format!("invalid header value for {k}")))?;
        map.append(name, value);
    }
    Ok(map)
}

async fn apply_body(b: RequestBuilder, body: &PreparedBody) -> AppResult<(RequestBuilder, Option<String>)> {
    Ok(match body {
        PreparedBody::None => (b, None),
        PreparedBody::Text { content } => (b.body(content.clone()), Some(truncate(content))),
        PreparedBody::UrlEncoded { fields } => {
            let encoded = url::form_urlencoded::Serializer::new(String::new()).extend_pairs(fields).finish();
            (b.form(fields), Some(encoded))
        }
        PreparedBody::FormData { fields } => {
            let mut form = reqwest::multipart::Form::new();
            let mut preview = vec![];
            for f in fields {
                if f.kind == "file" {
                    let bytes = tokio::fs::read(&f.value)
                        .await
                        .map_err(|e| AppError::Invalid(format!("cannot read file {}: {e}", f.value)))?;
                    let file_name = std::path::Path::new(&f.value)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    form = form.part(f.name.clone(), reqwest::multipart::Part::bytes(bytes).file_name(file_name));
                    preview.push(format!("{}: <file: {}>", f.name, f.value));
                } else {
                    form = form.text(f.name.clone(), f.value.clone());
                    preview.push(format!("{}: {}", f.name, f.value));
                }
            }
            (b.multipart(form), Some(preview.join("\n")))
        }
        PreparedBody::Binary { path } => {
            let bytes = tokio::fs::read(path)
                .await
                .map_err(|e| AppError::Invalid(format!("cannot read file {path}: {e}")))?;
            (b.body(bytes), Some(format!("<file: {path}>")))
        }
    })
}

fn truncate(s: &str) -> String {
    if s.len() <= PREVIEW_LIMIT {
        return s.to_string();
    }
    let mut end = PREVIEW_LIMIT;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}… (truncated)", &s[..end])
}

fn location(base: &Url, headers: &HeaderMap) -> Option<Url> {
    headers.get(LOCATION)?.to_str().ok().and_then(|l| base.join(l).ok())
}

fn is_text_content(content_type: Option<&str>, body: &[u8]) -> bool {
    match content_type {
        Some(ct) => {
            let ct = ct.to_ascii_lowercase();
            ct.starts_with("text/")
                || ["json", "xml", "javascript", "x-www-form-urlencoded", "graphql", "yaml", "event-stream"]
                    .iter()
                    .any(|t| ct.contains(t))
        }
        None => std::str::from_utf8(body).is_ok(),
    }
}

fn header_pairs(headers: &HeaderMap) -> Vec<(String, String)> {
    headers
        .iter()
        .map(|(k, v)| (k.to_string(), String::from_utf8_lossy(v.as_bytes()).to_string()))
        .collect()
}

/// Captures what goes on the wire, including headers reqwest/hyper add implicitly.
fn capture(req: &reqwest::Request, body_preview: Option<String>) -> SentRequest {
    let mut headers = header_pairs(req.headers());
    let has = |h: &[(String, String)], n: &str| h.iter().any(|(k, _)| k.eq_ignore_ascii_case(n));
    if !has(&headers, "accept-encoding") {
        headers.push(("accept-encoding".into(), "gzip, deflate, br".into()));
    }
    if let Some(len) = req.body().and_then(|b| b.as_bytes()).map(|b| b.len()) {
        if !has(&headers, "content-length") {
            headers.push(("content-length".into(), len.to_string()));
        }
    }
    SentRequest { method: req.method().to_string(), url: req.url().to_string(), headers, body_preview }
}

fn map_reqwest_err(e: reqwest::Error, timeout_ms: u64) -> AppError {
    if e.is_timeout() {
        return AppError::Http(format!("Request timed out after {timeout_ms} ms"));
    }
    let mut msg = e.to_string();
    let mut src = std::error::Error::source(&e);
    while let Some(s) = src {
        msg.push_str(&format!(": {s}"));
        src = s.source();
    }
    if e.is_connect() {
        return AppError::Http(format!("Could not connect: {msg}"));
    }
    AppError::Http(msg)
}

pub async fn send(req: PreparedRequest, jar: &CookieJar) -> AppResult<HttpResult> {
    let client = build_client(&req)?;
    let started = Instant::now();
    let mut method: Method = req
        .method
        .to_uppercase()
        .parse()
        .map_err(|_| AppError::Invalid(format!("invalid method: {}", req.method)))?;
    let mut url = Url::parse(&req.url).map_err(|e| AppError::Invalid(format!("invalid url: {e}")))?;
    let mut body = req.body.clone();
    let mut user_headers = req.headers.clone();
    if !has_header(&user_headers, "user-agent") {
        user_headers.push(("user-agent".into(), DEFAULT_USER_AGENT.into()));
    }
    if !has_header(&user_headers, "accept") {
        user_headers.push(("accept".into(), "*/*".into()));
    }
    let mut redirects = vec![];

    loop {
        let mut headers = to_header_map(&user_headers)?;
        if !headers.contains_key(COOKIE) {
            if let Some(c) = jar.header_for(&url) {
                headers.insert(COOKIE, HeaderValue::from_str(&c).map_err(|e| AppError::Invalid(e.to_string()))?);
            }
        }
        let (builder, preview) = apply_body(client.request(method.clone(), url.clone()).headers(headers), &body).await?;
        let built = builder.build().map_err(|e| AppError::Http(e.to_string()))?;
        let sent = capture(&built, preview);
        let resp = client.execute(built).await.map_err(|e| map_reqwest_err(e, req.timeout_ms))?;
        jar.store_response(&url, resp.headers());

        let status = resp.status();
        if req.follow_redirects && status.is_redirection() && redirects.len() < MAX_REDIRECTS {
            if let Some(next) = location(&url, resp.headers()) {
                redirects.push(RedirectHop { url: url.to_string(), status: status.as_u16(), method: method.to_string() });
                if matches!(status.as_u16(), 301 | 302 | 303) && method != Method::HEAD {
                    method = Method::GET;
                    body = PreparedBody::None;
                    user_headers.retain(|(k, _)| !k.eq_ignore_ascii_case("content-type"));
                }
                // Credentials must not leak to another origin.
                if next.origin() != url.origin() {
                    user_headers.retain(|(k, _)| !k.eq_ignore_ascii_case("authorization"));
                }
                url = next;
                continue;
            }
        }

        jar.persist()?;
        let http_version = format!("{:?}", resp.version());
        let headers = header_pairs(resp.headers());
        let content_type = resp.headers().get(CONTENT_TYPE).and_then(|v| v.to_str().ok()).map(str::to_string);
        let bytes = resp.bytes().await.map_err(|e| map_reqwest_err(e, req.timeout_ms))?;
        return Ok(HttpResult {
            status: status.as_u16(),
            status_text: status.canonical_reason().unwrap_or("").to_string(),
            http_version,
            headers,
            is_text: is_text_content(content_type.as_deref(), &bytes),
            size: bytes.len() as u64,
            body_base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
            elapsed_ms: started.elapsed().as_millis() as u64,
            sent,
            redirects,
        });
    }
}

#[tauri::command]
pub async fn http_send(jar: State<'_, CookieJar>, request: PreparedRequest) -> AppResult<HttpResult> {
    send(request, &jar).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::prelude::*;

    fn test_req(url: &str) -> PreparedRequest {
        PreparedRequest {
            method: "GET".into(),
            url: url.into(),
            headers: vec![],
            body: PreparedBody::None,
            timeout_ms: 5000,
            follow_redirects: true,
            verify_ssl: true,
            proxy: ProxyConfig { mode: "none".into(), url: String::new(), bypass: String::new() },
        }
    }

    fn header<'a>(r: &'a SentRequest, name: &str) -> Option<&'a str> {
        r.headers.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
    }

    #[tokio::test]
    async fn records_redirect_chain_and_sends_cookie_from_first_hop() {
        let server = MockServer::start();
        server.mock(|w, t| {
            w.path("/a");
            t.status(302).header("Location", "/b").header("Set-Cookie", "sid=1; Path=/");
        });
        let b = server.mock(|w, t| {
            w.path("/b").header("cookie", "sid=1");
            t.status(200).header("content-type", "text/plain").body("ok");
        });
        let jar = CookieJar::in_memory();
        let r = send(test_req(&server.url("/a")), &jar).await.unwrap();
        b.assert();
        assert_eq!(r.status, 200);
        assert_eq!(r.redirects.len(), 1);
        assert_eq!(r.redirects[0].status, 302);
        assert_eq!(header(&r.sent, "cookie"), Some("sid=1"));
        assert!(r.is_text);
        assert_eq!(r.size, 2);
    }

    #[tokio::test]
    async fn returns_3xx_when_follow_is_off() {
        let server = MockServer::start();
        server.mock(|w, t| {
            w.path("/a");
            t.status(301).header("Location", "/b");
        });
        let mut req = test_req(&server.url("/a"));
        req.follow_redirects = false;
        let r = send(req, &CookieJar::in_memory()).await.unwrap();
        assert_eq!(r.status, 301);
        assert!(r.redirects.is_empty());
    }

    #[tokio::test]
    async fn see_other_switches_post_to_get() {
        let server = MockServer::start();
        server.mock(|w, t| {
            w.method(POST).path("/a");
            t.status(303).header("Location", "/b");
        });
        let b = server.mock(|w, t| {
            w.method(GET).path("/b");
            t.status(200);
        });
        let mut req = test_req(&server.url("/a"));
        req.method = "POST".into();
        req.body = PreparedBody::Text { content: "x".into() };
        let r = send(req, &CookieJar::in_memory()).await.unwrap();
        b.assert();
        assert_eq!(r.sent.method, "GET");
    }

    #[tokio::test]
    async fn user_cookie_header_replaces_jar_cookies() {
        let server = MockServer::start();
        let m = server.mock(|w, t| {
            w.path("/").header("cookie", "mine=1");
            t.status(200);
        });
        let jar = CookieJar::in_memory();
        jar.store_response(
            &Url::parse(&server.url("/")).unwrap(),
            &HeaderMap::from_iter([(reqwest::header::SET_COOKIE, HeaderValue::from_static("jar=1"))]),
        );
        let mut req = test_req(&server.url("/"));
        req.headers = vec![("Cookie".into(), "mine=1".into())];
        send(req, &jar).await.unwrap();
        m.assert();
    }

    #[tokio::test]
    async fn sends_multipart_with_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.txt");
        std::fs::write(&file, "FILEDATA").unwrap();
        let server = MockServer::start();
        let m = server.mock(|w, t| {
            w.method(POST).path("/up").body_contains("FILEDATA").body_contains("hello");
            t.status(201);
        });
        let mut req = test_req(&server.url("/up"));
        req.method = "POST".into();
        req.body = PreparedBody::FormData {
            fields: vec![
                FormPart { name: "t".into(), kind: "text".into(), value: "hello".into() },
                FormPart { name: "f".into(), kind: "file".into(), value: file.to_string_lossy().into() },
            ],
        };
        let r = send(req, &CookieJar::in_memory()).await.unwrap();
        m.assert();
        assert!(header(&r.sent, "content-type").unwrap().starts_with("multipart/form-data"));
    }

    #[tokio::test]
    async fn urlencoded_body_and_raw_headers_are_recorded() {
        let server = MockServer::start();
        let m = server.mock(|w, t| {
            w.method(POST).path("/f").body("a=1&b=x+y");
            t.status(200);
        });
        let mut req = test_req(&server.url("/f"));
        req.method = "POST".into();
        req.body = PreparedBody::UrlEncoded { fields: vec![("a".into(), "1".into()), ("b".into(), "x y".into())] };
        let r = send(req, &CookieJar::in_memory()).await.unwrap();
        m.assert();
        assert_eq!(r.sent.body_preview.as_deref(), Some("a=1&b=x+y"));
        assert_eq!(header(&r.sent, "content-type"), Some("application/x-www-form-urlencoded"));
        assert!(header(&r.sent, "user-agent").unwrap().starts_with("HttpTool/"));
    }

    #[tokio::test]
    async fn times_out() {
        let server = MockServer::start();
        server.mock(|w, t| {
            w.path("/slow");
            t.status(200).delay(Duration::from_millis(500));
        });
        let mut req = test_req(&server.url("/slow"));
        req.timeout_ms = 100;
        let err = send(req, &CookieJar::in_memory()).await.unwrap_err();
        assert!(err.to_string().contains("timed out"), "{err}");
    }

    #[tokio::test]
    async fn drops_authorization_on_cross_origin_redirect() {
        let other = MockServer::start();
        let target = other.mock(|w, t| {
            w.path("/x").matches(|r| {
                !r.headers.as_ref().is_some_and(|h| h.iter().any(|(k, _)| k.eq_ignore_ascii_case("authorization")))
            });
            t.status(200);
        });
        let server = MockServer::start();
        let to = other.url("/x");
        server.mock(move |w, t| {
            w.path("/a");
            t.status(302).header("Location", to.as_str());
        });
        let mut req = test_req(&server.url("/a"));
        req.headers = vec![("Authorization".into(), "Bearer t".into())];
        send(req, &CookieJar::in_memory()).await.unwrap();
        target.assert();
    }
}
