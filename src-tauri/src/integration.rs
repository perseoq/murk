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

/// Instala el `.desktop` y los iconos en el perfil del usuario.
///
/// El escritorio GNOME asocia la ventana por su id GTK
/// (`io.github.perseoq.murk`) con un archivo `.desktop` del mismo nombre. La
/// AppImage no instala nada por sí sola y un binario suelto tampoco, así que
/// cada ejecución deja una entrada en `~/.local/share/applications` que apunta
/// al ejecutable actual para que «Abrir con Murk» y los dobles clics
/// funcionen.
#[cfg(target_os = "linux")]
pub fn integrate_desktop() {
    let Ok(home) = std::env::var("HOME") else {
        return;
    };
    let home = PathBuf::from(home);
    let appdir = std::env::var("APPDIR").ok().map(PathBuf::from);
    let executable = match std::env::var("APPIMAGE") {
        Ok(appimage) if !appimage.is_empty() => appimage,
        _ => match std::env::current_exe() {
            Ok(path) => path.to_string_lossy().into_owned(),
            Err(_) => return,
        },
    };

    write_desktop_integration(&home, appdir.as_deref(), &executable);
}

/// Escribe (o actualiza) la entrada de escritorio y los iconos disponibles.
#[cfg(target_os = "linux")]
fn write_desktop_integration(home: &Path, appdir: Option<&Path>, executable: &str) {
    if let Some(appdir) = appdir {
        for size in ["128x128", "256x256", "512x512"] {
            let icon_source = appdir
                .join("usr/share/icons/hicolor")
                .join(size)
                .join("apps/murk.png");
            if !icon_source.exists() {
                continue;
            }
            let icon_target = home
                .join(".local/share/icons/hicolor")
                .join(size)
                .join("apps/murk.png");
            if let Some(parent) = icon_target.parent() {
                if std::fs::create_dir_all(parent).is_ok() {
                    let _ = std::fs::copy(&icon_source, &icon_target);
                }
            }
        }
    }

    let desktop_dir = home.join(".local/share/applications");
    let desktop_path = desktop_dir.join("io.github.perseoq.murk.desktop");
    let entry = appimage_desktop_entry(executable);
    let existed = desktop_path.exists();

    // La comparación hace que, si el ejecutable cambia de ruta, el Exec se
    // reescriba con la ubicación actual.
    if std::fs::read_to_string(&desktop_path).ok().as_deref() != Some(entry.as_str())
        && std::fs::create_dir_all(&desktop_dir).is_ok()
    {
        let _ = std::fs::write(&desktop_path, entry);
        refresh_desktop_database(&desktop_dir);
    }

    if !existed {
        #[cfg(not(test))]
        register_default_handler();
    }
}

/// Deja Murk como aplicación predeterminada para Markdown la primera vez.
#[cfg(all(target_os = "linux", not(test)))]
fn register_default_handler() {
    use std::process::{Command, Stdio};

    for mime in ["text/markdown", "text/x-markdown"] {
        let _ = Command::new("xdg-mime")
            .args(["default", "io.github.perseoq.murk.desktop", mime])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

#[cfg(target_os = "linux")]
fn refresh_desktop_database(desktop_dir: &Path) {
    use std::process::{Command, Stdio};

    let _ = Command::new("update-desktop-database")
        .arg(desktop_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(target_os = "linux")]
fn appimage_desktop_entry(appimage: &str) -> String {
    let exec = appimage.replace('"', "\\\"");
    let version = env!("CARGO_PKG_VERSION");
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=Murk\n\
         Comment=Editor de Markdown con preview en vivo\n\
         Exec=\"{exec}\" %F\n\
         Icon=murk\n\
         Terminal=false\n\
         Categories=Office;\n\
         MimeType=text/markdown;text/x-markdown;\n\
         StartupWMClass=Murk\n\
         Keywords=markdown;editor;notes;text;\n\
         X-AppImage-Version={version}\n"
    )
}

/// En otros sistemas no hay integración de AppImage.
#[cfg(not(target_os = "linux"))]
pub fn integrate_appimage() {}

fn local_path(argument: &str) -> Option<PathBuf> {
    let Some(rest) = argument.strip_prefix("file://") else {
        return Some(PathBuf::from(argument));
    };
    let rest = rest.strip_prefix("localhost").unwrap_or(rest);
    percent_decode(rest).map(PathBuf::from)
}

fn percent_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = std::str::from_utf8(bytes.get(index + 1..index + 3)?).ok()?;
            output.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(output).ok()
}

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

        let Some(candidate) = local_path(argument) else {
            continue;
        };
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

    #[test]
    fn accepts_file_uris_with_percent_encoding() {
        let directory = tempfile::tempdir().expect("tempdir");
        let file = directory.path().join("nota con espacios.md");
        std::fs::write(&file, "x").expect("archivo");

        let uri = format!("file://{}", file.to_string_lossy().replace(' ', "%20"));
        let paths = paths_from_args(&[uri], Path::new("/tmp"));
        assert_eq!(paths, vec![file.to_string_lossy().into_owned()]);

        let localhost = format!(
            "file://localhost{}",
            file.to_string_lossy().replace(' ', "%20")
        );
        let paths = paths_from_args(&[localhost], Path::new("/tmp"));
        assert_eq!(paths, vec![file.to_string_lossy().into_owned()]);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn appimage_desktop_entry_tracks_current_path() {
        let home = tempfile::tempdir().expect("home");
        let appdir = tempfile::tempdir().expect("appdir");
        let icons = appdir.path().join("usr/share/icons/hicolor/128x128/apps");
        std::fs::create_dir_all(&icons).expect("iconos");
        std::fs::write(icons.join("murk.png"), b"png").expect("icono");

        let desktop = home
            .path()
            .join(".local/share/applications/io.github.perseoq.murk.desktop");

        write_desktop_integration(
            home.path(),
            Some(appdir.path()),
            "/tmp/primera/Murk.AppImage",
        );
        let first = std::fs::read_to_string(&desktop).expect("desktop");
        assert!(first.contains("Exec=\"/tmp/primera/Murk.AppImage\" %F"));
        assert!(home
            .path()
            .join(".local/share/icons/hicolor/128x128/apps/murk.png")
            .exists());

        write_desktop_integration(
            home.path(),
            Some(appdir.path()),
            "/tmp/otra-ruta/Murk.AppImage",
        );
        let second = std::fs::read_to_string(&desktop).expect("desktop actualizado");
        assert!(second.contains("Exec=\"/tmp/otra-ruta/Murk.AppImage\" %F"));
        assert!(!second.contains("/tmp/primera/Murk.AppImage"));
    }
}
