use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    /// "system" | "none" | "manual"
    pub mode: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub bypass: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct FormPart {
    pub name: String,
    /// "text" | "file"
    pub kind: String,
    pub value: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum PreparedBody {
    None,
    /// raw and graphql (already converted to JSON) bodies
    Text { content: String },
    UrlEncoded { fields: Vec<(String, String)> },
    FormData { fields: Vec<FormPart> },
    Binary { path: String },
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PreparedRequest {
    pub method: String,
    pub url: String,
    /// Order and duplicates are preserved.
    pub headers: Vec<(String, String)>,
    pub body: PreparedBody,
    pub timeout_ms: u64,
    pub follow_redirects: bool,
    pub verify_ssl: bool,
    pub proxy: ProxyConfig,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SentRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body_preview: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RedirectHop {
    pub url: String,
    pub status: u16,
    pub method: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HttpResult {
    pub status: u16,
    pub status_text: String,
    pub http_version: String,
    pub headers: Vec<(String, String)>,
    pub body_base64: String,
    pub is_text: bool,
    pub size: u64,
    pub elapsed_ms: u64,
    /// The request actually sent for the final hop.
    pub sent: SentRequest,
    pub redirects: Vec<RedirectHop>,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mirrors the JSON produced by `prepareRequest` in src/core/prepare.ts.
    #[test]
    fn deserializes_frontend_prepared_request() {
        let json = r#"{
            "method": "POST", "url": "http://a/x",
            "headers": [["Content-Type", "application/json"], ["X", "1"]],
            "body": {"type": "form-data", "fields": [{"name": "f", "kind": "file", "value": "/tmp/a"}]},
            "timeoutMs": 1000, "followRedirects": true, "verifySsl": false,
            "proxy": {"mode": "manual", "url": "socks5://h:1", "bypass": "localhost"}
        }"#;
        let r: PreparedRequest = serde_json::from_str(json).unwrap();
        assert_eq!(r.headers[1], ("X".to_string(), "1".to_string()));
        assert!(matches!(r.body, PreparedBody::FormData { .. }));
        for body in [r#"{"type":"none"}"#, r#"{"type":"text","content":"x"}"#, r#"{"type":"url-encoded","fields":[["a","b"]]}"#, r#"{"type":"binary","path":"/p"}"#] {
            serde_json::from_str::<PreparedBody>(body).unwrap();
        }
    }
}
