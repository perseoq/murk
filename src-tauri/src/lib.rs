// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

mod commands;
mod error;
mod recovery;
mod store;
mod watcher;
mod workspace;

/// Arranca la aplicación Murk.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            watcher::watch_file,
            watcher::unwatch_file,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar Murk");
}
