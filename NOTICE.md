# Avisos de terceros

Murk se distribuye bajo GPL-3.0-or-later. Las siguientes dependencias previstas son compatibles con esa licencia.

## Dependencias enlazadas o empaquetadas

| Componente | Licencia | Uso | Compatibilidad GPLv3 |
|---|---|---|---|
| Tauri v2 | MIT / Apache-2.0 | Shell de escritorio | Sí |
| WRY / TAO | MIT / Apache-2.0 | WebView y ventanas | Sí |
| WebKitGTK | LGPL-2.1-or-later | Motor web en Linux (enlace dinámico) | Sí |
| CodeMirror 6 | MIT | Editor | Sí |
| Lezer | MIT | Parser incremental | Sí |
| KaTeX | MIT | Matemáticas | Sí |
| Mermaid | MIT | Diagramas | Sí |
| Shiki | MIT | Resaltado de código | Sí |
| markdown-it / unified | MIT | Pipeline Markdown (si se usa) | Sí |
| Serde / tokio / notify | MIT / Apache-2.0 | Rust | Sí |
| Noto Sans / Noto Serif | OFL-1.1 | Tipografías por defecto | Sí (fuente sigue OFL) |

## Herramientas externas (procesos, no enlazadas)

| Herramienta | Licencia | Uso |
|---|---|---|
| Pandoc | GPL-2.0-or-later | Exportar DOCX/EPUB/ODT/LaTeX |
| XeLaTeX (TeX Live) | LPPL / GPL | PDF vía Pandoc |
| Chromium (sidecar opcional) | BSD-3-Clause | PDF de alta fidelidad |
| Nuspell / Hunspell | LGPL-3.0 / MPL-1.1 | Corrector ortográfico |

Invocar un programa externo no obliga a relicenciar Murk. Si se **empaqueta** un sidecar, se incluyen sus avisos y se permite su sustitución.

## Reglas

1. Toda dependencia nueva debe declararse en este archivo con su licencia.
2. No se aceptan licencias incompatibles con GPLv3 (p. ej. código propietario, SSPL, commons clause).
3. Las tipografías e iconos deben ser OFL/MIT/Apache o de creación propia.
4. Se prohíbe incluir assets de Typora.
