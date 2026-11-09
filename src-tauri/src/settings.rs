//! Which model server to burn: LM Studio, or any local server with an
//! OpenAI-compatible API (Ollama, llama.cpp, Jan, vLLM...). Saved as JSON in the
//! app's config folder.
//!
//! Nothing is filled in out of the box: the person picks their own server and
//! model in Settings, so no address ever ships inside the app.

use std::path::Path;

use serde::{Deserialize, Serialize};

/// Only an example for error messages, never a default.
const EXAMPLE_URL: &str = "http://127.0.0.1:1234";

#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Where the server lives, without the `/v1` part.
    pub base_url: String,
    pub model: String,
    /// Sent as a bearer token when set.
    pub api_key: String,
}

impl Default for Settings {
    /// Blank until the person sets things up. For development, the `LMSTUDIO_URL`
    /// and `MODEL` environment variables (read at run time, on your own machine)
    /// can fill them in before any settings are saved.
    fn default() -> Self {
        Self {
            base_url: std::env::var("LMSTUDIO_URL").unwrap_or_default(),
            model: std::env::var("MODEL").unwrap_or_default(),
            api_key: String::new(),
        }
    }
}

impl Settings {
    /// Tidy what the user typed: add a scheme, drop a trailing `/v1`, trim the rest.
    /// A blank address stays blank (not set up yet).
    pub fn normalized(self) -> Result<Self, String> {
        let mut url = self.base_url.trim().trim_end_matches('/').to_string();
        let model = self.model.trim().to_string();
        let api_key = self.api_key.trim().to_string();
        if url.is_empty() {
            return Ok(Self { base_url: url, model, api_key });
        }
        if !url.contains("://") {
            url = format!("http://{url}");
        }
        if let Some(base) = url.strip_suffix("/v1") {
            url = base.to_string();
        }
        match reqwest::Url::parse(&url) {
            Ok(parsed) if matches!(parsed.scheme(), "http" | "https") && parsed.host().is_some() => {}
            _ => return Err(format!("\"{}\" isn't a server address. Try something like {EXAMPLE_URL}.", self.base_url.trim())),
        }
        Ok(Self { base_url: url, model, api_key })
    }

    /// Whether there's a server and a model to burn yet.
    pub fn is_set_up(&self) -> bool {
        !self.base_url.is_empty() && !self.model.is_empty()
    }

    /// An OpenAI-style endpoint, e.g. `api("/chat/completions")`.
    pub fn api(&self, path: &str) -> String {
        format!("{}/v1{path}", self.base_url)
    }

    /// What to call the server in messages, guessed from its usual port.
    pub fn server_name(&self) -> &'static str {
        match reqwest::Url::parse(&self.base_url).ok().and_then(|u| u.port()) {
            Some(1234) => "LM Studio",
            Some(11434) => "Ollama",
            _ => "The model server",
        }
    }

    pub fn is_lm_studio(&self) -> bool {
        self.server_name() == "LM Studio"
    }

    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str::<Self>(&text).ok())
            .and_then(|s| s.normalized().ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("Couldn't save settings: {e}"))?;
        }
        let text = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(path, text).map_err(|e| format!("Couldn't save settings: {e}"))
    }
}
