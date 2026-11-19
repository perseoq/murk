# 10 — Archivos, pestañas y workspace

## 1. Abrir

| Entrada | Comportamiento |
|---|---|
| `Ctrl+O` | Diálogo de archivo (filtro Markdown + todos) |
| Árbol | Un clic: pestaña preview; doble clic: fija |
| CLI | `murk archivo.md` (ver 16) |
| Drag & drop | Sobre ventana o editor |
| Recientes | Menú Archivo → Abrir reciente (máx. 20) |
| Carpeta | `Ctrl+Shift+O`; establece raíz del workspace |

- Máximo 50 pestañas con aviso.
- Si el archivo no es UTF-8, se detecta encoding (ver §4).
- Archivos binarios o > 20 MB: se abre vista de solo lectura con aviso.
- Archivo inexistente: aviso y opción de crearlo.

## 2. Guardar

| Acción | Regla |
|---|---|
| `Ctrl+S` | Guarda si hay ruta; si no, Guardar como |
| `Ctrl+Shift+S` | Guardar como |
| `Ctrl+Alt+S` | Guardar todo |
| Cerrar pestaña sucia | Diálogo Guardar/Descartar/Cancelar |
| Salir con sucias | Diálogo con “Guardar todo” |

Escritura atómica: temporal en el mismo directorio → `fsync` → `rename`; se preservan permisos y propietario cuando sea posible. Si falla, el original no se toca.

## 3. Detección de cambios externos

- El watcher observa el archivo abierto y su directorio.
- Al cambiar el `mtime`/tamaño sin guardado de Murk:
  - Si no hay cambios locales → recarga silenciosa (conservando cursor si es posible).
  - Si hay cambios locales → diálogo: **Recargar** (pierde lo local), **Mantener** (se sobrescribirá al guardar), **Comparar**.
- Borrado externo: pestaña marcada como huérfana; guardar recrea el archivo previa confirmación.

## 4. Encoding y EOL

1. Detectar BOM (UTF-8, UTF-16 LE/BE).
2. Detectar heurísticamente UTF-8 válido.
3. Si no, `chardetng` + lista de codificaciones comunes (GB18030, Big5, Shift_JIS, Windows-1252, ISO-8859-1).
4. Mostrar encoding en la barra de estado; el usuario puede cambiarlo y guardar en UTF-8.
5. EOL: detectar predominante; conservar al guardar. Nunca mezclar sin aviso.
6. NUL bytes → binario; no editable.

## 5. Árbol de archivos

- Raíz = carpeta abierta; se recuerda en sesión.
- Muestra directorios y archivos; orden: carpetas primero, alfabético (natural).
- Oculta `.git`, `node_modules`, `*.tmp` por defecto; configurable.
- Actualización incremental por eventos del watcher; debounce 150 ms.
- Operaciones: nuevo archivo/carpeta, renombrar (`F2`), eliminar a papelera (confirmación), revelar, copiar ruta, abrir en terminal (P1).
- Renombrar un archivo abierto actualiza la pestaña y las rutas de imágenes relativas si el usuario lo acepta.

## 6. Sesión

Se guarda al cerrar y cada 30 s:

- rutas abiertas, pestaña activa, cursor, scroll, modo;
- raíz del workspace, ancho del sidebar, vista activa;
- tamaño/posición/maximizado de la ventana.

Al arrancar:

1. Si hay sesión y `restoreSession=true`, se reabren los archivos existentes.
2. Los que ya no existen se omiten con aviso discreto.
3. Si hubo cierre anómalo, se ofrece recuperar snapshots (ver 11).

## 7. Archivos grandes

| Tamaño | Comportamiento |
|---|---|
| < 1 MB | Normal |
| 1–5 MB | Aviso discreto; widgets activos |
| 5–20 MB | Widgets desactivados; resaltado simplificado |
| > 20 MB | Solo lectura + modo fuente; ofrecer abrir externo |

## 8. Casos borde

| Caso | Comportamiento |
|---|---|
| Sin permisos de escritura | Solo lectura; “Guardar como” disponible |
| Enlace simbólico | Se resuelve; se avisa si apunta fuera del workspace |
| Archivo en red lenta | Timeout 10 s con reintento |
| Nombre con caracteres inválidos | Error del sistema mostrado tal cual |
| Dos ventanas, mismo archivo | Watcher + aviso de conflicto |
| Disco lleno | Error claro; el original permanece intacto |
| Cambio de mayúsculas en nombre | Renombrado en dos pasos (case-insensitive) |

## 9. Criterios de aceptación

1. `Ctrl+S` nunca pierde contenido aunque falle el disco.
2. El watcher detecta cambios en < 500 ms.
3. Abrir/cerrar 20 pestañas no deja watchers huérfanos.
4. Un CRLF se conserva tras cualquier número de guardados.
5. El archivo no se reescribe si no hubo cambios (mtime intacto).
6. La sesión se restaura tras reinicio normal y tras crash.
