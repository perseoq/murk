# 09 — Imágenes

## 1. Inserción

| Origen | Acción | Resultado |
|---|---|---|
| Drag & drop | Soltar archivo sobre el editor | Copia (según ajuste) o ruta relativa + `![]()` |
| Pegar | `Ctrl+V` con imagen en portapapeles | Guarda en carpeta de imágenes y inserta |
| Diálogo | `Ctrl+Shift+I` | Selector de archivo |
| URL | Pegar URL sobre selección | `![alt](url)` |
| Escribir | `![]()` manual | Se renderiza al completar |

Nombre por defecto de imágenes pegadas: `image-YYYYMMDD-HHMMSS-<hash8>.<ext>` (configurable con patrón).

## 2. Política de rutas (ajuste)

| Modo | Comportamiento |
|---|---|
| `copy` (recomendado) | Copia la imagen a `./assets/` (o carpeta configurada) y usa ruta relativa |
| `relative` | Usa ruta relativa al `.md` sin copiar |
| `absolute` | Usa ruta absoluta `file:///...` (no portable) |

- Se admiten rutas con espacios y Unicode; al insertar se codifican (`%20`).
- `../` permitido dentro del scope del documento.
- Imágenes fuera del scope: se pide confirmación y se concede permiso temporal de solo lectura.

## 3. Render

- Se resuelve contra el directorio del documento.
- Protocolo interno `murk-img://<token>/<ruta>` con token por documento (evita exponer el sistema de archivos).
- Formatos: PNG, JPEG, GIF, WebP, AVIF, SVG (saneado), BMP.
- SVG: se eliminan scripts y eventos antes de mostrar.
- Imagen ausente: placeholder con icono, ruta y botón “Buscar archivo…”.
- Lazy loading por viewport; `decode()` asíncrono.
- Tamaño: máximo natural por defecto; `width`/`height` de HTML respetados; sintaxis `![alt](x.png){width=50%}` (P2).

## 4. Copia a carpeta

Al insertar con `copy`:

1. Si la imagen ya está dentro del proyecto, no se copia.
2. Se crea la carpeta (`assets/` por defecto) si no existe.
3. Se evita sobrescribir: sufijo `-1`, `-2`.
4. Se conserva el nombre original si es único y válido.
5. Se registra en la sesión para poder deshacer la inserción (borra el archivo copiado).

## 5. Redimensionado

- Arrastrar esquinas en el widget modifica `width` en HTML (`<img width="320">`) solo si el usuario elige “guardar tamaño”.
- Por defecto, el tamaño es visual y no se persiste.
- Restablecer: menú contextual → “Tamaño original”.

## 6. Exportación

| Salida | Imágenes |
|---|---|
| HTML | `embedImages=true`: base64; si no, rutas relativas copiadas junto al HTML |
| PDF | Incrustadas siempre (base64/data URI) |
| DOCX/EPUB | Pandoc con `--embed-resources` o extracción temporal |

- Se avisa de imágenes rotas antes de exportar, con opción de continuar.
- Las imágenes remotas solo se descargan si el usuario lo autoriza explícitamente (sin red por defecto).

## 7. Casos borde

| Caso | Comportamiento |
|---|---|
| Imagen > 50 MB | Aviso; se inserta ruta sin copiar |
| Nombre duplicado | Sufijo incremental |
| Ruta con `#` o `?` | Codificación correcta |
| Imagen en carpeta de solo lectura | Error claro; se ofrece elegir otra carpeta |
| Documento sin guardar | Se pide guardar antes de copiar imágenes |
| SVG con scripts | Se sanea; se avisa en log |
| GIF animado | Se reproduce en editor y exportación HTML/PDF |

## 8. Criterios de aceptación

1. Pegar una captura inserta la imagen y el archivo existe en disco.
2. Mover el `.md` junto con `assets/` mantiene las imágenes visibles.
3. El HTML exportado abre las imágenes sin depender del `.md`.
4. Una imagen borrada muestra placeholder y no rompe el layout.
5. Insertar dos veces la misma imagen no sobrescribe archivos.
6. El documento original no se modifica al renderizar.
