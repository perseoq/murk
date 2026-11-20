// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

//! Configuración de repositorio git y publicación de documentos.
//!
//! La configuración vive en `~/.murk/config.json`. Los documentos se copian a
//! un clon local en `~/.murk/repos/<nombre-del-repo>` y desde ahí se hace
//! commit y `git push origin <rama>`.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::store;

const CONFIG_VERSION: u32 = 1;
const VALID_STRATEGIES: [&str; 3] = ["merge", "rebase", "none"];

/// Configuración del repositorio remoto.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RepositoryConfig {
    /// URL del remoto (`https://…`, `ssh://…` o `git@host:repo.git`).
    pub url: String,
    /// Rama de destino.
    pub branch: String,
    /// Ruta relativa dentro del repositorio donde se copian los documentos.
    pub path: String,
    /// Cómo integrar cambios remotos antes de push: `merge`, `rebase` o `none`.
    pub strategy: String,
    /// Ejecutar `git pull` antes del push.
    pub pull_before_push: bool,
    /// Crear la rama si no existe en el remoto.
    pub create_branch: bool,
    /// Hacer commit y push automáticos tras el autoguardado.
    pub auto_push: bool,
}

impl Default for RepositoryConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            branch: "main".to_string(),
            path: String::new(),
            strategy: "merge".to_string(),
            pull_before_push: true,
            create_branch: false,
            auto_push: false,
        }
    }
}

impl RepositoryConfig {
    /// Normaliza los valores para que el archivo de configuración sea estable.
    pub fn normalized(mut self) -> Self {
        self.url = self.url.trim().to_string();
        self.branch = self.branch.trim().to_string();
        if self.branch.is_empty() {
            self.branch = "main".to_string();
        }
        if !VALID_STRATEGIES.contains(&self.strategy.as_str()) {
            self.strategy = "merge".to_string();
        }
        self.path = normalize_relative(&self.path).unwrap_or_default();
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct ConfigFile {
    version: u32,
    repository: RepositoryConfig,
}

impl Default for ConfigFile {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            repository: RepositoryConfig::default(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRequest {
    pub source_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResult {
    pub branch: String,
    pub remote_url: String,
    pub commit: Option<String>,
    pub files: Vec<String>,
}

fn home_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    app.path()
        .home_dir()
        .map_err(|error| AppError::new("home_dir", error.to_string()))
}

fn config_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(home_dir(app)?.join(".murk").join("config.json"))
}

fn repos_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(home_dir(app)?.join(".murk").join("repos"))
}

fn load_config(app: &AppHandle) -> Result<RepositoryConfig, AppError> {
    let file = store::read_json::<ConfigFile>(&config_path(app)?)?.unwrap_or_default();
    Ok(file.repository.normalized())
}

/// Devuelve la configuración actual; si no existe, los valores por defecto.
#[tauri::command]
pub fn repository_config_load(app: AppHandle) -> Result<RepositoryConfig, AppError> {
    load_config(&app)
}

/// Guarda la configuración en `~/.murk/config.json`.
#[tauri::command]
pub fn repository_config_save(
    app: AppHandle,
    config: RepositoryConfig,
) -> Result<RepositoryConfig, AppError> {
    let config = config.normalized();
    if !config.url.is_empty() {
        validate_url(&config.url)?;
    }
    validate_branch(&config.branch)?;
    if !config.path.is_empty() {
        validate_relative(&config.path)?;
    }

    store::write_json_atomic(
        &config_path(&app)?,
        &ConfigFile {
            version: CONFIG_VERSION,
            repository: config.clone(),
        },
    )?;
    Ok(config)
}

/// Copia los documentos al clon local, hace commit y ejecuta el push.
#[tauri::command]
pub fn repository_push(app: AppHandle, request: PushRequest) -> Result<PushResult, AppError> {
    let config = load_config(&app)?;
    if config.url.is_empty() {
        return Err(AppError::new(
            "not_configured",
            "Configura la URL del repositorio en Archivo → Repositorio…",
        ));
    }
    validate_url(&config.url)?;
    validate_branch(&config.branch)?;

    let mut sources: Vec<PathBuf> = Vec::new();
    for raw in request.source_paths {
        let path = PathBuf::from(raw);
        if !path.is_absolute() || !path.is_file() {
            return Err(AppError::new(
                "invalid_path",
                format!(
                    "El documento no existe o no es absoluto: {}",
                    path.display()
                ),
            ));
        }
        if !sources.contains(&path) {
            sources.push(path);
        }
    }
    if sources.is_empty() {
        return Err(AppError::new(
            "no_documents",
            "No hay documentos guardados para publicar",
        ));
    }

    let workdir = repos_dir(&app)?.join(repo_dir_name(&config.url));
    publish(&config, &workdir, &sources)
}

fn publish(
    config: &RepositoryConfig,
    workdir: &Path,
    sources: &[PathBuf],
) -> Result<PushResult, AppError> {
    ensure_clone(&config.url, workdir)?;
    git(workdir, &["remote", "set-url", "origin", &config.url])?;
    // Un remoto recién creado puede no tener ramas; el fallo no es fatal.
    let _ = run_git(workdir, &["fetch", "origin", "--prune"]);
    checkout_branch(workdir, &config.branch, config.create_branch)?;

    let has_remote_branch = git_ok(
        workdir,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/remotes/origin/{}", config.branch),
        ],
    );
    if config.pull_before_push && config.strategy != "none" && has_remote_branch {
        let remote = format!("origin/{}", config.branch);
        if config.strategy == "rebase" {
            git(workdir, &["pull", "--rebase", "origin", &remote])?;
        } else {
            git(workdir, &["pull", "--no-rebase", "origin", &remote])?;
        }
    }

    let sub_path = if config.path.is_empty() {
        None
    } else {
        Some(validate_relative(&config.path)?)
    };

    let mut files: Vec<String> = Vec::new();
    let mut all_new = true;

    for source in sources {
        let file_name = source.file_name().ok_or_else(|| {
            AppError::new("invalid_path", "El documento no tiene nombre de archivo")
        })?;
        let destination_dir = match &sub_path {
            Some(relative) => workdir.join(relative),
            None => workdir.to_path_buf(),
        };
        fs::create_dir_all(&destination_dir)?;
        let destination = destination_dir.join(file_name);
        let relative = relative_posix(workdir, &destination)?;

        let tracked = git_ok(
            workdir,
            &["ls-files", "--error-unmatch", "--", relative.as_str()],
        );
        all_new = all_new && !tracked;

        fs::copy(source, &destination)?;
        git(workdir, &["add", "--", relative.as_str()])?;
        files.push(relative);
    }

    let staged = !git_ok(workdir, &["diff", "--cached", "--quiet"]);
    let commit = if staged {
        let message = format!(
            "{}: {}",
            if all_new { "new" } else { "update" },
            timestamp()
        );
        git(
            workdir,
            &[
                "-c",
                "user.name=Murk",
                "-c",
                "user.email=murk@localhost",
                "commit",
                "-m",
                message.as_str(),
            ],
        )?;
        Some(message)
    } else {
        None
    };

    git(workdir, &["push", "-u", "origin", config.branch.as_str()])?;

    Ok(PushResult {
        branch: config.branch.clone(),
        remote_url: config.url.clone(),
        commit,
        files,
    })
}

fn ensure_clone(url: &str, workdir: &Path) -> Result<(), AppError> {
    if workdir.join(".git").exists() {
        return Ok(());
    }
    if workdir.exists() {
        return Err(AppError::new(
            "invalid_repo_dir",
            format!(
                "El directorio local existe pero no es un repositorio git: {}",
                workdir.display()
            ),
        ));
    }

    if let Some(parent) = workdir.parent() {
        fs::create_dir_all(parent)?;
    }

    let output = Command::new("git")
        .args(["clone", "--", url])
        .arg(workdir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|error| {
            AppError::new("git_missing", format!("No se pudo ejecutar git: {error}"))
        })?;

    if !output.status.success() {
        return Err(git_error(&output, "No se pudo clonar el repositorio"));
    }
    Ok(())
}

fn checkout_branch(dir: &Path, branch: &str, create: bool) -> Result<(), AppError> {
    if git_ok(
        dir,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ],
    ) {
        return git(dir, &["checkout", branch]).map(|_| ());
    }

    let remote_ref = format!("refs/remotes/origin/{branch}");
    if git_ok(dir, &["rev-parse", "--verify", "--quiet", &remote_ref]) {
        let start = format!("origin/{branch}");
        return git(dir, &["checkout", "-B", branch, &start]).map(|_| ());
    }

    let empty_repo = !git_ok(dir, &["rev-parse", "--verify", "HEAD"]);
    if create || empty_repo {
        git(dir, &["checkout", "-B", branch])?;
        return Ok(());
    }

    Err(AppError::new(
        "branch_missing",
        format!("La rama «{branch}» no existe en el remoto. Activa «Crear rama si no existe»."),
    ))
}

fn relative_posix(base: &Path, path: &Path) -> Result<String, AppError> {
    let relative = path
        .strip_prefix(base)
        .map_err(|_| AppError::new("invalid_path", "La ruta queda fuera del repositorio"))?;
    let mut parts: Vec<String> = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(value) => parts.push(value.to_string_lossy().into_owned()),
            _ => {
                return Err(AppError::new(
                    "invalid_path",
                    "Ruta de repositorio inválida",
                ))
            }
        }
    }
    Ok(parts.join("/"))
}

fn run_git(dir: &Path, args: &[&str]) -> Result<Output, AppError> {
    Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|error| AppError::new("git_missing", format!("No se pudo ejecutar git: {error}")))
}

fn git(dir: &Path, args: &[&str]) -> Result<String, AppError> {
    let output = run_git(dir, args)?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(git_error(&output, "Git devolvió un error"))
    }
}

fn git_ok(dir: &Path, args: &[&str]) -> bool {
    matches!(run_git(dir, args), Ok(output) if output.status.success())
}

fn git_error(output: &Output, context: &str) -> AppError {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() { stderr } else { stdout };
    AppError::new("git", format!("{context}: {detail}"))
}

fn validate_url(url: &str) -> Result<(), AppError> {
    if url.trim().is_empty() {
        return Err(AppError::new(
            "invalid_url",
            "La URL del repositorio está vacía",
        ));
    }
    if url.starts_with('-') || url.chars().any(char::is_whitespace) {
        return Err(AppError::new(
            "invalid_url",
            "La URL del repositorio no es válida",
        ));
    }
    Ok(())
}

fn validate_branch(branch: &str) -> Result<(), AppError> {
    let invalid = branch.is_empty()
        || branch.starts_with('-')
        || branch.starts_with('/')
        || branch.ends_with('/')
        || branch.ends_with('.')
        || branch.contains("..")
        || branch.contains("//")
        || branch.chars().any(|character| {
            character.is_whitespace()
                || matches!(character, '~' | '^' | ':' | '?' | '*' | '[' | '\\' | '\x7f')
        });
    if invalid {
        return Err(AppError::new(
            "invalid_branch",
            format!("Nombre de rama no válido: «{branch}»"),
        ));
    }
    Ok(())
}

fn validate_relative(path: &str) -> Result<String, AppError> {
    let normalized = normalize_relative(path)
        .ok_or_else(|| AppError::new("invalid_path", format!("Ruta no válida: «{path}»")))?;
    Ok(normalized)
}

fn normalize_relative(path: &str) -> Option<String> {
    let trimmed = path.trim().trim_matches('/');
    if trimmed.is_empty() {
        return Some(String::new());
    }
    let candidate = Path::new(trimmed);
    if candidate.is_absolute() || trimmed.starts_with('-') {
        return None;
    }
    let mut parts: Vec<String> = Vec::new();
    for component in candidate.components() {
        match component {
            Component::Normal(value) => {
                let text = value.to_string_lossy();
                if text == "." {
                    continue;
                }
                parts.push(text.into_owned());
            }
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(parts.join("/"))
}

fn repo_dir_name(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    let without_git = trimmed.strip_suffix(".git").unwrap_or(trimmed);
    let last = without_git
        .rsplit(['/', ':'])
        .next()
        .unwrap_or("repo")
        .trim();
    let sanitized: String = last
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '-'
            }
        })
        .collect();
    let sanitized = sanitized.trim_matches('.').to_string();
    if sanitized.is_empty() {
        "repo".to_string()
    } else {
        sanitized
    }
}

/// Marca temporal UTC en formato ISO 8601 (`2026-11-19T18:00:00Z`).
fn timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let days = (seconds / 86_400) as i64;
    let rest = seconds % 86_400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rest / 3_600,
        (rest % 3_600) / 60,
        rest % 60
    )
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = (z - era * 146_097) as u64;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era as i64 + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_part = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_part + 2) / 5 + 1) as u32;
    let month = if month_part < 10 {
        month_part + 3
    } else {
        month_part - 9
    } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_is_sane() {
        let config = RepositoryConfig::default().normalized();
        assert_eq!(config.branch, "main");
        assert_eq!(config.strategy, "merge");
        assert!(config.pull_before_push);
        assert!(!config.auto_push);
    }

    #[test]
    fn config_normalizes_empty_values() {
        let config = RepositoryConfig {
            url: "  https://example.com/repo.git  ".to_string(),
            branch: "   ".to_string(),
            path: "/docs/notas/".to_string(),
            strategy: "squash".to_string(),
            ..RepositoryConfig::default()
        }
        .normalized();
        assert_eq!(config.url, "https://example.com/repo.git");
        assert_eq!(config.branch, "main");
        assert_eq!(config.path, "docs/notas");
        assert_eq!(config.strategy, "merge");
    }

    #[test]
    fn repo_name_comes_from_url() {
        assert_eq!(repo_dir_name("https://github.com/roy/murk.git"), "murk");
        assert_eq!(repo_dir_name("git@github.com:roy/notas.git"), "notas");
        assert_eq!(repo_dir_name("https://example.com/a/b/"), "b");
        assert_eq!(repo_dir_name("https://example.com/"), "example.com");
        assert_eq!(repo_dir_name("git@host:repo"), "repo");
    }

    #[test]
    fn branch_validation() {
        assert!(validate_branch("main").is_ok());
        assert!(validate_branch("feature/notas").is_ok());
        assert!(validate_branch("").is_err());
        assert!(validate_branch("-x").is_err());
        assert!(validate_branch("a..b").is_err());
        assert!(validate_branch("a b").is_err());
        assert!(validate_branch("a~b").is_err());
        assert!(validate_branch("/main").is_err());
    }

    #[test]
    fn relative_path_validation() {
        assert_eq!(validate_relative("docs/notas").unwrap(), "docs/notas");
        assert_eq!(validate_relative("./docs//notas/").unwrap(), "docs/notas");
        assert_eq!(validate_relative("/absoluta").unwrap(), "absoluta");
        assert!(validate_relative("../fuera").is_err());
        assert!(validate_relative("-flag").is_err());
    }

    #[test]
    fn timestamp_has_iso_shape() {
        let value = timestamp();
        assert_eq!(value.len(), 20);
        assert!(value.ends_with('Z'));
        assert_eq!(&value[4..5], "-");
        assert_eq!(&value[10..11], "T");
    }

    #[test]
    fn civil_dates_are_correct() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(10_957), (2000, 1, 1));
        assert_eq!(civil_from_days(20_000), (2024, 10, 4));
    }

    #[test]
    fn publishes_new_and_updated_files_to_bare_remote() {
        let temp = tempfile::tempdir().expect("tempdir");
        let remote = temp.path().join("remote.git");
        let status = Command::new("git")
            .args(["init", "--bare"])
            .arg(&remote)
            .status()
            .expect("git init");
        assert!(status.success());

        let source_dir = temp.path().join("src");
        fs::create_dir_all(&source_dir).expect("source dir");
        let document = source_dir.join("nota.md");
        fs::write(&document, "# Hola").expect("write document");

        let config = RepositoryConfig {
            url: format!("file://{}", remote.display()),
            branch: "main".to_string(),
            path: "docs".to_string(),
            strategy: "none".to_string(),
            pull_before_push: false,
            create_branch: true,
            auto_push: false,
        };
        let workdir = temp.path().join("clone");

        let first =
            publish(&config, &workdir, std::slice::from_ref(&document)).expect("first push");
        assert!(first
            .commit
            .as_deref()
            .unwrap_or_default()
            .starts_with("new: "));
        assert_eq!(first.files, vec!["docs/nota.md".to_string()]);

        let stored = Command::new("git")
            .arg("--git-dir")
            .arg(&remote)
            .args(["show", "main:docs/nota.md"])
            .output()
            .expect("show remote file");
        assert!(stored.status.success());
        assert_eq!(String::from_utf8_lossy(&stored.stdout).trim(), "# Hola");

        fs::write(&document, "# Hola mundo").expect("update document");
        let second = publish(&config, &workdir, &[document]).expect("second push");
        assert!(second
            .commit
            .as_deref()
            .unwrap_or_default()
            .starts_with("update: "));
    }
}
