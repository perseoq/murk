// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::de::DeserializeOwned;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::AppError;

/// Límite de A1. A2 añadirá detección de codificación y modo de solo lectura.
pub const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;

/// `~/.config/murk` (XDG), independiente del identificador de Tauri.
pub fn config_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let base = app
        .path()
        .config_dir()
        .map_err(|error| AppError::new("config_dir", error.to_string()))?;
    Ok(base.join("murk"))
}

pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, AppError> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map(Some).map_err(|error| {
            AppError::new(
                "invalid_json",
                format!("No se pudo leer {}: {error}", path.display()),
            )
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(AppError::from(error)),
    }
}

pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), AppError> {
    let data = serde_json::to_vec_pretty(value)
        .map_err(|error| AppError::new("serialize", error.to_string()))?;
    write_bytes_atomic(path, &data)
}

pub fn write_bytes_atomic(path: &Path, data: &[u8]) -> Result<(), AppError> {
    if !path.is_absolute() {
        return Err(AppError::new("invalid_path", "La ruta debe ser absoluta"));
    }

    let parent = path
        .parent()
        .ok_or_else(|| AppError::new("invalid_path", "La ruta no tiene directorio padre"))?;
    fs::create_dir_all(parent)?;

    let previous_permissions = fs::metadata(path).ok().map(|meta| meta.permissions());
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(data)?;
    temporary.as_file().sync_all()?;
    temporary
        .persist(path)
        .map_err(|error| AppError::new("io", error.to_string()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = previous_permissions
            .as_ref()
            .map(PermissionsExt::mode)
            .unwrap_or(0o644);
        fs::set_permissions(path, fs::Permissions::from_mode(mode))?;
    }

    #[cfg(not(unix))]
    if let Some(permissions) = previous_permissions {
        fs::set_permissions(path, permissions)?;
    }

    Ok(())
}

pub fn read_text(path: &Path) -> Result<(String, u64, u64), AppError> {
    if !path.is_absolute() {
        return Err(AppError::new("invalid_path", "La ruta debe ser absoluta"));
    }

    let metadata = fs::metadata(path)?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(AppError::new(
            "too_large",
            "El archivo supera el límite de 50 MB de esta fase",
        ));
    }

    let bytes = fs::read(path)?;
    let content = String::from_utf8(bytes).map_err(|_| {
        AppError::new(
            "unsupported_encoding",
            "El archivo no es UTF-8. La detección de codificación llegará en A2.",
        )
    })?;

    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);

    Ok((content, metadata.len(), modified_ms))
}

pub fn write_text(path: &Path, content: &str) -> Result<u64, AppError> {
    write_bytes_atomic(path, content.as_bytes())?;
    Ok(content.len() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_roundtrip_preserves_utf8_and_crlf() {
        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("nota.md");
        let content = "línea 1\r\nlínea 2\nñandú 🦀\n";

        write_text(&path, content).expect("guardar");
        let (read, size, _) = read_text(&path).expect("leer");

        assert_eq!(read, content);
        assert_eq!(size, content.len() as u64);
    }

    #[test]
    fn overwrite_replaces_content() {
        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("nota.md");

        write_text(&path, "primera").expect("guardar");
        write_text(&path, "segunda").expect("sobrescribir");

        assert_eq!(read_text(&path).expect("leer").0, "segunda");
    }

    #[test]
    fn relative_paths_are_rejected() {
        let error = write_text(Path::new("relativa.md"), "x").expect_err("debe fallar");
        assert_eq!(error.code, "invalid_path");

        let error = read_text(Path::new("relativa.md")).expect_err("debe fallar");
        assert_eq!(error.code, "invalid_path");
    }

    #[test]
    fn json_roundtrip_and_missing_file() {
        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("settings.json");

        assert!(read_json::<serde_json::Value>(&path)
            .expect("leer")
            .is_none());

        let value = serde_json::json!({ "tema": "oscuro", "n": 4 });
        write_json_atomic(&path, &value).expect("guardar");

        let read: serde_json::Value = read_json(&path).expect("leer").expect("existe");
        assert_eq!(read, value);
    }

    #[test]
    fn invalid_json_reports_error() {
        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("roto.json");
        fs::write(&path, "{no es json").expect("escribir");

        let error = read_json::<serde_json::Value>(&path).expect_err("debe fallar");
        assert_eq!(error.code, "invalid_json");
    }

    #[cfg(unix)]
    #[test]
    fn overwrite_keeps_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("nota.md");
        write_text(&path, "a").expect("guardar");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).expect("permisos");

        write_text(&path, "b").expect("sobrescribir");

        let mode = fs::metadata(&path).expect("metadata").permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }
}
