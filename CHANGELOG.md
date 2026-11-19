# Changelog

## 1.0.0 — 2026-11-19

Primera versión estable de Murk.

### Editor

- CodeMirror 6 con Markdown GFM, resaltado y preview en vivo.
- Encabezados, énfasis, enlaces, listas, citas, código y reglas con
  revelado de sintaxis al colocar el cursor.
- Formato inline: negrita, cursiva, tachado, código y enlaces.
- Búsqueda/reemplazo local y búsqueda global en la carpeta.

### Contenido

- Imágenes locales con caché y rutas relativas.
- KaTeX para matemáticas en línea y en bloque.
- Mermaid con DOMPurify y tema claro/oscuro.
- Checkboxes de tareas interactivos.
- Tablas GFM con widget, navegación y comandos.

### Archivos y workspace

- Pestañas, sesión restaurable, árbol de archivos, esquema y recientes.
- Codificaciones UTF-8/UTF-16/heredadas, BOM y EOL preservados.
- Watcher con detección de conflictos y diff.
- Guardado atómico y archivos grandes en solo lectura.

### Recuperación

- Snapshots ante cierres anómalos.
- Autoguardado configurable.
- Historial local con diferencias y restauración.

### Exportación

- HTML con imágenes incrustadas.
- PDF vía Chromium o Pandoc/LaTeX.
- DOCX, EPUB, ODT y LaTeX vía Pandoc.
- CLI `--export`, `--version` y `--help`.

### Integración

- Instancia única, apertura de archivos desde CLI/escritorio.
- `.desktop`, asociaciones Markdown, spellcheck nativo e IME.
- Actualizaciones firmadas con `tauri-plugin-updater`.

### Calidad

- 69 tests frontend y 36 tests Rust.
- CI con frontend, Rust, clippy, formato y exportación DOCX.
- Paquetes `.deb`, `.rpm`, AppImage y actualizador firmado.

### Limitaciones conocidas

Ver `specs/estado-a11.md`.
