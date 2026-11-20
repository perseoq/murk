// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
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

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocxRunStyle {
    #[serde(default)]
    pub family: Option<String>,
    #[serde(default)]
    pub bold: Option<bool>,
    #[serde(default)]
    pub italic: Option<bool>,
    #[serde(default)]
    pub heavier: Option<bool>,
    #[serde(default)]
    pub highlight: Option<bool>,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListStyleDescriptor {
    #[serde(default)]
    pub marker: Option<String>,
    #[serde(default)]
    pub bullet: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub source_path: Option<String>,
    pub output_path: String,
    pub format: String,
    pub content: String,
    pub title: String,
    #[serde(default)]
    pub embed_images: bool,
    #[serde(default)]
    pub styles_css: String,
    #[serde(default)]
    pub lists_css: String,
    #[serde(default)]
    pub list_styles: Vec<ListStyleDescriptor>,
    #[serde(default)]
    pub pandoc_content: Option<String>,
    #[serde(default)]
    pub docx_styles: std::collections::HashMap<String, DocxRunStyle>,
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

/// Quita un bloque YAML inicial del documento antes de exportarlo.
fn strip_frontmatter(content: &str) -> &str {
    let content = content.strip_prefix('\u{feff}').unwrap_or(content);
    let mut offset = 0usize;
    let mut first = true;
    for line in content.split_inclusive('\n') {
        let text = line.trim_end_matches(['\n', '\r']);
        if first {
            if text.trim() != "---" {
                return content;
            }
            first = false;
        } else if text.trim() == "---" {
            let rest = &content[offset + line.len()..];
            return rest.strip_prefix('\n').unwrap_or(rest);
        }
        offset += line.len();
    }
    content
}

fn tag_lists(html: &str, styles: &[ListStyleDescriptor]) -> String {
    if styles.is_empty() {
        return html.to_string();
    }

    let mut insertions: Vec<(usize, String)> = Vec::new();
    let mut index = 0;
    let mut position = 0;

    while let Some(found) = html[position..].find('<') {
        let start = position + found;
        let rest = &html[start..];
        let is_list = rest.starts_with("<ul") || rest.starts_with("<ol");
        if !is_list {
            position = start + 1;
            continue;
        }
        match rest.as_bytes().get(3) {
            Some(b'>') | Some(b' ') | Some(b'\t') | Some(b'\n') => {}
            _ => {
                position = start + 1;
                continue;
            }
        }
        let Some(end) = rest.find('>').map(|offset| start + offset) else {
            break;
        };

        if let Some(style) = styles.get(index) {
            if style.marker.is_some() || style.bullet.is_some() {
                let open_tag = &html[start..end];
                let class = format!("murk-list-{index}");
                if let Some(class_position) = open_tag.find("class=\"") {
                    insertions.push((
                        start + class_position + "class=\"".len(),
                        format!("{class} "),
                    ));
                } else {
                    insertions.push((start + 3, format!(" class=\"{class}\"")));
                }
            }
        }

        index += 1;
        position = end + 1;
    }

    let mut output = html.to_string();
    for (at, text) in insertions.iter().rev() {
        output.insert_str(*at, text);
    }
    output
}

pub fn render_html(request: &ExportRequest) -> String {
    let mut options = comrak::Options::default();
    options.extension.table = true;
    options.extension.strikethrough = true;
    options.extension.tasklist = true;
    options.extension.autolink = true;
    options.extension.footnotes = true;
    options.render.github_pre_lang = true;

    let body = comrak::markdown_to_html(strip_frontmatter(&request.content), &options);
    let body = tag_lists(&body, &request.list_styles);
    let body = if request.embed_images {
        embed_images(&body, &source_directory(request.source_path.as_deref()))
    } else {
        body
    };

    format!(
        "<!doctype html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>{}</title>\n<style>{}\n{}\n{}</style>\n</head>\n<body>\n{}</body>\n</html>\n",
        escape_html(&request.title),
        HTML_CSS,
        request.styles_css,
        request.lists_css,
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

fn word_style_ids(target: &str) -> &'static [&'static str] {
    match target {
        "body" => &["Normal", "BodyText", "FirstParagraph"],
        "h1" => &["Heading1"],
        "h2" => &["Heading2"],
        "h3" => &["Heading3"],
        "h4" => &["Heading4"],
        "h5" => &["Heading5"],
        "h6" => &["Heading6"],
        "code" => &["VerbatimChar", "SourceCode"],
        "quote" => &["BlockText"],
        "tableHeader" => &["Table", "Compact"],
        "link" => &["Hyperlink"],
        _ => &[],
    }
}

fn run_properties(style: &DocxRunStyle) -> String {
    let mut properties = String::new();

    if let Some(family) = &style.family {
        let first = family
            .split(',')
            .next()
            .unwrap_or(family)
            .trim()
            .trim_matches('\'')
            .trim_matches('"');
        if !first.is_empty() {
            let escaped = escape_html(first);
            properties.push_str(&format!(
                "<w:rFonts w:ascii=\"{escaped}\" w:hAnsi=\"{escaped}\"/>"
            ));
        }
    }
    if style.bold.unwrap_or(false) || style.heavier.unwrap_or(false) {
        properties.push_str("<w:b/>");
    }
    if style.italic.unwrap_or(false) {
        properties.push_str("<w:i/>");
    }
    if let Some(color) = &style.color {
        let value = color.trim_start_matches('#');
        if value.len() == 6 && value.chars().all(|character| character.is_ascii_hexdigit()) {
            properties.push_str(&format!("<w:color w:val=\"{}\"/>", value.to_uppercase()));
        }
    }
    if style.highlight.unwrap_or(false) {
        properties.push_str("<w:highlight w:val=\"yellow\"/>");
    }

    properties
}

fn remove_xml_tag(block: &str, tag: &str) -> String {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut output = String::with_capacity(block.len());
    let mut rest = block;

    loop {
        let Some(start) = rest.find(&open) else {
            output.push_str(rest);
            break;
        };
        output.push_str(&rest[..start]);
        let after = &rest[start..];
        let Some(gt) = after.find('>') else {
            break;
        };
        if after[..gt].ends_with('/') {
            rest = &after[gt + 1..];
        } else if let Some(close_start) = after.find(&close) {
            rest = &after[close_start + close.len()..];
        } else {
            rest = &after[gt + 1..];
        }
    }

    output
}

fn patch_style(xml: &mut String, style_id: &str, properties: &str) {
    if properties.is_empty() {
        return;
    }
    let needle = format!("w:styleId=\"{style_id}\"");
    let Some(attribute) = xml.find(&needle) else {
        return;
    };
    let Some(open) = xml[..attribute].rfind("<w:style") else {
        return;
    };
    let Some(close) = xml[open..].find("</w:style>").map(|offset| open + offset) else {
        return;
    };
    let block = &xml[open..close];

    let updated = if let Some(rpr_open) = block.find("<w:rPr>") {
        let inner_start = rpr_open + "<w:rPr>".len();
        let inner_end = block[inner_start..]
            .find("</w:rPr>")
            .map(|offset| inner_start + offset)
            .unwrap_or(inner_start);
        let mut inner = block[inner_start..inner_end].to_string();
        for tag in ["w:rFonts", "w:b", "w:i", "w:color", "w:highlight"] {
            inner = remove_xml_tag(&inner, tag);
        }
        format!(
            "{}<w:rPr>{}{}</w:rPr>{}",
            &block[..rpr_open],
            inner,
            properties,
            &block[inner_end + "</w:rPr>".len()..]
        )
    } else {
        format!("{block}<w:rPr>{properties}</w:rPr>")
    };

    xml.replace_range(open..close, &updated);
}

fn apply_docx_styles(path: &Path, styles: &HashMap<String, DocxRunStyle>) -> Result<(), AppError> {
    if styles.is_empty() {
        return Ok(());
    }

    let file = fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| AppError::new("docx_styles", format!("DOCX inválido: {error}")))?;
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let temporary = parent.join(format!(".murk-docx-{}.docx", std::process::id()));
    let output = fs::File::create(&temporary)?;
    let mut writer = zip::ZipWriter::new(output);

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| AppError::new("docx_styles", format!("DOCX ilegible: {error}")))?;
        let name = entry
            .name()
            .map_err(|error| AppError::new("docx_styles", format!("DOCX ilegible: {error}")))?
            .to_string();
        let options =
            zip::write::SimpleFileOptions::default().compression_method(entry.compression());
        writer.start_file(name.clone(), options).map_err(|error| {
            AppError::new("docx_styles", format!("DOCX no escribible: {error}"))
        })?;

        let mut buffer = Vec::new();
        entry.read_to_end(&mut buffer)?;
        if name == "word/styles.xml" {
            let mut xml = String::from_utf8_lossy(&buffer).into_owned();
            for (target, style) in styles {
                let properties = run_properties(style);
                for id in word_style_ids(target) {
                    patch_style(&mut xml, id, &properties);
                }
            }
            writer.write_all(xml.as_bytes())?;
        } else {
            writer.write_all(&buffer)?;
        }
    }

    writer
        .finish()
        .map_err(|error| AppError::new("docx_styles", format!("DOCX no cerrable: {error}")))?;
    fs::rename(&temporary, path)?;
    Ok(())
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
    let pandoc_source = request
        .pandoc_content
        .as_deref()
        .unwrap_or(&request.content);
    fs::write(&input, strip_frontmatter(pandoc_source))?;

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
        .arg("--from=gfm+tex_math_dollars+fancy_lists")
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
            let engine = run_pandoc(&pandoc, &format, request, &output)?;
            if format == "docx" {
                apply_docx_styles(&output, &request.docx_styles)?;
            }
            engine
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
            ..ExportRequest::default()
        }
    }

    #[test]
    fn strips_yaml_frontmatter_from_exports() {
        let content = "---\ntitle: Doc\nmurk:\n  tableWidths:\n    '0':\n      - 120\n      - 180\n---\n\n# Título\n";
        assert_eq!(strip_frontmatter(content), "# Título\n");
        assert_eq!(strip_frontmatter("# Sin metadatos\n"), "# Sin metadatos\n");
        assert_eq!(strip_frontmatter("---\nsin cierre\n"), "---\nsin cierre\n");

        let html = render_html(&ExportRequest {
            source_path: None,
            output_path: "/tmp/x.html".to_string(),
            format: "html".to_string(),
            content: content.to_string(),
            title: "Doc".to_string(),
            embed_images: false,
            ..ExportRequest::default()
        });
        assert!(html.contains("<h1>Título</h1>"));
        assert!(!html.contains("tableWidths"));
    }

    #[test]
    fn tags_styled_lists_and_injects_css() {
        let html = render_html(&ExportRequest {
            content: "- uno\n- dos\n\n1. a\n2. b\n".to_string(),
            title: "Listas".to_string(),
            styles_css: "h1 { color: #ff0000 }".to_string(),
            lists_css: "ul.murk-list-0 { list-style: none }".to_string(),
            list_styles: vec![
                ListStyleDescriptor {
                    bullet: Some("arrow".to_string()),
                    marker: None,
                },
                ListStyleDescriptor {
                    bullet: None,
                    marker: Some("upper-roman".to_string()),
                },
            ],
            ..ExportRequest::default()
        });

        assert!(html.contains("<ul class=\"murk-list-0\""));
        assert!(html.contains("<ol class=\"murk-list-1\""));
        assert!(html.contains("h1 { color: #ff0000 }"));
        assert!(html.contains("ul.murk-list-0 { list-style: none }"));
    }

    #[test]
    fn applies_docx_styles_to_word_styles() {
        if find_pandoc("").is_none() {
            return;
        }

        let directory = tempfile::tempdir().expect("tempdir");
        let output = directory.path().join("estilos.docx");
        let mut docx_styles = HashMap::new();
        docx_styles.insert(
            "h1".to_string(),
            DocxRunStyle {
                family: Some("Georgia, serif".to_string()),
                bold: Some(true),
                color: Some("#ff0000".to_string()),
                ..DocxRunStyle::default()
            },
        );

        let mut export_request = request("# Título\n", "docx", output.clone());
        export_request.docx_styles = docx_styles;
        export(&export_request, &ExportSettings::default()).expect("docx");

        let file = fs::File::open(&output).expect("docx");
        let mut archive = zip::ZipArchive::new(file).expect("zip");
        let mut xml = String::new();
        archive
            .by_name("word/styles.xml")
            .expect("styles.xml")
            .read_to_string(&mut xml)
            .expect("leer styles.xml");

        assert!(xml.contains("w:rFonts w:ascii=\"Georgia\""));
        assert!(xml.contains("w:color w:val=\"FF0000\""));
        assert!(xml.contains("<w:b/>"));
    }

    #[test]
    fn exports_docx_with_custom_ordered_markers() {
        if find_pandoc("").is_none() {
            return;
        }

        let directory = tempfile::tempdir().expect("tempdir");
        let output = directory.path().join("listas.docx");
        let mut export_request = request("1. uno\n2. dos\n", "docx", output.clone());
        export_request.pandoc_content = Some("A) uno\nB) dos\n".to_string());
        export(&export_request, &ExportSettings::default()).expect("docx");

        let file = fs::File::open(&output).expect("docx");
        let mut archive = zip::ZipArchive::new(file).expect("zip");
        let mut xml = String::new();
        archive
            .by_name("word/document.xml")
            .expect("document.xml")
            .read_to_string(&mut xml)
            .expect("leer document.xml");

        assert!(xml.contains("uno"));
        assert!(xml.contains("dos"));
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
            ..ExportRequest::default()
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
