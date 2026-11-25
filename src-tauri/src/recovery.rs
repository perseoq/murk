// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

use std::cmp::Reverse;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::store;

const MAX_SNAPSHOTS_PER_DOCUMENT: usize = 50;
const MAX_HISTORY_PER_FILE: usize = 50;
const SNAPSHOT_MAX_AGE_SECONDS: u64 = 7 * 24 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySnapshot {
    pub id: String,
    pub doc_id: String,
    pub path: Option<String>,
    pub name: String,
    pub content: String,
    pub created_at: u64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMeta {
    pub id: String,
    pub path: String,
    pub created_at: u64,
    pub size: u64,
    pub hash: String,
    pub trigger: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryEntry {
    id: String,
    path: String,
    content: String,
    created_at: u64,
    hash: String,
    trigger: String,
}

fn hash_id(value: &str) -> String {
    blake3::hash(value.as_bytes()).to_hex().to_string()[..16].to_string()
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}

fn snapshots_root(base: &Path) -> PathBuf {
    base.join("recovery")
}

fn marker_path(base: &Path) -> PathBuf {
    base.join("running")
}

fn history_root(base: &Path) -> PathBuf {
    base.join("history")
}

/// Devuelve true si la ejecución anterior no terminó limpiamente.
pub fn check_crash(base: &Path) -> Result<bool, AppError> {
    let marker = marker_path(base);
    let crashed = marker.exists();

    if !crashed {
        fs::create_dir_all(base)?;
        fs::write(&marker, b"")?;
    }

    Ok(crashed)
}

pub fn mark_clean(base: &Path) {
    let _ = fs::remove_file(marker_path(base));
}

fn snapshot_dir(base: &Path, doc_id: &str) -> PathBuf {
    snapshots_root(base).join(hash_id(doc_id))
}

pub fn write_snapshot(
    base: &Path,
    doc_id: &str,
    path: Option<String>,
    name: String,
    content: String,
    reason: String,
) -> Result<RecoverySnapshot, AppError> {
    let directory = snapshot_dir(base, doc_id);
    fs::create_dir_all(&directory)?;

    let created_at = now_millis();
    let id = format!("{}-{}", now_nanos(), std::process::id());
    let snapshot = RecoverySnapshot {
        id: id.clone(),
        doc_id: doc_id.to_string(),
        path,
        name,
        content,
        created_at,
        reason,
    };

    store::write_json_atomic(&directory.join(format!("{id}.json")), &snapshot)?;
    prune_snapshots(&directory)?;

    Ok(snapshot)
}

fn prune_snapshots(directory: &Path) -> Result<(), AppError> {
    let mut files: Vec<(PathBuf, u64)> = fs::read_dir(directory)?
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                return None;
            }
            let modified = entry
                .metadata()
                .ok()
                .and_then(|meta| meta.modified().ok())
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs())
                .unwrap_or(0);
            Some((path, modified))
        })
        .collect();

    files.sort_by_key(|(_, modified)| *modified);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    for (path, modified) in files {
        let expired = now.saturating_sub(modified) > SNAPSHOT_MAX_AGE_SECONDS;
        let excess = list_snapshot_files(directory).len() > MAX_SNAPSHOTS_PER_DOCUMENT;
        if expired || excess {
            let _ = fs::remove_file(path);
        }
    }

    Ok(())
}

fn list_snapshot_files(directory: &Path) -> Vec<PathBuf> {
    fs::read_dir(directory)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("json"))
                .collect()
        })
        .unwrap_or_default()
}

pub fn list_snapshots(base: &Path) -> Result<Vec<RecoverySnapshot>, AppError> {
    let root = snapshots_root(base);
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut snapshots = Vec::new();

    for directory in fs::read_dir(root)?.flatten() {
        if !directory
            .file_type()
            .map(|kind| kind.is_dir())
            .unwrap_or(false)
        {
            continue;
        }

        for file in list_snapshot_files(&directory.path()) {
            if let Ok(Some(snapshot)) = store::read_json::<RecoverySnapshot>(&file) {
                snapshots.push(snapshot);
            }
        }
    }

    snapshots.sort_by_key(|snapshot| Reverse(snapshot.created_at));
    Ok(snapshots)
}

pub fn delete_document_snapshots(base: &Path, doc_id: &str) {
    let _ = fs::remove_dir_all(snapshot_dir(base, doc_id));
}

pub fn clear_snapshots(base: &Path) {
    let _ = fs::remove_dir_all(snapshots_root(base));
}

fn history_dir(base: &Path, path: &str) -> PathBuf {
    history_root(base).join(hash_id(path))
}

pub fn record_history(
    base: &Path,
    path: &str,
    content: &str,
    trigger: &str,
) -> Result<(), AppError> {
    if !Path::new(path).is_absolute() {
        return Err(AppError::new("invalid_path", "La ruta debe ser absoluta"));
    }

    let directory = history_dir(base, path);
    fs::create_dir_all(&directory)?;

    let hash = blake3::hash(content.as_bytes()).to_hex().to_string();
    let entries = read_history_entries(&directory);
    if entries.last().is_some_and(|entry| entry.hash == hash) {
        return Ok(());
    }

    let created_at = now_millis();
    let id = format!("{created_at}-{}", now_nanos());
    let entry = HistoryEntry {
        id: id.clone(),
        path: path.to_string(),
        content: content.to_string(),
        created_at,
        hash,
        trigger: trigger.to_string(),
    };

    store::write_json_atomic(&directory.join(format!("{id}.json")), &entry)?;
    prune_history(&directory)?;

    Ok(())
}

fn read_history_entries(directory: &Path) -> Vec<HistoryEntry> {
    let mut entries: Vec<HistoryEntry> = list_snapshot_files(directory)
        .into_iter()
        .filter_map(|file| store::read_json::<HistoryEntry>(&file).ok().flatten())
        .collect();
    entries.sort_by_key(|entry| entry.created_at);
    entries
}

fn prune_history(directory: &Path) -> Result<(), AppError> {
    let mut entries = read_history_entries(directory);
    if entries.len() <= MAX_HISTORY_PER_FILE {
        return Ok(());
    }

    entries.sort_by_key(|entry| entry.created_at);
    let excess = entries.len() - MAX_HISTORY_PER_FILE;
    for entry in entries.into_iter().take(excess) {
        let _ = fs::remove_file(directory.join(format!("{}.json", entry.id)));
    }

    Ok(())
}

pub fn list_history(base: &Path, path: &str) -> Result<Vec<HistoryMeta>, AppError> {
    if !Path::new(path).is_absolute() {
        return Err(AppError::new("invalid_path", "La ruta debe ser absoluta"));
    }

    let directory = history_dir(base, path);
    let mut entries = read_history_entries(&directory);
    entries.sort_by_key(|entry| Reverse(entry.created_at));

    Ok(entries
        .into_iter()
        .map(|entry| HistoryMeta {
            id: entry.id,
            path: entry.path,
            created_at: entry.created_at,
            size: entry.content.len() as u64,
            hash: entry.hash,
            trigger: entry.trigger,
        })
        .collect())
}

pub fn read_history(base: &Path, path: &str, id: &str) -> Result<String, AppError> {
    if !Path::new(path).is_absolute() {
        return Err(AppError::new("invalid_path", "La ruta debe ser absoluta"));
    }
    if !id
        .chars()
        .all(|character| character.is_ascii_digit() || character == '-')
    {
        return Err(AppError::new(
            "invalid_path",
            "Identificador de versión inválido",
        ));
    }

    let file = history_dir(base, path).join(format!("{id}.json"));
    let entry = store::read_json::<HistoryEntry>(&file)?
        .ok_or_else(|| AppError::new("not_found", "Versión no encontrada"))?;
    Ok(entry.content)
}

fn config_base(app: &AppHandle) -> Result<PathBuf, AppError> {
    store::config_dir(app)
}

fn data_base(app: &AppHandle) -> Result<PathBuf, AppError> {
    let data = app
        .path()
        .data_dir()
        .map_err(|error| AppError::new("data_dir", error.to_string()))?;
    Ok(data.join("murk"))
}

#[tauri::command]
pub fn recovery_check_crash(app: AppHandle) -> Result<bool, AppError> {
    check_crash(&config_base(&app)?)
}

#[tauri::command]
pub fn recovery_mark_clean(app: AppHandle) -> Result<(), AppError> {
    mark_clean(&config_base(&app)?);
    Ok(())
}

#[tauri::command]
pub fn recovery_write(
    app: AppHandle,
    doc_id: String,
    path: Option<String>,
    name: String,
    content: String,
    reason: String,
) -> Result<RecoverySnapshot, AppError> {
    write_snapshot(&config_base(&app)?, &doc_id, path, name, content, reason)
}

#[tauri::command]
pub fn recovery_list(app: AppHandle) -> Result<Vec<RecoverySnapshot>, AppError> {
    list_snapshots(&config_base(&app)?)
}

#[tauri::command]
pub fn recovery_delete(app: AppHandle, doc_id: String) -> Result<(), AppError> {
    delete_document_snapshots(&config_base(&app)?, &doc_id);
    Ok(())
}

#[tauri::command]
pub fn recovery_clear(app: AppHandle) -> Result<(), AppError> {
    clear_snapshots(&config_base(&app)?);
    Ok(())
}

#[tauri::command]
pub fn history_record(
    app: AppHandle,
    path: String,
    content: String,
    trigger: String,
) -> Result<(), AppError> {
    record_history(&data_base(&app)?, &path, &content, &trigger)
}

#[tauri::command]
pub fn history_list(app: AppHandle, path: String) -> Result<Vec<HistoryMeta>, AppError> {
    list_history(&data_base(&app)?, &path)
}

#[tauri::command]
pub fn history_read(app: AppHandle, path: String, id: String) -> Result<String, AppError> {
    read_history(&data_base(&app)?, &path, &id)
}

#[tauri::command]
pub fn history_clear(app: AppHandle, path: String) -> Result<(), AppError> {
    if !Path::new(&path).is_absolute() {
        return Err(AppError::new("invalid_path", "La ruta debe ser absoluta"));
    }
    let _ = fs::remove_dir_all(history_dir(&data_base(&app)?, &path));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marker_detects_unclean_exit() {
        let directory = tempfile::tempdir().expect("tempdir");
        assert!(!check_crash(directory.path()).expect("primera"));
        assert!(check_crash(directory.path()).expect("segunda"));
        mark_clean(directory.path());
        assert!(!check_crash(directory.path()).expect("limpia"));
    }

    #[test]
    fn snapshots_roundtrip_and_delete() {
        let directory = tempfile::tempdir().expect("tempdir");

        let first = write_snapshot(
            directory.path(),
            "/tmp/a.md",
            Some("/tmp/a.md".to_string()),
            "a.md".to_string(),
            "hola".to_string(),
            "interval".to_string(),
        )
        .expect("snapshot");

        let snapshots = list_snapshots(directory.path()).expect("listar");
        assert_eq!(snapshots.len(), 1);
        assert_eq!(snapshots[0].id, first.id);
        assert_eq!(snapshots[0].content, "hola");

        delete_document_snapshots(directory.path(), "/tmp/a.md");
        assert!(list_snapshots(directory.path()).expect("listar").is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn history_dedupes_identical_content() {
        let directory = tempfile::tempdir().expect("tempdir");
        let path = "/tmp/nota.md";

        record_history(directory.path(), path, "uno", "save").expect("guardar");
        record_history(directory.path(), path, "uno", "save").expect("repetir");
        record_history(directory.path(), path, "dos", "save").expect("guardar");

        let entries = list_history(directory.path(), path).expect("listar");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].size, 3);

        let content = read_history(directory.path(), path, &entries[0].id).expect("leer versión");
        assert_eq!(content, "dos");
    }

    #[test]
    fn history_rejects_relative_paths() {
        let directory = tempfile::tempdir().expect("tempdir");
        assert_eq!(
            record_history(directory.path(), "relativa.md", "x", "save")
                .expect_err("relativa")
                .code,
            "invalid_path"
        );
    }
}
