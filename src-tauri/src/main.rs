// No console window behind the fire in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod carols;
mod engine;
mod gpu;
mod settings;

use std::path::PathBuf;
use std::sync::Arc;

use engine::{Engine, PublicState};
use settings::Settings;
use tauri::{AppHandle, Manager, RunEvent, State, WebviewWindow};

type Fire<'a> = State<'a, Arc<Engine>>;

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
fn get_state(fire: Fire) -> PublicState {
    fire.state()
}

/// `minutes: null` burns until it's put out.
#[tauri::command]
fn light(fire: Fire, minutes: Option<f64>) -> Result<PublicState, String> {
    fire.light(minutes)
}

#[tauri::command]
fn douse(fire: Fire) -> PublicState {
    fire.douse("doused")
}

#[tauri::command]
fn get_settings(fire: Fire) -> Settings {
    fire.settings()
}

#[tauri::command]
fn save_settings(app: AppHandle, fire: Fire, settings: Settings) -> Result<Settings, String> {
    let settings = settings.normalized()?;
    settings.save(&settings_path(&app)?)?;
    fire.set_settings(settings.clone());
    Ok(settings)
}

/// What models a server offers, before its settings are saved.
#[tauri::command]
async fn list_models(fire: Fire<'_>, settings: Settings) -> Result<Vec<String>, String> {
    let settings = settings.normalized()?;
    fire.list_models(&settings).await
}

#[tauri::command]
fn set_fullscreen(window: WebviewWindow, fullscreen: Option<bool>) -> Result<bool, String> {
    let fullscreen = match fullscreen {
        Some(value) => value,
        None => !window.is_fullscreen().map_err(|e| e.to_string())?,
    };
    window.set_fullscreen(fullscreen).map_err(|e| e.to_string())?;
    Ok(fullscreen)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let settings = settings_path(app.handle()).map(|path| Settings::load(&path)).unwrap_or_default();
            let fire = Engine::new(app.handle().clone(), settings);
            fire.start_ticker();
            app.manage(fire);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            light,
            douse,
            get_settings,
            save_settings,
            list_models,
            set_fullscreen
        ])
        .build(tauri::generate_context!())
        .expect("Yule Log couldn't start")
        .run(|app, event| {
            // Closing the window puts the fire out (and the dropped connection stops the model).
            if let RunEvent::Exit = event {
                app.state::<Arc<Engine>>().douse("shutdown");
            }
        });
}
