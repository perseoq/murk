// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use base64::Engine as _;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::commands::Settings;
use crate::error::AppError;
use crate::store;

const HTML_CSS: &str = r#"
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  max-width: 46rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
  color: #1f2328;
  background: #fff;
  font-family: "Noto Serif", Georgia, serif;
  font-size: 16px;
  line-height: 1.7;
  overflow-wrap: break-word;
}
h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.4em 0 0.5em; }
h1 { font-size: 1.8em; }
h2 { font-size: 1.45em; }
h3 { font-size: 1.2em; }
a { color: #0969da; }
img { max-width: 100%; height: auto; border-radius: 6px; }
code {
  padding: 0.15em 0.35em;
  border-radius: 4px;
  background: #f6f8fa;
  font-family: "Noto Sans Mono", monospace;
  font-size: 0.9em;
}
pre { padding: 1rem; overflow: auto; border-radius: 8px; background: #f6f8fa; }
pre code { padding: 0; background: transparent; }
blockquote { margin: 1em 0; padding-left: 1rem; border-left: 3px solid #d8dee4; color: #59636e; }
table { width: 100%; border-collapse: collapse; margin: 1em 0; }
th, td { padding: 0.4em 0.6em; border: 1px solid #d8dee4; text-align: left; vertical-align: top; }
th { background: #f6f8fa; }
hr { border: 0; border-top: 1px solid #d8dee4; margin: 2em 0; }
.task-list-item { list-style: none; }
input[type="checkbox"] { margin-right: 0.4em; }
@page { size: A4; margin: 18mm; }
@media print {
  body { max-width: none; padding: 0; }
  pre, table, blockquote, img { break-inside: avoid; }
  a { color: inherit; text-decoration: underline; }
}
"#;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub source_path: Option<String>,
    pub output_path: String,
    pub format: String,
    pub content: String,
    pub title: String,
    #[serde(default)]
    pub embed_images: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub format: String,
    pub engine: String,
    pub size: u64,
}

#[derive(Debug, Clone, Default)]
pub struct ExportSettings {
    pub pandoc_path: String,
    pub chromium_path: String,
    pub pdf_engine: String,
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub fn format_extension(format: &str) -> Option<&'static str> {
    match format {
        "html" => Some("html"),
        "pdf" => Some("pdf"),
        "docx" => Some("docx"),
        "epub" => Some("epub"),
        "odt" => Some("odt"),
        "latex" => Some("tex"),
        "md" | "markdown" => Some("md"),
        _ => None,
    }
}

fn source_directory(source_path: Option<&str>) -> PathBuf {
    if let Some(path) = source_path {
        let path = Path::new(path);
        if let Some(parent) = path.parent() {
            return parent.to_path_buf();
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
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

fn embed_images(html: &str, base: &Path) -> String {
    let Ok(pattern) = Regex::new(r#"(?i)(<img\b[^>]*?\bsrc=")([^"]+)(")"#) else {
        return html.to_string();
    };

    pattern
        .replace_all(html, |captures: &regex::Captures<'_>| {
            let source = &captures[2];
            if source.starts_with("data:")
                || source.starts_with("http://")
                || source.starts_with("https://")
                || source.starts_with("//")
            {
                return captures[0].to_string();
            }

            let mut decoded = source.replace("%20", " ").replace("%23", "#");
            if let Some(stripped) = decoded.strip_prefix("file://") {
                decoded = stripped.to_string();
            }

            let path = PathBuf::from(&decoded);
            let resolved = if path.is_absolute() {
                path
            } else {
                base.join(path)
            };

            let Ok(metadata) = fs::metadata(&resolved) else {
                return captures[0].to_string();
            };
            if metadata.len() > 20 * 1024 * 1024 {
                return captures[0].to_string();
            }
            let Some(mime) = image_mime(&resolved) else {
                return captures[0].to_string();
            };
            let Ok(bytes) = fs::read(&resolved) else {
                return captures[0].to_string();
            };

            let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
            format!(
                "{}data:{mime};base64,{encoded}{}",
                &captures[1], &captures[3]
            )
        })
        .into_owned()
}

pub fn render_html(request: &ExportRequest) -> String {
    let mut options = comrak::Options::default();
    options.extension.table = true;
    options.extension.strikethrough = true;
    options.extension.tasklist = true;
    options.extension.autolink = true;
    options.extension.footnotes = true;
    options.render.github_pre_lang = true;

    let body = comrak::markdown_to_html(&request.content, &options);
    let body = if request.embed_images {
        embed_images(&body, &source_directory(request.source_path.as_deref()))
    } else {
        body
    };

    format!(
        "<!doctype html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>{}</title>\n<style>{}</style>\n</head>\n<body>\n{}</body>\n</html>\n",
        escape_html(&request.title),
        HTML_CSS,
        body
    )
}

fn command_works(binary: &str, argument: &str) -> bool {
    Command::new(binary)
        .arg(argument)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn find_pandoc(configured: &str) -> Option<String> {
    if !configured.trim().is_empty() && command_works(configured, "--version") {
        return Some(configured.to_string());
    }
    if command_works("pandoc", "--version") {
        return Some("pandoc".to_string());
    }
    None
}

fn find_chromium(configured: &str) -> Option<String> {
    if !configured.trim().is_empty() && command_works(configured, "--version") {
        return Some(configured.to_string());
    }
    for candidate in [
        "chromium",
        "chromium-browser",
        "google-chrome",
        "google-chrome-stable",
        "chrome",
    ] {
        if command_works(candidate, "--version") {
            return Some(candidate.to_string());
        }
    }
    None
}

fn write_file_atomic(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    store::write_bytes_atomic(path, bytes)
}

fn run_pandoc(
    pandoc: &str,
    format: &str,
    request: &ExportRequest,
    output: &Path,
) -> Result<String, AppError> {
    let base = source_directory(request.source_path.as_deref());
    let temporary = tempfile::tempdir()?;
    let input = temporary.path().join("documento.md");
    fs::write(&input, &request.content)?;

    let target = match format {
        "docx" => "docx",
        "epub" => "epub3",
        "odt" => "odt",
        "latex" => "latex",
        "html" => "html5",
        "pdf" => "pdf",
        _ => {
            return Err(AppError::new(
                "unsupported_format",
                format!("Formato no soportado con Pandoc: {format}"),
            ))
        }
    };

    let mut command = Command::new(pandoc);
    command
        .arg(&input)
        .arg("--from=gfm+tex_math_dollars")
        .arg("--output")
        .arg(output)
        .arg(format!("--resource-path={}", base.display()))
        .arg(format!("--metadata=title:{}", request.title));

    if target != "pdf" {
        command.arg(format!("--to={target}"));
    }

    if format == "latex" || format == "epub" {
        command.arg("--standalone");
    }
    if format == "pdf" {
        command.arg("--pdf-engine=xelatex");
    }

    let result = command.output()?;
    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        let message: String = stderr.chars().take(800).collect();
        return Err(AppError::new(
            "pandoc_failed",
            format!("Pandoc falló: {message}"),
        ));
    }

    Ok(if format == "pdf" {
        "pandoc+xelatex".to_string()
    } else {
        "pandoc".to_string()
    })
}

fn print_pdf(
    request: &ExportRequest,
    settings: &ExportSettings,
    output: &Path,
) -> Result<String, AppError> {
    let prefer_pandoc = settings.pdf_engine == "pandoc";

    if !prefer_pandoc {
        if let Some(chromium) = find_chromium(&settings.chromium_path) {
            let html = render_html(request);
            let temporary = tempfile::tempdir()?;
            let html_path = temporary.path().join("documento.html");
            let profile = temporary.path().join("profile");
            fs::write(&html_path, html)?;

            let result = Command::new(chromium)
                .arg("--headless=new")
                .arg("--disable-gpu")
                .arg("--no-pdf-header-footer")
                .arg("--virtual-time-budget=2000")
                .arg(format!("--user-data-dir={}", profile.display()))
                .arg(format!("--print-to-pdf={}", output.display()))
                .arg(format!(
                    "file://{}",
                    html_path.to_string_lossy().replace(' ', "%20")
                ))
                .output()?;

            if result.status.success() && output.exists() {
                return Ok("chromium".to_string());
            }
        }
    }

    if let Some(pandoc) = find_pandoc(&settings.pandoc_path) {
        return run_pandoc(&pandoc, "pdf", request, output);
    }

    Err(AppError::new(
        "pdf_engine_missing",
        "No se encontró Chromium ni Pandoc para generar el PDF",
    ))
}

pub fn export(
    request: &ExportRequest,
    settings: &ExportSettings,
) -> Result<ExportResult, AppError> {
    let format = request.format.to_ascii_lowercase();
    if format_extension(&format).is_none() {
        return Err(AppError::new(
            "unsupported_format",
            format!("Formato no soportado: {}", request.format),
        ));
    }

    let output = PathBuf::from(&request.output_path);
    if !output.is_absolute() {
        return Err(AppError::new(
            "invalid_path",
            "La ruta de salida debe ser absoluta",
        ));
    }
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }

    let engine = match format.as_str() {
        "md" | "markdown" => {
            write_file_atomic(&output, request.content.as_bytes())?;
            "builtin".to_string()
        }
        "html" => {
            write_file_atomic(&output, render_html(request).as_bytes())?;
            "builtin".to_string()
        }
        "pdf" => print_pdf(request, settings, &output)?,
        "docx" | "epub" | "odt" | "latex" => {
            let pandoc = find_pandoc(&settings.pandoc_path).ok_or_else(|| {
                AppError::new(
                    "pandoc_missing",
                    "Pandoc no está instalado o no se encontró en la ruta configurada",
                )
            })?;
            run_pandoc(&pandoc, &format, request, &output)?
        }
        _ => unreachable!(),
    };

    let size = fs::metadata(&output).map(|meta| meta.len()).unwrap_or(0);

    Ok(ExportResult {
        path: output.to_string_lossy().into_owned(),
        format,
        engine,
        size,
    })
}

#[tauri::command]
pub fn export_document(app: AppHandle, request: ExportRequest) -> Result<ExportResult, AppError> {
    let settings_path = store::config_dir(&app)?.join("settings.json");
    let settings = store::read_json::<Settings>(&settings_path)?
        .unwrap_or_default()
        .normalized();

    export(
        &request,
        &ExportSettings {
            pandoc_path: settings.pandoc_path,
            chromium_path: settings.chromium_path,
            pdf_engine: settings.pdf_engine,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(content: &str, format: &str, output: PathBuf) -> ExportRequest {
        ExportRequest {
            source_path: None,
            output_path: output.to_string_lossy().into_owned(),
            format: format.to_string(),
            content: content.to_string(),
            title: "Prueba".to_string(),
            embed_images: true,
        }
    }

    #[test]
    fn renders_gfm_html() {
        let result = render_html(&ExportRequest {
            source_path: None,
            output_path: "/tmp/x.html".to_string(),
            format: "html".to_string(),
            content: "# Título\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- [x] hecha\n".to_string(),
            title: "Doc".to_string(),
            embed_images: false,
        });

        assert!(result.contains("<h1>Título</h1>"));
        assert!(result.contains("<table>"));
        assert!(result.contains("type=\"checkbox\""));
    }

    #[test]
    fn embeds_relative_images() {
        let directory = tempfile::tempdir().expect("tempdir");
        fs::write(directory.path().join("pixel.png"), [0x89u8, 0x50]).expect("imagen");

        let html = "<p><img src=\"pixel.png\" alt=\"\"></p>";
        let embedded = embed_images(html, directory.path());

        assert!(embedded.contains("data:image/png;base64,"));
    }

    #[test]
    fn exports_markdown_directly() {
        let directory = tempfile::tempdir().expect("tempdir");
        let output = directory.path().join("salida.md");
        let result = export(
            &request("# Hola\n", "md", output.clone()),
            &ExportSettings::default(),
        )
        .expect("exportar");

        assert_eq!(result.engine, "builtin");
        assert_eq!(fs::read_to_string(output).expect("leer"), "# Hola\n");
    }

    #[test]
    fn rejects_relative_output() {
        let mut export_request = request("x", "html", PathBuf::from("relativa.html"));
        export_request.output_path = "relativa.html".to_string();
        assert_eq!(
            export(&export_request, &ExportSettings::default())
                .expect_err("relativa")
                .code,
            "invalid_path"
        );
    }

    #[test]
    fn exports_docx_when_pandoc_is_available() {
        if find_pandoc("").is_none() {
            return;
        }

        let directory = tempfile::tempdir().expect("tempdir");
        let output = directory.path().join("salida.docx");
        let result = export(
            &request("# Hola\n\nTexto **fuerte**.\n", "docx", output.clone()),
            &ExportSettings::default(),
        )
        .expect("exportar docx");

        assert_eq!(result.engine, "pandoc");
        assert!(fs::metadata(output)
            .map(|meta| meta.len() > 0)
            .unwrap_or(false));
    }

    #[test]
    fn maps_extensions() {
        assert_eq!(format_extension("latex"), Some("tex"));
        assert_eq!(format_extension("markdown"), Some("md"));
        assert_eq!(format_extension("exe"), None);
    }
}
