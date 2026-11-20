// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

use std::fs;
use std::path::{Path, PathBuf};

use crate::export::{self, format_extension, ExportRequest, ExportSettings};

fn help() {
    println!(
        "Murk {}\n\nUso:\n  murk [archivos…]                 Abre la interfaz\n  murk --export <formato> <archivo> [-o salida]\n  murk --version\n\nFormatos: html, pdf, docx, epub, odt, latex, md",
        env!("CARGO_PKG_VERSION")
    );
}

fn absolute(path: &str) -> PathBuf {
    let path = PathBuf::from(path);
    if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    }
}

fn default_output(input: &Path, format: &str) -> PathBuf {
    let extension = format_extension(format).unwrap_or("out");
    input.with_extension(extension)
}

/// Devuelve Some(código) cuando la invocación es de consola.
pub fn run(args: Vec<String>) -> Option<i32> {
    if args.is_empty() {
        return None;
    }

    if args.iter().any(|arg| arg == "--version") {
        println!("Murk {}", env!("CARGO_PKG_VERSION"));
        return Some(0);
    }

    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        help();
        return Some(0);
    }

    let export_index = args.iter().position(|arg| arg == "--export")?;
    let format = args.get(export_index + 1)?.to_ascii_lowercase();
    let input = args.get(export_index + 2)?;

    let output = args
        .iter()
        .position(|arg| arg == "-o" || arg == "--output")
        .and_then(|index| args.get(index + 1))
        .cloned();

    let input_path = absolute(input);
    let output_path = output
        .map(|path| absolute(&path))
        .unwrap_or_else(|| default_output(&input_path, &format));

    let content = match fs::read_to_string(&input_path) {
        Ok(content) => content,
        Err(error) => {
            eprintln!("No se pudo leer {}: {error}", input_path.display());
            return Some(2);
        }
    };

    let title = input_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Documento")
        .to_string();

    let request = ExportRequest {
        source_path: Some(input_path.to_string_lossy().into_owned()),
        output_path: output_path.to_string_lossy().into_owned(),
        format,
        content,
        title,
        embed_images: true,
        ..ExportRequest::default()
    };

    match export::export(&request, &ExportSettings::default()) {
        Ok(result) => {
            println!("{}", result.path);
            Some(0)
        }
        Err(error) => {
            eprintln!("{}: {}", error.code, error.message);
            Some(3)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_a_cli_command() {
        assert_eq!(run(vec!["--version".to_string()]), Some(0));
    }

    #[test]
    fn exports_markdown_from_cli() {
        let directory = tempfile::tempdir().expect("tempdir");
        let input = directory.path().join("nota.md");
        let output = directory.path().join("salida.md");
        fs::write(&input, "# Hola\n").expect("entrada");

        let code = run(vec![
            "--export".to_string(),
            "md".to_string(),
            input.to_string_lossy().into_owned(),
            "-o".to_string(),
            output.to_string_lossy().into_owned(),
        ]);

        assert_eq!(code, Some(0));
        assert_eq!(fs::read_to_string(output).expect("salida"), "# Hola\n");
    }
}
