// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

mod commands;
mod error;
mod store;

/// Arranca la aplicación Murk.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::file_open,
            commands::file_save,
            commands::settings_load,
            commands::settings_save,
            commands::session_load,
            commands::session_save,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar Murk");
}
