// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

use std::sync::Mutex;

use tauri::{Emitter, Manager};

pub mod cli;

mod commands;
mod error;
mod export;
mod integration;
mod recovery;
mod repository;
mod store;
mod watcher;
mod workspace;

/// Arranca la aplicación Murk.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    integration::integrate_appimage();
    let cwd = std::env::current_dir().unwrap_or_default();
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let startup_files = integration::paths_from_args(&arguments, &cwd);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let arguments: Vec<String> = argv.into_iter().skip(1).collect();
            let paths = integration::paths_from_args(&arguments, std::path::Path::new(&cwd));

            if !paths.is_empty() {
                let _ = app.emit("app:open", paths);
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(integration::StartupFiles(Mutex::new(startup_files)))
        .manage(watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            commands::file_open,
            commands::file_save,
            commands::image_load,
            commands::settings_load,
            commands::settings_save,
            commands::session_load,
            commands::session_save,
            commands::recent_list,
            commands::recent_add,
            commands::recent_clear,
            workspace::dir_list,
            workspace::search_workspace,
            export::export_document,
            integration::take_startup_files,
            recovery::recovery_check_crash,
            recovery::recovery_mark_clean,
            recovery::recovery_write,
            recovery::recovery_list,
            recovery::recovery_delete,
            recovery::recovery_clear,
            recovery::history_record,
            recovery::history_list,
            recovery::history_read,
            recovery::history_clear,
            repository::repository_config_load,
            repository::repository_config_save,
            repository::repository_push,
            watcher::watch_file,
            watcher::unwatch_file,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar Murk");
}
