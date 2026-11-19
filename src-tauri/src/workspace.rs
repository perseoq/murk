// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;

const SKIP_DIRECTORIES: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "target",
    "dist",
    ".cache",
    ".venv",
    "venv",
];

const TEXT_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "mdwn", "txt"];
const MAX_ENTRIES: usize = 2000;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const DEFAULT_MAX_RESULTS: usize = 200;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub hidden: bool,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchOptions {
    pub case_sensitive: bool,
    pub max_results: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub name: String,
    pub line: u32,
    pub column: u32,
    pub preview: String,
}

fn absolute_directory(path: &Path) -> Result<(), AppError> {
    if !path.is_absolute() {
        return Err(AppError::new("invalid_path", "La ruta debe ser absoluta"));
    }
    if !path.is_dir() {
        return Err(AppError::new(
            "not_a_directory",
            "La ruta no es un directorio",
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn dir_list(path: String) -> Result<Vec<DirEntry>, AppError> {
    let path = PathBuf::from(path);
    absolute_directory(&path)?;

    let mut entries = Vec::new();
    for entry in fs::read_dir(&path)?.flatten().take(MAX_ENTRIES) {
        let entry_path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        let name = entry.file_name().to_string_lossy().into_owned();
        let hidden = name.starts_with('.');
        let is_dir = file_type.is_dir();

        entries.push(DirEntry {
            name,
            path: entry_path.to_string_lossy().into_owned(),
            is_dir,
            hidden,
        });
    }

    entries.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(entries)
}

fn is_text_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .is_some_and(|extension| TEXT_EXTENSIONS.contains(&extension.as_str()))
}

fn collect_files(directory: &Path, files: &mut Vec<PathBuf>, depth: usize) {
    if depth > 32 {
        return;
    }

    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || SKIP_DIRECTORIES.contains(&name.as_str()) {
                continue;
            }
            collect_files(&path, files, depth + 1);
            continue;
        }

        if file_type.is_file() && is_text_file(&path) {
            files.push(path);
        }
    }
}

#[tauri::command]
pub fn search_workspace(
    root: String,
    query: String,
    options: SearchOptions,
) -> Result<Vec<SearchHit>, AppError> {
    let root_path = PathBuf::from(root);
    absolute_directory(&root_path)?;

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let limit = if options.max_results == 0 {
        DEFAULT_MAX_RESULTS
    } else {
        options.max_results.min(1000)
    };
    let needle = if options.case_sensitive {
        query.clone()
    } else {
        query.to_lowercase()
    };

    let mut files = Vec::new();
    collect_files(&root_path, &mut files, 0);
    files.sort();

    let mut hits = Vec::new();

    for path in files {
        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        if metadata.len() > MAX_FILE_BYTES {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };

        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("documento")
            .to_string();

        for (index, line) in content.lines().enumerate() {
            let haystack = if options.case_sensitive {
                line.to_string()
            } else {
                line.to_lowercase()
            };

            let Some(byte) = haystack.find(&needle) else {
                continue;
            };

            let column = haystack[..byte].encode_utf16().count() as u32;
            let preview: String = line.trim().chars().take(160).collect();

            hits.push(SearchHit {
                path: path.to_string_lossy().into_owned(),
                name: name.clone(),
                line: (index + 1) as u32,
                column,
                preview,
            });

            if hits.len() >= limit {
                break;
            }
        }

        if hits.len() >= limit {
            break;
        }
    }

    hits.sort_by(|left, right| {
        left.path
            .cmp(&right.path)
            .then_with(|| left.line.cmp(&right.line))
    });

    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_directories_first_and_sorted() {
        let directory = tempfile::tempdir().expect("tempdir");
        fs::create_dir(directory.path().join("zeta")).expect("dir");
        fs::write(directory.path().join("b.md"), "b").expect("file");
        fs::write(directory.path().join("a.md"), "a").expect("file");

        let entries = dir_list(directory.path().to_string_lossy().into_owned()).expect("listar");
        let names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();

        assert_eq!(names, vec!["zeta", "a.md", "b.md"]);
        assert!(entries[0].is_dir);
    }

    #[test]
    fn searches_text_files_with_and_without_case() {
        let directory = tempfile::tempdir().expect("tempdir");
        let nested = directory.path().join("notas");
        fs::create_dir(&nested).expect("dir");
        fs::write(nested.join("a.md"), "Hola mundo\nhola otra vez\n").expect("file");
        fs::write(nested.join("imagen.png"), [0x89u8, 0x50]).expect("file");

        let insensitive = search_workspace(
            directory.path().to_string_lossy().into_owned(),
            "hola".to_string(),
            SearchOptions::default(),
        )
        .expect("buscar");
        assert_eq!(insensitive.len(), 2);
        assert_eq!(insensitive[0].line, 1);

        let sensitive = search_workspace(
            directory.path().to_string_lossy().into_owned(),
            "hola".to_string(),
            SearchOptions {
                case_sensitive: true,
                max_results: 10,
            },
        )
        .expect("buscar");
        assert_eq!(sensitive.len(), 1);
        assert_eq!(sensitive[0].line, 2);
    }

    #[test]
    fn skips_ignored_directories() {
        let directory = tempfile::tempdir().expect("tempdir");
        fs::create_dir(directory.path().join(".git")).expect("dir");
        fs::write(directory.path().join(".git").join("config.md"), "hola").expect("file");
        fs::write(directory.path().join("nota.md"), "hola").expect("file");

        let hits = search_workspace(
            directory.path().to_string_lossy().into_owned(),
            "hola".to_string(),
            SearchOptions::default(),
        )
        .expect("buscar");

        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn rejects_relative_roots() {
        assert_eq!(
            search_workspace(
                "relativa".to_string(),
                "x".to_string(),
                SearchOptions::default()
            )
            .expect_err("relativa")
            .code,
            "invalid_path"
        );
    }
}
