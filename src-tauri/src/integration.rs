// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::State;

/// Archivos recibidos en el arranque, consumidos una sola vez por el frontend.
#[derive(Default)]
pub struct StartupFiles(pub Mutex<Vec<String>>);

const FLAGS_WITH_VALUE: &[&str] = &["--export", "-o", "--output"];

/// Extrae rutas de archivo de los argumentos, resolviendo relativas contra `cwd`.
pub fn paths_from_args(args: &[String], cwd: &Path) -> Vec<String> {
    let mut paths = Vec::new();
    let mut seen = HashSet::new();
    let mut skip_next = false;
    let mut stop_flags = false;

    for argument in args {
        if skip_next {
            skip_next = false;
            continue;
        }

        if argument == "--" {
            stop_flags = true;
            continue;
        }

        if !stop_flags && argument.starts_with('-') {
            if FLAGS_WITH_VALUE.contains(&argument.as_str()) {
                skip_next = true;
            }
            continue;
        }

        let candidate = PathBuf::from(argument);
        let resolved = if candidate.is_absolute() {
            candidate
        } else {
            cwd.join(candidate)
        };

        if !resolved.exists() || !resolved.is_file() {
            continue;
        }

        let value = resolved.to_string_lossy().into_owned();
        if seen.insert(value.clone()) {
            paths.push(value);
        }
    }

    paths
}

#[tauri::command]
pub fn take_startup_files(state: State<'_, StartupFiles>) -> Result<Vec<String>, String> {
    let mut files = state
        .0
        .lock()
        .map_err(|_| "estado de arranque bloqueado".to_string())?;
    Ok(std::mem::take(&mut *files))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_existing_files_and_resolves_relative() {
        let directory = tempfile::tempdir().expect("tempdir");
        let file = directory.path().join("nota.md");
        std::fs::write(&file, "# Hola").expect("archivo");

        let args = vec![
            "--new-window".to_string(),
            "nota.md".to_string(),
            "inexistente.md".to_string(),
            "nota.md".to_string(),
        ];
        let paths = paths_from_args(&args, directory.path());

        assert_eq!(paths, vec![file.to_string_lossy().into_owned()]);
    }

    #[test]
    fn skips_output_and_export_values() {
        let directory = tempfile::tempdir().expect("tempdir");
        let file = directory.path().join("nota.md");
        std::fs::write(&file, "# Hola").expect("archivo");

        let args = vec![
            "--export".to_string(),
            "pdf".to_string(),
            "-o".to_string(),
            "salida.pdf".to_string(),
            "--".to_string(),
            file.to_string_lossy().into_owned(),
        ];

        let paths = paths_from_args(&args, directory.path());
        assert_eq!(paths, vec![file.to_string_lossy().into_owned()]);
    }

    #[test]
    fn absolute_paths_survive() {
        let directory = tempfile::tempdir().expect("tempdir");
        let file = directory.path().join("absoluta.md");
        std::fs::write(&file, "x").expect("archivo");

        let args = vec![file.to_string_lossy().into_owned()];
        let paths = paths_from_args(&args, Path::new("/tmp"));
        assert_eq!(paths, vec![file.to_string_lossy().into_owned()]);
    }
}
