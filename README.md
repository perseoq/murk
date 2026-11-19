# Murk

Editor de Markdown de escritorio con **paridad funcional con Typora** (referencia: Typora 1.14.9 para Linux).

- **Stack:** Tauri v2 + Rust + CodeMirror 6 + TypeScript
- **Plataforma objetivo:** Linux x86_64 (Fedora primero), con arquitectura portable a Windows/macOS
- **Licencia:** GNU General Public License v3.0 o posterior (`GPL-3.0-or-later`)
- **Estado:** fase **A1 completada** (shell con pestañas, menús, sesión y guardado). Siguiente: A2 Núcleo de archivos.

> Murk es un proyecto independiente. No está afiliado, patrocinado ni respaldado por Typora ni por Abner Lee. No contiene código, temas, iconos, tipografías ni documentación de Typora.

## Qué significa “100% similar”

La meta es **paridad de comportamiento observable**: que un usuario de Typora encuentre las mismas funciones, flujos, atajos y resultados. No significa copiar el producto.

| Sí | No |
|---|---|
| Misma UX y mismos flujos | Copiar `app.asar`, `lib.asar` o bytecode |
| Mismos formatos de archivo | Copiar CSS, temas, iconos o `Docs/*.md` |
| Mismos atajos y menús | Usar el nombre o logo “Typora” |
| Misma semántica Markdown/GFM | Redistribuir binarios parcheados |

Ver `specs/matriz-paridad-typora.md` para la matriz completa y `docs/01-legal-licencia.md` para las reglas.

## Documentación

| Ruta | Contenido |
|---|---|
| `docs/00-vision-alcance.md` | Visión, personas, alcance, métricas |
| `docs/01-legal-licencia.md` | GPLv3, clean-room, política de assets |
| `docs/02-arquitectura.md` | Arquitectura, módulos, IPC, seguridad |
| `docs/03-modelo-datos.md` | Entidades, estado, rutas, persistencia |
| `docs/04-ui-ux-preferencias.md` | Layout, menús, preferencias |
| `docs/05-editor-live-preview.md` | Núcleo CM6 y preview en vivo |
| `docs/06-markdown-gfm.md` | Dialecto Markdown soportado |
| `docs/07-tablas.md` | Edición de tablas GFM |
| `docs/08-matematicas-diagramas.md` | KaTeX y Mermaid |
| `docs/09-imagenes.md` | Inserción, rutas, exportación |
| `docs/10-archivos-workspace.md` | Pestañas, árbol, watcher, encoding |
| `docs/11-autosave-recuperacion.md` | Autoguardado, snapshots, recuperación |
| `docs/12-exportacion.md` | HTML, PDF, DOCX, EPUB, LaTeX |
| `docs/13-temas-css.md` | Sistema de temas y CSS de impresión |
| `docs/14-atajos-spellcheck-ime.md` | Atajos, corrector, IME |
| `docs/15-busqueda-reemplazo.md` | Búsqueda local y global |
| `docs/16-cli-integracion-so.md` | CLI, MIME, `.desktop`, protocolo |
| `docs/17-rendimiento.md` | Presupuestos y estrategias |
| `docs/18-seguridad-privacidad.md` | Modelo de amenazas y CSP |
| `docs/19-accesibilidad-i18n.md` | WCAG, teclado, traducciones |
| `docs/20-empaquetado-actualizaciones.md` | deb/rpm/AppImage, updater |
| `docs/21-testing-qa.md` | Estrategia de pruebas |
| `docs/22-hitos-riesgos.md` | Plan por hitos y riesgos |
| `docs/23-glosario.md` | Términos |

Flujos en Mermaid: `flows/` · Diagramas: `diagrams/` · Contratos y criterios: `specs/` · Decisiones: `adr/`.

## Desarrollo

Requisitos en Fedora:

```bash
sudo dnf install webkit2gtk4.1-devel gtk3-devel librsvg2-devel \
  openssl-devel libayatana-appindicator-gtk3-devel libxdo-devel patchelf
```

Interfaz y escritorio:

```bash
npm install
npm run dev          # solo interfaz en el navegador
npm run tauri dev    # aplicación de escritorio
npm run tauri build  # paquetes (deb/rpm/AppImage)
```

Calidad:

```bash
npm run lint
npm run format:check
npm run build
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

CI ejecuta frontend y Rust en cada push a `main` (`.github/workflows/ci.yml`).

## Licencia

Murk se distribuye bajo **GPL-3.0-or-later**. El texto completo está en `LICENSE.md`. Cada archivo fuente debe llevar:

```text
SPDX-License-Identifier: GPL-3.0-or-later
Copyright (C) 2026 Murk contributors
```

Las dependencias externas y sus licencias están en `NOTICE.md`.
