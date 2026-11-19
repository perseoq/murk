# 06 — Markdown y GFM

## 1. Dialecto

Murk implementa **CommonMark 0.31.2 + GitHub Flavored Markdown** con extensiones de Typora. El parser es Lezer Markdown en modo incremental; el documento en disco es siempre Markdown estándar.

| Sintaxis | Soporte | Notas |
|---|---|---|
| Párrafos, saltos | P0 | `hardBreaks` configurable |
| ATX / Setext headings | P0 | H1–H6 |
| Énfasis / fuerte | P0 | `*` y `_`, anidados |
| Tachado `~~x~~` | P0 | GFM |
| Resaltado `==x==` | P0 | Extensión |
| Código en línea | P0 | Backticks múltiples |
| Bloques cercados | P0 | ``` y ~~~, info string |
| Indented code | P0 | 4 espacios |
| Listas | P0 | Anidadas, laxas/estrictas, inicio arbitrario |
| Tareas `- [ ]` | P0 | Checkbox interactivo |
| Citas | P0 | Anidadas, perezosas |
| Enlaces inline/reference | P0 | Título opcional |
| Autolinks `<url>` y GFM | P0 | `www.`, correos |
| Imágenes | P0 | Ver 09 |
| Línea horizontal | P0 | `---`, `***`, `___` |
| Tablas GFM | P0 | Ver 07 |
| Escapes | P0 | `\*`, entidades HTML |
| HTML inline/bloque | P0 | Saneado, ver §5 |
| Footnotes `[^1]` | P0 | Typora |
| Frontmatter YAML/TOML/JSON | P0 | Plegado, no interpretado |
| Sub/superíndice `~x~` `^x^` | P1 | Extensión |
| Definición de términos | P2 | — |
| Emoji `:smile:` | P1 | Autocompletado |
| TOC `[TOC]` | P0 | Generado, no persistido |
| Matemáticas `$…$`, `$$…$$` | P0 | Ver 08 |
| Mermaid en fence | P0 | Ver 08 |

## 2. Reglas de interpretación

1. Se respeta el texto original: no se normalizan tablas, listas ni énfasis al abrir.
2. Los bloques de código nunca se procesan como Markdown.
3. Un fence con info string `mermaid` se renderiza como diagrama; el resto, como código.
4. Los encabezados generan IDs para anclas: minúsculas, sin acentos, guiones, deduplicados (`-1`, `-2`).
5. Los enlaces relativos se resuelven contra el directorio del documento.
6. Los enlaces externos se abren en el navegador con confirmación opcional; `mailto:` en el cliente.
7. `Ctrl+clic` sobre un enlace interno abre el archivo/destino en Murk.
8. Los saltos de línea simples no crean `<br>` salvo `hardBreaks`.
9. Se preservan los espacios finales (salvo ajuste explícito al guardar).

## 3. Frontmatter

```markdown
---
title: Documento
author: Roy
tags: [notas, md]
---
```

- Se detecta solo en la primera línea (`---` o `+++`).
- Se muestra plegado como “Metadatos (n)” con tabla clave/valor.
- Se usa en exportación (título, autor, fecha, idioma).
- Nunca se interpreta como contenido del cuerpo.

## 4. TOC y anclas

- `[TOC]` en su propia línea inserta un índice generado a partir de H1–H6.
- El índice no se escribe en el documento: es un widget.
- Clic en entrada desplaza a la sección.
- Anclas compatibles con GFM (`#mi-titulo`).

## 5. HTML

- Se permite HTML inline y de bloque, pero se **sanea** al renderizar (sin `<script>`, `on*`, `iframe`, `object`, `embed`).
- `<style>` permitido solo si el usuario activa “HTML de confianza” (desactivado por defecto).
- Atributos permitidos: `class`, `id`, `title`, `width`, `height`, `align`, `colspan`, `rowspan`, `href`, `src` (con protocolo validado).
- El HTML original nunca se reescribe al guardar.

## 6. Entrada y accesos

| Acción | Atajo |
|---|---|
| Negrita | `Ctrl+B` |
| Cursiva | `Ctrl+I` |
| Tachado | `Alt+Shift+5` |
| Código en línea | ``Ctrl+Shift+` `` |
| Enlace | `Ctrl+K` |
| Imagen | `Ctrl+Shift+I` |
| Título 1–6 | `Ctrl+1..6` |
| Cita | `Ctrl+Shift+Q` |
| Lista viñetas | `Ctrl+Shift+8` |
| Lista numerada | `Ctrl+Shift+7` |
| Tarea | `Ctrl+Shift+9` |
| Bloque código | `Ctrl+Shift+K` |
| Fórmula | `Ctrl+Shift+M` |
| Tabla | `Ctrl+Shift+T` |

## 7. Pegado y drag & drop

- Pegar HTML: se convierte a Markdown cuando es posible; “Pegar como texto plano” evita conversión.
- Pegar tabla desde hoja de cálculo: se convierte a tabla GFM.
- Pegar imagen: ver 09.
- Arrastrar archivo `.md` sobre el editor: lo abre; sobre la ventana: nueva pestaña.

## 8. Normalización al guardar

| Elemento | Comportamiento |
|---|---|
| Encoding | Se conserva el detectado |
| BOM | Se conserva |
| EOL | Se conserva (`LF`/`CRLF`/`CR`) |
| Espacios finales | Se conservan salvo opción activa |
| Tabs/espacios | Sin cambios |
| Saltos finales | Se garantiza exactamente un `\n` final (configurable) |

## 9. Criterios de aceptación

1. El corpus CommonMark/GFM produce el HTML esperado (pruebas golden).
2. Abrir y guardar sin cambios produce un archivo idéntico byte a byte.
3. Las tablas con pipes escapados y código en línea se interpretan correctamente.
4. `[TOC]` no aparece en el archivo exportado si el usuario elige “renderizar TOC”.
5. Un documento con frontmatter conserva el bloque exacto.
6. Los enlaces relativos funcionan al mover el documento junto con sus recursos (aviso si se rompen).
7. HTML peligroso no se ejecuta (prueba con `<script>` y `onerror`).
