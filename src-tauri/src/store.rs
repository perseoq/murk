// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use encoding_rs::Encoding;
use serde::de::DeserializeOwned;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::AppError;

/// Límite absoluto de apertura (por encima se rechaza).
pub const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;
/// Por encima de este tamaño el documento se abre en solo lectura.
pub const MAX_EDITABLE_SIZE: u64 = 20 * 1024 * 1024;
pub const MAX_RECENT: usize = 20;

const BOM_UTF8: &[u8] = &[0xEF, 0xBB, 0xBF];
const BOM_UTF16LE: &[u8] = &[0xFF, 0xFE];
const BOM_UTF16BE: &[u8] = &[0xFE, 0xFF];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedText {
    pub content: String,
    pub encoding: String,
    pub bom: bool,
    pub eol: String,
    pub fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncodedText {
    pub bytes: Vec<u8>,
    pub encoding: String,
    pub bom: bool,
}

pub fn config_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let base = app
        .path()
        .config_dir()
        .map_err(|error| AppError::new("config_dir", error.to_string()))?;
    Ok(base.join("murk"))
}

pub fn modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn fingerprint(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

pub fn fingerprint_file(path: &Path) -> Result<String, AppError> {
    let mut hasher = blake3::Hasher::new();
    let mut file = fs::File::open(path)?;
    std::io::copy(&mut file, &mut hasher)?;
    Ok(hasher.finalize().to_hex().to_string())
}

/// Comprueba que el archivo en disco no cambió desde que se abrió.
pub fn check_fingerprint(path: &Path, expected: Option<&str>) -> Result<(), AppError> {
    let Some(expected) = expected else {
        return Ok(());
    };

    match fingerprint_file(path) {
        Ok(current) if current == expected => Ok(()),
        Ok(_) => Err(AppError::new(
            "conflict",
            "El archivo cambió en disco desde que se abrió",
        )),
        Err(error) if error.code == "io" => {
            // Si ya no existe, se permite recrearlo.
            if !path.exists() {
                Ok(())
            } else {
                Err(error)
            }
        }
        Err(error) => Err(error),
    }
}

pub fn read_bytes(path: &Path) -> Result<(Vec<u8>, u64, u64), AppError> {
    if !path.is_absolute() {
        return Err(AppError::new("invalid_path", "La ruta debe ser absoluta"));
    }

    let metadata = fs::metadata(path)?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(AppError::new(
            "too_large",
            "El archivo supera el límite de 50 MB",
        ));
    }

    let bytes = fs::read(path)?;
    Ok((bytes, metadata.len(), modified_ms(&metadata)))
}

fn decode_utf16(bytes: &[u8], little_endian: bool) -> Result<String, AppError> {
    if bytes.len() % 2 != 0 {
        return Err(AppError::new(
            "unsupported_encoding",
            "El archivo UTF-16 tiene un número impar de bytes",
        ));
    }

    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| {
            if little_endian {
                u16::from_le_bytes([pair[0], pair[1]])
            } else {
                u16::from_be_bytes([pair[0], pair[1]])
            }
        })
        .collect();

    String::from_utf16(&units).map_err(|_| {
        AppError::new(
            "unsupported_encoding",
            "El archivo UTF-16 contiene secuencias inválidas",
        )
    })
}

pub fn decode(bytes: &[u8]) -> Result<DecodedText, AppError> {
    let (content, encoding, bom) = if let Some(rest) = bytes.strip_prefix(BOM_UTF8) {
        let text = std::str::from_utf8(rest).map_err(|_| {
            AppError::new(
                "unsupported_encoding",
                "El archivo UTF-8 contiene bytes inválidos",
            )
        })?;
        (text.to_string(), "utf-8".to_string(), true)
    } else if let Some(rest) = bytes.strip_prefix(BOM_UTF16LE) {
        (decode_utf16(rest, true)?, "utf-16le".to_string(), true)
    } else if let Some(rest) = bytes.strip_prefix(BOM_UTF16BE) {
        (decode_utf16(rest, false)?, "utf-16be".to_string(), true)
    } else if bytes.contains(&0) {
        return Err(AppError::new(
            "unsupported_encoding",
            "El archivo parece binario o UTF-16 sin BOM",
        ));
    } else if let Ok(text) = std::str::from_utf8(bytes) {
        (text.to_string(), "utf-8".to_string(), false)
    } else {
        let mut detector = chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Allow);
        detector.feed(bytes, true);
        let encoding = detector.guess(None, chardetng::Utf8Detection::Allow);
        let (text, _, had_errors) = encoding.decode(bytes);

        if had_errors {
            return Err(AppError::new(
                "unsupported_encoding",
                "No se pudo decodificar el archivo con una codificación conocida",
            ));
        }

        (
            text.into_owned(),
            encoding.name().to_ascii_lowercase(),
            false,
        )
    };

    let eol = detect_eol(&content).to_string();

    Ok(DecodedText {
        content,
        encoding,
        bom,
        eol,
        fingerprint: fingerprint(bytes),
    })
}

fn encode_utf16(content: &str, little_endian: bool) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(2 + content.len() * 2);
    if little_endian {
        bytes.extend_from_slice(BOM_UTF16LE);
    } else {
        bytes.extend_from_slice(BOM_UTF16BE);
    }

    for unit in content.encode_utf16() {
        if little_endian {
            bytes.extend_from_slice(&unit.to_le_bytes());
        } else {
            bytes.extend_from_slice(&unit.to_be_bytes());
        }
    }

    bytes
}

pub fn encode(content: &str, encoding: &str, bom: bool) -> Result<EncodedText, AppError> {
    let normalized = encoding.trim().to_ascii_lowercase();

    match normalized.as_str() {
        "utf-16le" | "utf16le" => Ok(EncodedText {
            bytes: encode_utf16(content, true),
            encoding: "utf-16le".to_string(),
            bom: true,
        }),
        "utf-16be" | "utf16be" => Ok(EncodedText {
            bytes: encode_utf16(content, false),
            encoding: "utf-16be".to_string(),
            bom: true,
        }),
        _ => {
            let encoding = Encoding::for_label(normalized.as_bytes()).ok_or_else(|| {
                AppError::new(
                    "unsupported_encoding",
                    format!("Codificación no soportada: {encoding}"),
                )
            })?;

            let (bytes, _, had_errors) = encoding.encode(content);
            if had_errors {
                return Err(AppError::new(
                    "encoding",
                    "El texto contiene caracteres que no se pueden representar en esa codificación",
                ));
            }

            let mut output = Vec::with_capacity(bytes.len() + 3);
            let is_utf8 = encoding == encoding_rs::UTF_8;
            if bom && is_utf8 {
                output.extend_from_slice(BOM_UTF8);
            }
            output.extend_from_slice(&bytes);

            Ok(EncodedText {
                bytes: output,
                encoding: encoding.name().to_ascii_lowercase(),
                bom: bom && is_utf8,
            })
        }
    }
}

pub fn detect_eol(text: &str) -> &'static str {
    let crlf = text.matches("\r\n").count();
    let cr = text.matches('\r').count() - crlf;
    let lf = text.matches('\n').count() - crlf;

    if crlf == 0 && cr == 0 {
        "lf"
    } else if crlf >= lf && crlf >= cr {
        "crlf"
    } else if cr >= lf {
        "cr"
    } else {
        "lf"
    }
}

pub fn convert_eol(text: &str, eol: &str) -> String {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    match eol {
        "crlf" => normalized.replace('\n', "\r\n"),
        "cr" => normalized.replace('\n', "\r"),
        _ => normalized,
    }
}

pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, AppError> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map(Some).map_err(|error| {
            AppError::new(
                "invalid_json",
                format!("No se pudo leer {}: {error}", path.display()),
            )
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(AppError::from(error)),
    }
}

pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), AppError> {
    let data = serde_json::to_vec_pretty(value)
        .map_err(|error| AppError::new("serialize", error.to_string()))?;
    write_bytes_atomic(path, &data)
}

pub fn write_bytes_atomic(path: &Path, data: &[u8]) -> Result<(), AppError> {
    if !path.is_absolute() {
        return Err(AppError::new("invalid_path", "La ruta debe ser absoluta"));
    }

    let parent = path
        .parent()
        .ok_or_else(|| AppError::new("invalid_path", "La ruta no tiene directorio padre"))?;
    fs::create_dir_all(parent)?;

    let previous_permissions = fs::metadata(path).ok().map(|meta| meta.permissions());
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    temporary.write_all(data)?;
    temporary.as_file().sync_all()?;
    temporary
        .persist(path)
        .map_err(|error| AppError::new("io", error.to_string()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = previous_permissions
            .as_ref()
            .map(PermissionsExt::mode)
            .unwrap_or(0o644);
        fs::set_permissions(path, fs::Permissions::from_mode(mode))?;
    }

    #[cfg(not(unix))]
    if let Some(permissions) = previous_permissions {
        fs::set_permissions(path, permissions)?;
    }

    Ok(())
}

pub fn push_recent(mut list: Vec<String>, path: String) -> Vec<String> {
    list.retain(|item| item != &path);
    list.insert(0, path);
    list.truncate(MAX_RECENT);
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_utf16(content: &str, little: bool) -> Vec<u8> {
        encode_utf16(content, little)
    }

    #[test]
    fn decodes_utf8_with_and_without_bom() {
        let plain = "Hola ñandú 🦀\n".as_bytes();
        let decoded = decode(plain).expect("utf-8");
        assert_eq!(decoded.encoding, "utf-8");
        assert!(!decoded.bom);
        assert_eq!(decoded.content, "Hola ñandú 🦀\n");
        assert_eq!(decoded.eol, "lf");

        let mut with_bom = BOM_UTF8.to_vec();
        with_bom.extend_from_slice(plain);
        let decoded = decode(&with_bom).expect("utf-8 bom");
        assert!(decoded.bom);
        assert_eq!(decoded.content, "Hola ñandú 🦀\n");
    }

    #[test]
    fn decodes_utf16_le_and_be() {
        let content = "Hola 🦀\r\n";
        let little = decode(&sample_utf16(content, true)).expect("utf-16le");
        assert_eq!(little.encoding, "utf-16le");
        assert_eq!(little.eol, "crlf");
        assert_eq!(little.content, content);

        let big = decode(&sample_utf16(content, false)).expect("utf-16be");
        assert_eq!(big.encoding, "utf-16be");
        assert_eq!(big.content, content);
    }

    #[test]
    fn corpus_roundtrip_is_byte_identical() {
        let utf8 = "Título\nlínea 2\n".as_bytes().to_vec();
        let mut utf8_bom = BOM_UTF8.to_vec();
        utf8_bom.extend_from_slice(&utf8);
        let utf16le = sample_utf16("Título\r\nlínea 2\r\n", true);
        let utf16be = sample_utf16("Título\r\nlínea 2\r\n", false);
        // "Hola ñ\r\n" en Windows-1252 (0xF1 = ñ).
        let windows = vec![0x48, 0x6F, 0x6C, 0x61, 0x20, 0xF1, 0x0D, 0x0A];

        for original in [utf8, utf8_bom, utf16le, utf16be, windows] {
            let decoded = decode(&original).expect("decodificar");
            let encoded =
                encode(&decoded.content, &decoded.encoding, decoded.bom).expect("codificar");
            assert_eq!(encoded.bytes, original, "encoding {}", decoded.encoding);
        }
    }

    #[test]
    fn detects_and_converts_eol() {
        assert_eq!(detect_eol("a\nb\n"), "lf");
        assert_eq!(detect_eol("a\r\nb\r\n"), "crlf");
        assert_eq!(detect_eol("a\rb\r"), "cr");
        assert_eq!(detect_eol("sin saltos"), "lf");

        assert_eq!(convert_eol("a\r\nb\nc", "lf"), "a\nb\nc");
        assert_eq!(convert_eol("a\r\nb\nc", "crlf"), "a\r\nb\r\nc");
        assert_eq!(convert_eol("a\r\nb\nc", "cr"), "a\rb\rc");
    }

    #[test]
    fn rejects_binary_and_relative_paths() {
        let binary = vec![0x89, 0x50, 0x4E, 0x47, 0x00, 0x00];
        assert_eq!(
            decode(&binary).expect_err("binario").code,
            "unsupported_encoding"
        );
        assert_eq!(
            read_bytes(Path::new("relativa.md"))
                .expect_err("relativa")
                .code,
            "invalid_path"
        );
    }

    #[test]
    fn detects_external_conflicts() {
        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("nota.md");

        write_bytes_atomic(&path, b"primera").expect("guardar");
        let original = fingerprint_file(&path).expect("fingerprint");

        check_fingerprint(&path, Some(&original)).expect("sin cambios");

        write_bytes_atomic(&path, b"segunda").expect("modificar");
        assert_eq!(
            check_fingerprint(&path, Some(&original))
                .expect_err("conflicto")
                .code,
            "conflict"
        );

        assert!(check_fingerprint(&path, None).is_ok());
    }

    #[test]
    fn reencoding_utf16_preserves_bytes() {
        let original = sample_utf16("ñ 🦀\r\n", true);
        let decoded = decode(&original).expect("decodificar");
        let encoded = encode(&decoded.content, "utf-16le", true).expect("codificar");
        assert_eq!(encoded.bytes, original);
    }

    #[test]
    fn recent_list_dedupes_and_caps() {
        let mut list = Vec::new();
        list = push_recent(list, "/a.md".to_string());
        list = push_recent(list, "/b.md".to_string());
        list = push_recent(list, "/a.md".to_string());

        assert_eq!(list, vec!["/a.md".to_string(), "/b.md".to_string()]);

        for index in 0..30 {
            list = push_recent(list, format!("/{index}.md"));
        }
        assert_eq!(list.len(), MAX_RECENT);
        assert_eq!(list[0], "/29.md");
    }

    #[test]
    fn json_roundtrip_and_missing_file() {
        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("settings.json");

        assert!(read_json::<serde_json::Value>(&path)
            .expect("leer")
            .is_none());

        let value = serde_json::json!({ "tema": "oscuro", "n": 4 });
        write_json_atomic(&path, &value).expect("guardar");

        let read: serde_json::Value = read_json(&path).expect("leer").expect("existe");
        assert_eq!(read, value);
    }

    #[cfg(unix)]
    #[test]
    fn overwrite_keeps_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let directory = tempfile::tempdir().expect("tempdir");
        let path = directory.path().join("nota.md");
        write_bytes_atomic(&path, b"a").expect("guardar");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).expect("permisos");

        write_bytes_atomic(&path, b"b").expect("sobrescribir");

        let mode = fs::metadata(&path).expect("metadata").permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }
}
