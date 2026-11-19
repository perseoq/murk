# QA de release 1.0.0

Fecha: 2026-11-19.

## Automatizado (CI)

| Comprobación | Estado |
|---|---|
| Frontend: lint | ✅ |
| Frontend: formato | ✅ |
| Frontend: build Vite | ✅ |
| Frontend: 69 tests | ✅ |
| Rust: `cargo fmt --check` | ✅ |
| Rust: `cargo clippy --all-targets -D warnings` | ✅ |
| Rust: 36 tests (incluye DOCX con Pandoc) | ✅ |
| Exportación HTML/DOCX en CI | ✅ |
| Paquetes deb/rpm/AppImage | ⏳ workflow de release |
| Firma de updater | ⏳ requiere secretos del repositorio |

## Manual pendiente (requiere escritorio)

Estas comprobaciones no pueden ejecutarse en el entorno del agente por falta de
headers de WebKitGTK y de sesión gráfica; deben hacerse antes de publicar el
release:

- [ ] Instalar el `.rpm` en Fedora limpia y abrir un `.md` desde el gestor.
- [ ] Instalar el `.deb` en Ubuntu y comprobar MIME/`.desktop`.
- [ ] Ejecutar la AppImage con `chmod +x` en una sesión Wayland.
- [ ] Abrir un segundo archivo desde la terminal con Murk abierto (instancia única).
- [ ] IME ibus/fcitx5: español, japonés y chino.
- [ ] Pegar imágenes y comprobar rutas relativas.
- [ ] Exportar PDF con Chromium y con Pandoc.
- [ ] Exportar DOCX/EPUB y abrir en LibreOffice/Calibre.
- [ ] Matar el proceso durante la edición y verificar recuperación.
- [ ] Actualización desde una versión anterior firmada.
- [ ] Zoom 200 %, lector de pantalla y navegación solo con teclado.

## Criterios de salida

1. CI verde en `main` y en el tag.
2. Release draft con `.deb`, `.rpm`, AppImage, `.sig` y `latest.json`.
3. Hash/firma verificados.
4. Instalación y desinstalación limpias.
5. Sin pérdida de datos en el corpus de archivos.

## Limitaciones aceptadas para 1.0

Ver `specs/estado-a11.md` (i18n, multiventana, HTML inline, redimensionado de
imágenes, importador de temas, exportación por lotes, flowchart.js y atajos
globales personalizables). Se documentan como backlog post-1.0.
