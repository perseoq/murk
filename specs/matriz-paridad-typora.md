# Matriz de paridad con Typora

Referencia funcional: **Typora 1.14.9 (Linux)**. La columna *Estado* se actualiza al implementar.

Leyenda: **P0** imprescindible · **P1** paridad 1.0 · **P2** posterior · Estado: `spec` · `wip` · `done`.

## Archivo y sesión

| # | Función | Prioridad | Release | Estado |
|---|---|---|---|---|
| F01 | Nuevo documento sin título | P0 | 0.1 | spec |
| F02 | Abrir archivo (diálogo, recientes, drag & drop) | P0 | 0.1 | spec |
| F03 | Abrir carpeta / workspace | P0 | 0.2 | spec |
| F04 | Guardar / Guardar como / Guardar todo | P0 | 0.1 | spec |
| F05 | Pestañas (preview, fijar, reordenar, cerrar) | P0 | 0.1 | spec |
| F06 | Restaurar sesión (rutas, cursor, scroll, ventana) | P0 | 0.2 | spec |
| F07 | Múltiples ventanas | P1 | 0.9 | spec |
| F08 | Autoguardado configurable | P1 | 0.4 | spec |
| F09 | Recuperación tras cierre anómalo | P1 | 0.4 | spec |
| F10 | Historial local / versiones | P1 | 0.9 | spec |
| F11 | Detección de cambios externos y conflicto | P1 | 0.4 | spec |
| F12 | Encoding y EOL preservados | P0 | 0.1 | spec |
| F13 | Archivos grandes (degradación) | P1 | 0.9 | spec |
| F14 | Imprimir | P2 | 1.1 | spec |

## Edición

| # | Función | Prioridad | Release | Estado |
|---|---|---|---|---|
| E01 | Deshacer / rehacer con agrupación | P0 | 0.1 | spec |
| E02 | Cortar/copiar/pegar + pegar texto plano | P0 | 0.1 | spec |
| E03 | Buscar / reemplazar (literal, palabra, regex) | P0 | 0.2 | spec |
| E04 | Buscar en archivos (workspace) | P1 | 0.3 | spec |
| E05 | Quick Open de archivos | P1 | 0.9 | spec |
| E06 | Corrector ortográfico multi-idioma | P1 | 0.9 | spec |
| E07 | Autocompletado de enlaces, fences y emoji | P1 | 0.9 | spec |
| E08 | Copiar como Markdown / HTML | P2 | 1.1 | spec |
| E09 | Autopar de símbolos | P1 | 0.2 | spec |
| E10 | Puntuación inteligente | P1 | 0.2 | spec |
| E11 | Soporte IME (ibus/fcitx5) | P0 | 0.1 | spec |
| E12 | Selección múltiple (`Alt+clic`) | P2 | 1.1 | spec |

## Párrafo y formato

| # | Función | Prioridad | Release | Estado |
|---|---|---|---|---|
| P01 | Títulos H1–H6 / párrafo | P0 | 0.1 | spec |
| P02 | Énfasis, fuerte, tachado, resaltado | P0 | 0.1 | spec |
| P03 | Código en línea | P0 | 0.1 | spec |
| P04 | Enlaces (inline, referencia, autolinks) | P0 | 0.1 | spec |
| P05 | Imágenes | P0 | 0.3 | spec |
| P06 | Citas (anidadas) | P0 | 0.2 | spec |
| P07 | Listas con viñetas y numeradas | P0 | 0.2 | spec |
| P08 | Listas de tareas con checkbox | P0 | 0.3 | spec |
| P09 | Bloques de código con resaltado | P0 | 0.2 | spec |
| P10 | Tablas GFM editables | P0 | 0.3 | spec |
| P11 | Línea horizontal | P0 | 0.2 | spec |
| P12 | Índice `[TOC]` | P1 | 0.9 | spec |
| P13 | Footnotes | P1 | 0.9 | spec |
| P14 | Frontmatter (YAML/TOML/JSON) | P1 | 0.3 | spec |
| P15 | Subíndice / superíndice | P2 | 1.1 | spec |
| P16 | HTML inline/bloque saneado | P1 | 0.3 | spec |
| P17 | Limpiar formato | P1 | 0.9 | spec |

## Matemáticas y diagramas

| # | Función | Prioridad | Release | Estado |
|---|---|---|---|---|
| M01 | Fórmula inline `$…$` | P0 | 0.3 | spec |
| M02 | Fórmula en bloque `$$…$$` | P0 | 0.3 | spec |
| M03 | Macros y numeración | P2 | 1.1 | spec |
| M04 | Mermaid: flowchart, sequence, class, state, ER | P0 | 0.3 | spec |
| M05 | Mermaid: gantt, pie, journey, gitGraph, mindmap, timeline | P1 | 0.9 | spec |
| M06 | flowchart.js (`flow`) y `sequence` | P2 | 1.1 | spec |
| M07 | Error de diagrama no rompe el documento | P0 | 0.3 | spec |

## Vistas y UI

| # | Función | Prioridad | Release | Estado |
|---|---|---|---|---|
| V01 | Preview en vivo en una superficie | P0 | 0.2 | spec |
| V02 | Modo fuente | P0 | 0.2 | spec |
| V03 | Sidebar: archivos, esquema, búsqueda | P0 | 0.3 | spec |
| V04 | Barra de estado (palabras, encoding, EOL, modo) | P1 | 0.4 | spec |
| V05 | Modo enfoque | P1 | 0.9 | spec |
| V06 | Modo máquina de escribir | P1 | 0.9 | spec |
| V07 | Zoom, pantalla completa | P1 | 0.9 | spec |
| V08 | Menús completos (Archivo…Ayuda) | P0 | 0.1 | spec |
| V09 | Preferencias con búsqueda | P0 | 0.2 | spec |
| V10 | Tema claro/oscuro/sistema | P0 | 0.2 | spec |
| V11 | Temas de usuario CSS + recarga | P1 | 0.9 | spec |
| V12 | Atajos configurables | P1 | 0.9 | spec |
| V13 | i18n (es/en; luego pt/fr/de) | P2 | 1.0 | spec |
| V14 | Accesibilidad teclado/WCAG AA | P1 | 0.9 | spec |
| V15 | Bienvenida y primer arranque | P1 | 0.2 | spec |

## Exportación

| # | Función | Prioridad | Release | Estado |
|---|---|---|---|---|
| X01 | HTML con estilos | P0 | 0.4 | spec |
| X02 | HTML sin estilos | P1 | 0.4 | spec |
| X03 | PDF por Chromium | P0 | 0.4 | spec |
| X04 | PDF por Pandoc/LaTeX | P1 | 0.4 | spec |
| X05 | DOCX | P0 | 0.4 | spec |
| X06 | EPUB | P1 | 0.4 | spec |
| X07 | ODT | P2 | 1.1 | spec |
| X08 | LaTeX | P1 | 0.4 | spec |
| X09 | Exportación por lotes | P2 | 1.1 | spec |
| X10 | Exportación por CLI | P1 | 0.4 | spec |
| X11 | Opciones de página/márgenes/TOC | P1 | 0.4 | spec |

## Integración

| # | Función | Prioridad | Release | Estado |
|---|---|---|---|---|
| I01 | CLI `murk archivo.md` | P1 | 0.4 | spec |
| I02 | Instancia única | P1 | 0.4 | spec |
| I03 | `.desktop` y asociaciones MIME | P1 | 0.4 | spec |
| I04 | Protocolo `murk://` | P2 | 1.1 | spec |
| I05 | Integración Git (rama, `--wait`) | P2 | 1.1 | spec |
| I06 | Paquetes deb/rpm/AppImage | P0 | 0.9 | spec |
| I07 | Actualizaciones firmadas | P1 | 1.0 | spec |

## Seguridad y calidad

| # | Función | Prioridad | Release | Estado |
|---|---|---|---|---|
| S01 | Offline por defecto, sin telemetría | P0 | 0.1 | spec |
| S02 | Saneado de HTML/SVG/Mermaid | P0 | 0.3 | spec |
| S03 | Escritura atómica y backups | P0 | 0.1 | spec |
| S04 | CSP y capabilities mínimas | P0 | 0.1 | spec |
| S05 | Logs sin contenido de documentos | P1 | 0.4 | spec |
| S06 | Corpus golden + E2E | P0 | 0.2 | spec |

## Resumen

| Prioridad | Total | Objetivo |
|---|---|---|
| P0 | 41 | antes de 0.9 |
| P1 | 37 | antes de 1.0 |
| P2 | 11 | post-1.0 |

> Al cerrar cada fila: cambiar `spec → wip → done`, enlazar PR y prueba.
