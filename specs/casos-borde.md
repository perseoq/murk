# Casos borde

Registro de comportamientos límite que deben probarse explícitamente.

## Archivos

| Caso | Comportamiento esperado |
|---|---|
| Archivo vacío | Abre editor vacío; guardar conserva 0 bytes (o 1 `\n` según opción) |
| Solo BOM | Se conserva; no se interpreta como contenido |
| Mezcla LF/CRLF | Se detecta predominante; se avisa y no se normaliza sin permiso |
| NUL bytes | Se detecta binario; no editable; ofrecer abrir externo |
| UTF-16 sin BOM | Heurística; si falla, selector de encoding |
| Nombre con espacios/Unicode | Ruta codificada correctamente |
| Symlink a otro FS | Se resuelve; aviso si sale del workspace |
| Permiso de solo lectura | Modo lectura; Guardar como |
| Disco lleno | Error; original intacto; buffer conservado |
| Archivo > 20 MB | Solo lectura + modo fuente |
| Archivo borrado mientras se edita | Pestaña huérfana; guardar recrea con confirmación |
| Dos ventanas, mismo archivo | Watcher + conflicto |
| Renombrar con mayúsculas | Renombrado en dos pasos |
| Ruta > 4 096 bytes | Error claro |
| `.md` dentro de `.git` | Se abre; búsqueda global lo omite |

## Editor

| Caso | Comportamiento esperado |
|---|---|
| `$` suelto (“cuesta $5”) | No abre fórmula |
| `**` sin cerrar | Se muestra literal; no rompe decoraciones |
| Fence sin cerrar | Se extiende al final; no rompe el resaltado |
| Tabla sin separador | Se trata como párrafo |
| Pipe escapado `\|` | Se preserva |
| Emoji ZWJ | Ancho y selección correctos |
| CJK + bidi | Cursor y selección estables |
| IME + Enter | Pertenece al IME, no crea bloque |
| Deshacer tras autoguardado | Revierte la edición, no el guardado |
| Escribir durante exportación | Permitido; la exportación usa snapshot |
| Scroll con 200 imágenes | ≥ 50 fps |
| Pegar 1 MB de texto | Sin bloqueo > 200 ms |
| Selección enorme | Operaciones acotadas; sin congelar |

## Markdown

| Caso | Comportamiento esperado |
|---|---|
| HTML con `<script>` | No se ejecuta |
| SVG con `onload` | Se elimina |
| Mermaid con `click` JS | No se ejecuta |
| Enlace `javascript:` | Se neutraliza |
| Ancla duplicada | IDs `-1`, `-2` |
| Enlace relativo roto | Aviso al hacer clic |
| Frontmatter no YAML | Se muestra crudo, no se interpreta |
| Imagen remota sin red | Placeholder, sin error fatal |
| Tabla > 1 000 filas | Virtualizada |
| Documento 10 MB | Degradación avisada |

## Exportación

| Caso | Comportamiento esperado |
|---|---|
| Pandoc ausente | Mensaje + alternativa |
| Chromium ausente | Fallback LaTeX o error claro |
| Fuente no instalada | Sustitución + aviso |
| Imagen rota | Aviso previo; continuar/cancelar |
| Destino sin permisos | Error; sin temporales |
| Cancelar | Se borran temporales |
| Nombre con `/` | Se sanea |
| EPUB inválido | Falla con stderr resumido |
| PDF > 500 páginas | Progreso y timeout ampliado |

## Sistema

| Caso | Comportamiento esperado |
|---|---|
| Sin `$XDG_RUNTIME_DIR` | Socket en `~/.cache/murk/` |
| Socket obsoleto | Se elimina y arranca |
| Config corrupta | `.bak` + defaults |
| Sin config | Se crea al primer guardado |
| Reloj del sistema atrás | Snapshots ordenados por id, no por fecha |
| Wayland sin XWayland | Funciona; se avisa de limitaciones |
| Múltiples monitores | Ventana se restaura en el monitor correcto |
| Escalado 200 % | Sin recortes |
| Sistema sin notificaciones | Avisos dentro de la ventana |
