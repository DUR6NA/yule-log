//! The fire: asks the model server (LM Studio by default) for one carol after
//! another and counts every token it streams back. The words are thrown away;
//! only the heat is kept.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

use crate::carols;
use crate::gpu::{self, GpuReading, SharedReading};
use crate::settings::Settings;

/// Once the timer runs out the carol in progress may finish, but not forever.
const OVERTIME_MS: u64 = 45_000;
const SONG_MAX_TOKENS: u32 = 700;
const PAUSE_BETWEEN_CAROLS: Duration = Duration::from_millis(1200);
/// LM Studio unloads a just-in-time-loaded model after this many idle seconds.
const MODEL_TTL_SECONDS: u32 = 600;
/// The longest custom timer: one week. Longer than that, pick "Never".
const MAX_MINUTES: f64 = 7.0 * 24.0 * 60.0;
const RATE_WINDOW: Duration = Duration::from_secs(3);

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Phase {
    Kindling,
    Writing,
    Resting,
}

struct Burn {
    id: u64,
    started: Instant,
    /// Unix ms when the fire goes out, or None to burn until it's put out.
    ends_at: Option<u64>,
    minutes: Option<f64>,
    tokens: u64,
    carols: u64,
    phase: Phase,
    /// The server is loading the model for this burn's first carol.
    loading_model: bool,
    stop: watch::Sender<bool>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LastBurn {
    reason: &'static str,
    tokens: u64,
    carols: u64,
    seconds: u64,
}

#[derive(Default)]
struct Inner {
    burn: Option<Burn>,
    burn_seq: u64,
    last_burn: Option<LastBurn>,
    error: Option<String>,
    total_tokens: u64,
    carols: u64,
    token_times: VecDeque<Instant>,
    recent_subjects: VecDeque<usize>,
    settings: Settings,
    /// The server turned down LM Studio's extra request fields, so leave them out.
    plain_requests: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicState {
    model: String,
    server: &'static str,
    running: bool,
    phase: &'static str,
    loading_model: bool,
    ends_at: Option<u64>,
    minutes: Option<f64>,
    burn_tokens: u64,
    burn_carols: u64,
    total_tokens: u64,
    carols: u64,
    last_burn: Option<LastBurn>,
    error: Option<String>,
    now: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Tick {
    rate: f64,
    gpu: Option<GpuReading>,
    burn_tokens: u64,
    total_tokens: u64,
    ends_at: Option<u64>,
    now: u64,
}

pub struct Engine {
    app: AppHandle,
    http: reqwest::Client,
    gpu: SharedReading,
    inner: Mutex<Inner>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

/// Resolves once the fire this receiver belongs to is put out.
async fn put_out(stop: &mut watch::Receiver<bool>) {
    // An error means the burn was dropped, which also means it's out.
    let _ = stop.wait_for(|&out| out).await;
}

impl Engine {
    pub fn new(app: AppHandle, settings: Settings) -> Arc<Self> {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .no_proxy()
            .build()
            .expect("HTTP client");
        let inner = Inner { settings, ..Inner::default() };
        Arc::new(Self { app, http, gpu: gpu::watch(), inner: Mutex::new(inner) })
    }

    pub fn settings(&self) -> Settings {
        self.lock().settings.clone()
    }

    /// New settings apply from the next request, even mid-burn.
    pub fn set_settings(&self, settings: Settings) {
        let mut inner = self.lock();
        inner.settings = settings;
        inner.plain_requests = false;
        // An error about the old server no longer applies.
        if inner.burn.is_none() {
            inner.error = None;
        }
        drop(inner);
        self.broadcast_state();
    }

    /// The models a server offers, for the settings panel.
    pub async fn list_models(&self, settings: &Settings) -> Result<Vec<String>, String> {
        let list = self.get_json(settings, &settings.api("/models")).await?;
        Ok(model_ids(&list))
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn public(&self, inner: &Inner) -> PublicState {
        let burn = inner.burn.as_ref();
        PublicState {
            model: inner.settings.model.clone(),
            server: inner.settings.server_name(),
            running: burn.is_some(),
            phase: match burn.map(|b| b.phase) {
                None => "out",
                Some(Phase::Kindling) => "kindling",
                Some(Phase::Writing) => "writing",
                Some(Phase::Resting) => "resting",
            },
            loading_model: burn.is_some_and(|b| b.loading_model),
            ends_at: burn.and_then(|b| b.ends_at),
            minutes: burn.and_then(|b| b.minutes),
            burn_tokens: burn.map_or(0, |b| b.tokens),
            burn_carols: burn.map_or(0, |b| b.carols),
            total_tokens: inner.total_tokens,
            carols: inner.carols,
            last_burn: inner.last_burn.clone(),
            error: inner.error.clone(),
            now: now_ms(),
        }
    }

    pub fn state(&self) -> PublicState {
        self.public(&self.lock())
    }

    fn emit_state(&self, state: &PublicState) {
        let _ = self.app.emit("state", state);
    }

    fn broadcast_state(&self) {
        let state = self.state();
        self.emit_state(&state);
    }

    /// Light the fire, or if it's already burning, restart its timer from now.
    /// `minutes: None` burns until it's put out.
    pub fn light(self: &Arc<Self>, minutes: Option<f64>) -> Result<PublicState, String> {
        let minutes = match minutes {
            None => None,
            Some(m) if m.is_finite() && m > 0.0 => Some(m.round().clamp(1.0, MAX_MINUTES)),
            Some(_) => return Err("The auto-off timer needs a time longer than zero.".into()),
        };
        let ends_at = minutes.map(|m| now_ms() + (m * 60_000.0) as u64);

        let mut inner = self.lock();
        if let Some(burn) = inner.burn.as_mut() {
            burn.minutes = minutes;
            burn.ends_at = ends_at;
            let state = self.public(&inner);
            drop(inner);
            self.emit_state(&state);
            return Ok(state);
        }

        let (stop, out) = watch::channel(false);
        inner.burn_seq += 1;
        let id = inner.burn_seq;
        inner.error = None;
        inner.burn = Some(Burn {
            id,
            started: Instant::now(),
            ends_at,
            minutes,
            tokens: 0,
            carols: 0,
            phase: Phase::Kindling,
            loading_model: false,
            stop,
        });
        let state = self.public(&inner);
        drop(inner);
        self.emit_state(&state);
        tauri::async_runtime::spawn(self.clone().keep_burning(id, out));
        Ok(state)
    }

    pub fn douse(&self, reason: &'static str) -> PublicState {
        self.douse_if(None, reason)
    }

    /// Put out the fire, but only if it's still burn `id` (None: whatever is burning).
    fn douse_if(&self, id: Option<u64>, reason: &'static str) -> PublicState {
        let mut inner = self.lock();
        let matches = inner.burn.as_ref().is_some_and(|b| id.is_none_or(|id| b.id == id));
        if matches {
            let burn = inner.burn.take().unwrap();
            let _ = burn.stop.send(true);
            inner.last_burn = Some(LastBurn {
                reason,
                tokens: burn.tokens,
                carols: burn.carols,
                seconds: burn.started.elapsed().as_secs(),
            });
        }
        let state = self.public(&inner);
        drop(inner);
        if matches {
            self.emit_state(&state);
        }
        state
    }

    fn is_burning(&self, id: u64) -> bool {
        self.lock().burn.as_ref().is_some_and(|b| b.id == id)
    }

    fn timer_done(&self, id: u64) -> bool {
        let inner = self.lock();
        match inner.burn.as_ref() {
            Some(b) if b.id == id => b.ends_at.is_some_and(|end| now_ms() >= end),
            _ => true,
        }
    }

    fn set_phase(&self, id: u64, phase: Phase) {
        let mut inner = self.lock();
        let changed = match inner.burn.as_mut() {
            Some(b) if b.id == id && b.phase != phase => {
                b.phase = phase;
                if phase == Phase::Writing {
                    b.loading_model = false;
                }
                true
            }
            _ => false,
        };
        let state = changed.then(|| self.public(&inner));
        drop(inner);
        if let Some(state) = state {
            self.emit_state(&state);
        }
    }

    fn add_tokens(&self, id: u64, n: u64) {
        let mut inner = self.lock();
        let Some(burn) = inner.burn.as_mut().filter(|b| b.id == id) else { return };
        burn.tokens += n;
        inner.total_tokens += n;
        let now = Instant::now();
        for _ in 0..n {
            inner.token_times.push_back(now);
        }
        drop(inner);
        let _ = self.app.emit("token", n);
    }

    fn carol_done(&self, id: u64) {
        let mut inner = self.lock();
        let Some(burn) = inner.burn.as_mut().filter(|b| b.id == id) else { return };
        burn.carols += 1;
        inner.carols += 1;
    }

    /// Once a second: enforce the timer and report the heat.
    pub fn start_ticker(self: &Arc<Self>) {
        let engine = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut every = tokio::time::interval(Duration::from_secs(1));
            loop {
                every.tick().await;
                engine.tick();
            }
        });
    }

    fn tick(&self) {
        let now = now_ms();
        let overdue = self
            .lock()
            .burn
            .as_ref()
            .and_then(|b| b.ends_at)
            .is_some_and(|end| now > end + OVERTIME_MS);
        if overdue {
            self.douse("timer");
        }

        let mut inner = self.lock();
        let cutoff = Instant::now() - RATE_WINDOW;
        while inner.token_times.front().is_some_and(|&t| t < cutoff) {
            inner.token_times.pop_front();
        }
        let tick = Tick {
            rate: inner.token_times.len() as f64 / RATE_WINDOW.as_secs_f64(),
            gpu: *self.gpu.lock().unwrap_or_else(|e| e.into_inner()),
            burn_tokens: inner.burn.as_ref().map_or(0, |b| b.tokens),
            total_tokens: inner.total_tokens,
            ends_at: inner.burn.as_ref().and_then(|b| b.ends_at),
            now,
        };
        drop(inner);
        let _ = self.app.emit("tick", tick);
    }

    async fn keep_burning(self: Arc<Self>, id: u64, mut out: watch::Receiver<bool>) {
        let result = async {
            let settings = self.settings();
            tokio::select! {
                checked = self.check_model(id, &settings) => checked?,
                _ = put_out(&mut out) => return Ok(()),
            }
            while self.is_burning(id) && !self.timer_done(id) {
                self.write_carol(id, &mut out).await?;
                if !self.is_burning(id) || self.timer_done(id) {
                    break;
                }
                self.set_phase(id, Phase::Resting);
                tokio::select! {
                    _ = tokio::time::sleep(PAUSE_BETWEEN_CAROLS) => {}
                    _ = put_out(&mut out) => break,
                }
            }
            Ok::<(), String>(())
        }
        .await;

        if let Err(message) = result {
            if self.is_burning(id) {
                eprintln!("error: {message}");
                self.lock().error = Some(message);
                self.douse_if(Some(id), "error");
                return;
            }
        }
        self.douse_if(Some(id), "timer");
    }

    fn authorized(&self, settings: &Settings, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if settings.api_key.is_empty() {
            request
        } else {
            request.bearer_auth(&settings.api_key)
        }
    }

    async fn get_json(&self, settings: &Settings, url: &str) -> Result<Value, String> {
        let request = self.authorized(settings, self.http.get(url).timeout(Duration::from_secs(8)));
        let res = request.send().await.map_err(|e| friendly(settings, &e))?;
        let status = res.status();
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(format!("{} turned down the API key ({status}). Check it in Settings.", settings.server_name()));
        }
        if !status.is_success() {
            return Err(format!("{} answered {status} at {url}.", settings.server_name()));
        }
        res.json().await.map_err(|e| friendly(settings, &e))
    }

    /// Make sure the server can serve the model, and note whether it has to load
    /// it first. With LM Studio's just-in-time loading on, the first carol loads it.
    async fn check_model(&self, id: u64, settings: &Settings) -> Result<(), String> {
        let model = settings.model.as_str();
        let name = settings.server_name();
        if model.is_empty() {
            return Err("Pick a model in Settings first.".into());
        }

        // LM Studio's OpenAI-style list has every downloaded model when JIT loading
        // is on, and only the loaded ones when it's off.
        let served = model_ids(&self.get_json(settings, &settings.api("/models")).await?);
        // LM Studio's own list has every downloaded model and whether it's loaded.
        let native = match settings.is_lm_studio() {
            true => self.get_json(settings, &format!("{}/api/v0/models", settings.base_url)).await.ok(),
            false => None,
        };
        let loaded = native.as_ref().and_then(|list| {
            list["data"].as_array()?.iter().find(|m| m["id"] == model).map(|m| m["state"] == "loaded")
        });

        // Some servers (llama.cpp) answer to any model name, so an empty list is no reason to stop.
        if served.is_empty() || served.iter().any(|m| m == model) {
            if loaded == Some(false) {
                let mut inner = self.lock();
                if let Some(burn) = inner.burn.as_mut().filter(|b| b.id == id) {
                    burn.loading_model = true;
                }
                drop(inner);
                self.broadcast_state();
            }
            return Ok(());
        }
        if loaded == Some(false) {
            return Err(format!(
                "{model} is downloaded but not loaded, and LM Studio's just-in-time model loading is off. \
                 Turn on \"Just-in-Time Model Loading\" in LM Studio's Developer settings, or load the model there."
            ));
        }
        let downloaded = native.as_ref().map_or(served, model_ids);
        let llms: Vec<String> = downloaded.into_iter().filter(|m| !m.contains("embed")).take(4).collect();
        Err(format!(
            "{name} doesn't have {model}. Pick another model in Settings{}.",
            if llms.is_empty() { String::new() } else { format!(", like {}", llms.join(", ")) }
        ))
    }

    fn carol_request(settings: &Settings, plain: bool, prompt: &str) -> Value {
        let mut body = json!({
            "model": settings.model,
            "stream": true,
            "temperature": 1.0,
            "top_p": 0.95,
            "max_tokens": SONG_MAX_TOKENS,
            "messages": [
                { "role": "system", "content": carols::SYSTEM_PROMPT },
                { "role": "user", "content": prompt },
            ],
        });
        if !plain {
            let fields = body.as_object_mut().unwrap();
            fields.insert("stream_options".into(), json!({ "include_usage": true }));
            fields.insert("top_k".into(), json!(64));
            // Gemma 4 otherwise "thinks" first, sometimes for the whole budget.
            fields.insert("reasoning_effort".into(), json!("none"));
            // LM Studio unloads a just-in-time-loaded model after this long idle.
            fields.insert("ttl".into(), json!(MODEL_TTL_SECONDS));
        }
        body
    }

    async fn write_carol(&self, id: u64, out: &mut watch::Receiver<bool>) -> Result<(), String> {
        let (settings, mut plain, prompt) = {
            let mut inner = self.lock();
            let prompt = carols::next_prompt(&mut inner.recent_subjects);
            (inner.settings.clone(), inner.plain_requests, prompt)
        };
        let name = settings.server_name();
        self.set_phase(id, Phase::Kindling);

        let res = loop {
            let body = Self::carol_request(&settings, plain, &prompt);
            let request = self.authorized(&settings, self.http.post(settings.api("/chat/completions")).json(&body));
            // Returning drops the response mid-stream, which closes the connection,
            // and the server stops generating.
            let res = tokio::select! {
                res = request.send() => res.map_err(|e| friendly(&settings, &e))?,
                _ = put_out(out) => return Ok(()),
            };
            let status = res.status();
            if status.is_success() {
                break res;
            }
            // A strict OpenAI-style server may refuse LM Studio's extra fields: try once without them.
            if !plain && matches!(status.as_u16(), 400 | 422) {
                plain = true;
                self.lock().plain_requests = true;
                continue;
            }
            let text = res.text().await.unwrap_or_default();
            return Err(format!("{name} answered {status}: {}", text.chars().take(300).collect::<String>()));
        };

        let mut stream = res.bytes_stream();
        let mut buffer = Vec::new();
        let mut counted = 0u64;
        'stream: loop {
            let next = tokio::select! {
                next = stream.next() => next,
                _ = put_out(out) => return Ok(()),
            };
            let Some(bytes) = next else { break };
            buffer.extend_from_slice(&bytes.map_err(|e| friendly(&settings, &e))?);

            while let Some(newline) = buffer.iter().position(|&b| b == b'\n') {
                let line: Vec<u8> = buffer.drain(..=newline).collect();
                let line = String::from_utf8_lossy(&line);
                let Some(data) = line.trim().strip_prefix("data:").map(str::trim) else { continue };
                if data == "[DONE]" {
                    break 'stream;
                }
                let Ok(chunk) = serde_json::from_str::<Value>(data) else { continue };
                if let Some(error) = chunk.get("error") {
                    let message = error["message"].as_str().map_or_else(|| error.to_string(), str::to_string);
                    return Err(format!("{name}: {message}"));
                }

                let delta = &chunk["choices"][0]["delta"];
                let wrote = ["content", "reasoning_content", "reasoning"]
                    .iter()
                    .any(|key| delta[key].as_str().is_some_and(|s| !s.is_empty()));
                if wrote {
                    counted += 1;
                    self.set_phase(id, Phase::Writing);
                    self.add_tokens(id, 1);
                }
                // The last chunk may carry exact usage; trust it over our count.
                if let Some(used) = chunk["usage"]["completion_tokens"].as_u64() {
                    if used > counted {
                        self.add_tokens(id, used - counted);
                        counted = used;
                    }
                }
            }
        }
        if counted > 0 {
            self.carol_done(id);
        }
        Ok(())
    }
}

fn model_ids(list: &Value) -> Vec<String> {
    list["data"]
        .as_array()
        .map(|models| models.iter().filter_map(|m| m["id"].as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

fn friendly(settings: &Settings, err: &reqwest::Error) -> String {
    let url = &settings.base_url;
    let name = settings.server_name();
    if err.is_connect() {
        if settings.is_lm_studio() {
            format!("LM Studio isn't answering at {url}. Open LM Studio and start its server in the Developer tab.")
        } else {
            format!("{name} isn't answering at {url}. Check that it's running, or change the server in Settings.")
        }
    } else if err.is_timeout() {
        format!("{name} at {url} took too long to answer. Check that it's running.")
    } else if err.is_body() || err.is_request() || err.is_decode() {
        format!("Lost the connection to {} at {url}.", name.replacen("The ", "the ", 1))
    } else {
        err.to_string()
    }
}
