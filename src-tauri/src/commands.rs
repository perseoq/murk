// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::AppError;
use crate::store;

const MAX_IMAGE_SIZE: u64 = 20 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    pub path: String,
    pub name: String,
    pub content: String,
    pub size: u64,
    pub modified_ms: u64,
    pub read_only: bool,
    pub encoding: String,
    pub eol: String,
    pub bom: bool,
    pub fingerprint: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_ms: u64,
    pub encoding: String,
    pub eol: String,
    pub bom: bool,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SaveOptions {
    pub encoding: String,
    pub bom: bool,
    pub eol: String,
    pub convert_eol: bool,
    pub expected_fingerprint: Option<String>,
}

impl Default for SaveOptions {
    fn default() -> Self {
        Self {
            encoding: "utf-8".to_string(),
            bom: false,
            eol: "lf".to_string(),
            convert_eol: false,
            expected_fingerprint: None,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub name: String,
    pub modified_ms: u64,
    pub exists: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageData {
    pub mime: String,
    pub data_url: String,
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

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("documento.md")
        .to_string()
}

fn recent_file(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(store::config_dir(app)?.join("recent.json"))
}

fn image_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => Some("image/png"),
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
        Some("avif") => Some("image/avif"),
        Some("bmp") => Some("image/bmp"),
        Some("svg") => Some("image/svg+xml"),
        _ => None,
    }
}

fn build_recent(paths: Vec<String>) -> Vec<RecentEntry> {
    paths
        .into_iter()
        .map(|path| {
            let file = PathBuf::from(&path);
            let metadata = fs::metadata(&file).ok();
            RecentEntry {
                name: file_name(&file),
                modified_ms: metadata.as_ref().map(store::modified_ms).unwrap_or(0),
                exists: metadata.is_some(),
                path,
            }
        })
        .collect()
}

#[tauri::command]
pub fn file_open(path: String) -> Result<OpenedFile, AppError> {
    let path = PathBuf::from(path);
    let (bytes, size, modified_ms) = store::read_bytes(&path)?;
    let decoded = store::decode(&bytes)?;
    let metadata = fs::metadata(&path)?;

    Ok(OpenedFile {
        name: file_name(&path),
        path: path.to_string_lossy().into_owned(),
        content: decoded.content,
        size,
        modified_ms,
        read_only: metadata.permissions().readonly() || size > store::MAX_EDITABLE_SIZE,
        encoding: decoded.encoding,
        eol: decoded.eol,
        bom: decoded.bom,
        fingerprint: decoded.fingerprint,
    })
}

#[tauri::command]
pub fn file_save(
    path: String,
    content: String,
    options: SaveOptions,
) -> Result<SavedFile, AppError> {
    let path = PathBuf::from(path);

    store::check_fingerprint(&path, options.expected_fingerprint.as_deref())?;

    let text = if options.convert_eol {
        store::convert_eol(&content, &options.eol)
    } else {
        content
    };
    let encoded = store::encode(&text, &options.encoding, options.bom)?;
    store::write_bytes_atomic(&path, &encoded.bytes)?;

    let metadata = fs::metadata(&path)?;
    let eol = if options.convert_eol {
        options.eol.clone()
    } else {
        store::detect_eol(&text).to_string()
    };

    Ok(SavedFile {
        name: file_name(&path),
        path: path.to_string_lossy().into_owned(),
        size: encoded.bytes.len() as u64,
        modified_ms: store::modified_ms(&metadata),
        encoding: encoded.encoding,
        eol,
        bom: encoded.bom,
        fingerprint: store::fingerprint(&encoded.bytes),
    })
}

#[tauri::command]
pub fn image_load(path: String) -> Result<ImageData, AppError> {
    let path = PathBuf::from(path);
    if !path.is_absolute() {
        return Err(AppError::new("invalid_path", "La ruta debe ser absoluta"));
    }

    let metadata = fs::metadata(&path)?;
    if metadata.len() > MAX_IMAGE_SIZE {
        return Err(AppError::new(
            "too_large",
            "La imagen supera el límite de 20 MB",
        ));
    }

    let mime = image_mime(&path).ok_or_else(|| {
        AppError::new(
            "unsupported_image",
            "Formato de imagen no soportado (png, jpg, gif, webp, avif, bmp, svg)",
        )
    })?;

    let bytes = fs::read(&path)?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);

    Ok(ImageData {
        mime: mime.to_string(),
        data_url: format!("data:{mime};base64,{encoded}"),
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

#[tauri::command]
pub fn recent_list(app: AppHandle) -> Result<Vec<RecentEntry>, AppError> {
    let paths = store::read_json::<Vec<String>>(&recent_file(&app)?)?.unwrap_or_default();
    Ok(build_recent(paths))
}

#[tauri::command]
pub fn recent_add(app: AppHandle, path: String) -> Result<Vec<RecentEntry>, AppError> {
    if !Path::new(&path).is_absolute() {
        return Err(AppError::new("invalid_path", "La ruta debe ser absoluta"));
    }

    let file = recent_file(&app)?;
    let list = store::read_json::<Vec<String>>(&file)?.unwrap_or_default();
    let list = store::push_recent(list, path);
    store::write_json_atomic(&file, &list)?;

    Ok(build_recent(list))
}

#[tauri::command]
pub fn recent_clear(app: AppHandle) -> Result<(), AppError> {
    store::write_json_atomic(&recent_file(&app)?, &Vec::<String>::new())
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

    #[test]
    fn save_options_have_safe_defaults() {
        let options: SaveOptions = serde_json::from_str("{}").expect("opciones mínimas");
        assert_eq!(options.encoding, "utf-8");
        assert!(!options.bom);
        assert!(!options.convert_eol);
        assert!(options.expected_fingerprint.is_none());
    }

    #[test]
    fn image_load_returns_data_url() {
        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("pixel.png");
        fs::write(&path, [0x89, 0x50, 0x4E, 0x47]).expect("escribir");

        let image = image_load(path.to_string_lossy().into_owned()).expect("cargar");
        assert_eq!(image.mime, "image/png");
        assert!(image.data_url.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn image_load_rejects_relative_and_unknown() {
        assert_eq!(
            image_load("relativa.png".to_string())
                .expect_err("relativa")
                .code,
            "invalid_path"
        );

        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("nota.txt");
        fs::write(&path, b"x").expect("escribir");
        assert_eq!(
            image_load(path.to_string_lossy().into_owned())
                .expect_err("extensión")
                .code,
            "unsupported_image"
        );
    }
}
