// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::AppError;
use crate::store;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    pub path: String,
    pub name: String,
    pub content: String,
    pub size: u64,
    pub modified_ms: u64,
    pub read_only: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub theme: String,
    pub font_family: String,
    pub font_size: u32,
    pub tab_size: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            font_family: String::new(),
            font_size: 16,
            tab_size: 4,
        }
    }
}

impl Settings {
    /// Normaliza valores fuera de rango para que una configuración corrupta no rompa la UI.
    pub fn normalized(mut self) -> Self {
        if !matches!(self.theme.as_str(), "light" | "dark" | "system") {
            self.theme = "system".to_string();
        }
        self.font_size = self.font_size.clamp(10, 32);
        self.tab_size = self.tab_size.clamp(1, 8);
        if self.font_family.chars().count() > 200 {
            self.font_family = self.font_family.chars().take(200).collect();
        }
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionFile {
    pub path: String,
    pub cursor: u32,
    pub scroll: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Session {
    pub version: u32,
    pub open_files: Vec<SessionFile>,
    pub active_index: usize,
    pub window_width: u32,
    pub window_height: u32,
    pub maximized: bool,
}

impl Default for Session {
    fn default() -> Self {
        Self {
            version: 1,
            open_files: Vec::new(),
            active_index: 0,
            window_width: 0,
            window_height: 0,
            maximized: false,
        }
    }
}

impl Session {
    pub fn normalized(mut self) -> Self {
        self.version = 1;
        if self.open_files.is_empty() {
            self.active_index = 0;
        } else {
            self.active_index = self.active_index.min(self.open_files.len() - 1);
        }
        self
    }
}

fn modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn file_name(path: &std::path::Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("documento.md")
        .to_string()
}

#[tauri::command]
pub fn file_open(path: String) -> Result<OpenedFile, AppError> {
    let path = PathBuf::from(path);
    let (content, size, modified_ms) = store::read_text(&path)?;
    let metadata = fs::metadata(&path)?;

    Ok(OpenedFile {
        name: file_name(&path),
        path: path.to_string_lossy().into_owned(),
        content,
        size,
        modified_ms,
        read_only: metadata.permissions().readonly(),
    })
}

#[tauri::command]
pub fn file_save(path: String, content: String) -> Result<SavedFile, AppError> {
    let path = PathBuf::from(path);
    let size = store::write_text(&path, &content)?;
    let metadata = fs::metadata(&path)?;

    Ok(SavedFile {
        name: file_name(&path),
        path: path.to_string_lossy().into_owned(),
        size,
        modified_ms: modified_ms(&metadata),
    })
}

#[tauri::command]
pub fn settings_load(app: AppHandle) -> Result<Option<Settings>, AppError> {
    let path = store::config_dir(&app)?.join("settings.json");
    let settings = store::read_json::<Settings>(&path)?.map(Settings::normalized);
    Ok(settings)
}

#[tauri::command]
pub fn settings_save(app: AppHandle, settings: Settings) -> Result<(), AppError> {
    let path = store::config_dir(&app)?.join("settings.json");
    store::write_json_atomic(&path, &settings.normalized())
}

#[tauri::command]
pub fn session_load(app: AppHandle) -> Result<Option<Session>, AppError> {
    let path = store::config_dir(&app)?.join("session.json");
    let session = store::read_json::<Session>(&path)?.map(Session::normalized);
    Ok(session)
}

#[tauri::command]
pub fn session_save(app: AppHandle, session: Session) -> Result<(), AppError> {
    let path = store::config_dir(&app)?.join("session.json");
    store::write_json_atomic(&path, &session.normalized())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_are_clamped() {
        let settings = Settings {
            theme: "neón".to_string(),
            font_family: "x".repeat(300),
            font_size: 2,
            tab_size: 99,
        }
        .normalized();

        assert_eq!(settings.theme, "system");
        assert_eq!(settings.font_size, 10);
        assert_eq!(settings.tab_size, 8);
        assert_eq!(settings.font_family.chars().count(), 200);
    }

    #[test]
    fn session_active_index_is_clamped() {
        let session = Session {
            open_files: vec![SessionFile::default()],
            active_index: 10,
            ..Session::default()
        }
        .normalized();

        assert_eq!(session.active_index, 0);
    }

    #[test]
    fn session_deserializes_missing_fields() {
        let session: Session = serde_json::from_str("{}").expect("sesión mínima");
        assert_eq!(session, Session::default());
    }
}
