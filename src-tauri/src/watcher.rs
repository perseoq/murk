// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::error::AppError;
use crate::store;

const DEBOUNCE: Duration = Duration::from_millis(250);

#[derive(Default)]
pub struct WatcherState {
    watchers: Mutex<HashMap<PathBuf, RecommendedWatcher>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangedEvent {
    pub path: String,
    pub kind: String,
    pub modified_ms: u64,
    pub size: u64,
}

#[tauri::command]
pub fn watch_file(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), AppError> {
    let original = PathBuf::from(&path);
    if !original.is_absolute() {
        return Err(AppError::new("invalid_path", "La ruta debe ser absoluta"));
    }

    let parent = original
        .parent()
        .ok_or_else(|| AppError::new("invalid_path", "La ruta no tiene directorio padre"))?;
    let canonical_parent = parent.canonicalize()?;
    let watched_name = original.file_name().map(|name| name.to_os_string());

    let app_handle = app.clone();
    let original_for_callback = original.clone();
    let last_event: Arc<Mutex<HashMap<PathBuf, Instant>>> = Arc::new(Mutex::new(HashMap::new()));

    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else {
            return;
        };

        let relevant = event
            .paths
            .iter()
            .any(|changed| changed.file_name() == watched_name.as_deref());
        if !relevant {
            return;
        }

        let now = Instant::now();
        if let Ok(mut events) = last_event.lock() {
            if let Some(previous) = events.get(&original_for_callback) {
                if now.duration_since(*previous) < DEBOUNCE {
                    return;
                }
            }
            events.insert(original_for_callback.clone(), now);
        }

        let metadata = fs::metadata(&original_for_callback).ok();
        let kind = if matches!(event.kind, EventKind::Remove(_)) || metadata.is_none() {
            "removed"
        } else if matches!(event.kind, EventKind::Create(_)) {
            "created"
        } else {
            "modified"
        };

        let payload = FileChangedEvent {
            path: original_for_callback.to_string_lossy().into_owned(),
            kind: kind.to_string(),
            modified_ms: metadata.as_ref().map(store::modified_ms).unwrap_or(0),
            size: metadata.as_ref().map(fs::Metadata::len).unwrap_or(0),
        };

        let _ = app_handle.emit("file:changed", payload);
    })
    .map_err(|error| AppError::new("watcher", error.to_string()))?;

    watcher
        .watch(&canonical_parent, RecursiveMode::NonRecursive)
        .map_err(|error| AppError::new("watcher", error.to_string()))?;

    let mut watchers = state
        .watchers
        .lock()
        .map_err(|_| AppError::new("watcher", "Estado de watchers bloqueado"))?;
    watchers.insert(original, watcher);

    Ok(())
}

#[tauri::command]
pub fn unwatch_file(state: State<'_, WatcherState>, path: String) -> Result<(), AppError> {
    if let Ok(mut watchers) = state.watchers.lock() {
        watchers.remove(Path::new(&path));
    }
    Ok(())
}
