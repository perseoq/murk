# 24 — Guía de usuario

## Instalación

Artefactos disponibles en GitHub Releases:

| Formato | Uso |
|---|---|
| `.deb` | Debian, Ubuntu, derivados |
| `.rpm` | Fedora, RHEL, derivados |
| `.AppImage` | Cualquier distribución; `chmod +x` y ejecutar |

También existe un `.tar.gz` portable. En Fedora:

```bash
sudo dnf install murk-1.2.1795192054.x86_64.rpm
```

La AppImage se integra sola en el menú al ejecutarla por primera vez: copia su
`.desktop` e iconos a `~/.local/share` para que GNOME muestre el icono correcto.
Si mueves el AppImage de ruta, la entrada se actualiza en el siguiente arranque
para apuntar a la ubicación nueva. Si prefieres no integrarla, ejecútala desde
una ruta temporal y borra
`~/.local/share/applications/io.github.perseoq.murk.desktop`.

Dependencias de ejecución: WebKitGTK 4.1 y GTK3 (las gestiona el paquete).
Para exportar a DOCX/EPUB/ODT/LaTeX instala `pandoc`; para PDF se recomienda
Chromium (o `texlive-xetex` con el motor Pandoc).

## Primer arranque

1. Abre un archivo (`Ctrl+O`), una carpeta (`Ctrl+Shift+O`) o crea un documento (`Ctrl+N`).
2. La barra lateral ofrece **Archivos**, **Esquema** y **Búsqueda**.
3. Los documentos abiertos se restauran en el siguiente arranque.

## Edición

- La sintaxis Markdown se oculta y reaparece al colocar el cursor en el nodo.
- Menú **Formato** o atajos: negrita `Ctrl+B`, cursiva `Ctrl+I`, tachado
  `Alt+Shift+5`, código ``Ctrl+Shift+` ``, enlace `Ctrl+K`.
- `Ctrl+/` alterna modo fuente. `F8` enfoque, `F9` máquina de escribir.
- La barra de estado incluye botones SVG para **código fuente** (`Ctrl+/`),
  **editor con vista previa** y **solo lectura**; el botón activo queda resaltado.
- El **modo lectura** bloquea la edición y muestra siempre el Markdown
  renderizado: no revela las marcas fuente al pasar el cursor, oculta el cursor
  de texto y desactiva el botón de código fuente, los atajos de formato y las
  acciones de tabla.
- Buscar `Ctrl+F`, buscar en archivos `Ctrl+Shift+F`, reemplazar `Ctrl+H`.
- Guardar `Ctrl+S`; guardar como `Ctrl+Shift+S`.

## Formato del documento

- **Formato → Fuente…** permite cambiar familia, negrita, cursiva, más negrita,
  resaltado amarillo y color para H1–H6, código, citas, cabeceras de tabla,
  enlaces y texto normal.
- **Formato → Lista…** cambia las viñetas o la numeración de **una sola lista**:
  flechas, palomitas, puntos negros/blancos; `a)`, `A)`, `I)`, `I.`, `1.`, `1)`.
- Ambos estilos se guardan en el frontmatter YAML y se aplican al editor, a las
  exportaciones HTML/PDF y a Word.

## Tablas

- `Ctrl+Shift+T` inserta una tabla.
- En la vista previa, **haz clic en una celda para editarla**; `Enter` confirma,
  `Escape` cancela y `Ctrl+S` guarda el cambio pendiente.
- Bajo la tabla hay botones **+ Fila** y **+ Columna** para añadir datos.
- Para **eliminar**, pulsa la `×` de la cabecera de la columna o la `×` de la
  fila que quieras quitar: solo se borra esa columna o fila.
- **Arrastra el tirador del borde derecho** de una cabecera para cambiar el
  ancho de esa columna. Las anchuras se guardan en el frontmatter YAML
  (`murk.tableWidths`).
- `Tab`/`Shift+Tab` navegan celdas y crean filas al final.
- `Enter` baja de fila; `Ctrl+Enter` inserta `<br>` en la celda.
- Menú **Tabla** para insertar/eliminar filas y columnas, alinear y formatear.

## Imágenes, matemáticas y diagramas

- Arrastra o pega imágenes; se copian a la carpeta configurada.
- `$…$` para matemáticas en línea y `$$…$$` para bloques.
- Bloques ` ```mermaid ` se renderizan como diagramas.
- Los checkboxes de tareas son interactivos.

## Exportación

**Archivo → Exportar…** permite HTML, PDF, DOCX, EPUB, ODT, LaTeX y Markdown.
Las imágenes se incrustan en HTML/PDF. La configuración de Pandoc/Chromium y el
motor PDF están en **Preferencias**.

Desde la terminal:

```bash
murk --export pdf notas.md -o notas.pdf
murk --export docx notas.md
```

## Recuperación e historial

- Los cambios se guardan automáticamente como snapshots (5 s de inactividad y
  cada 30 s) y se ofrecen tras un cierre anómalo.
- El autoguardado en disco se configura en **Preferencias** o se activa y
  desactiva al instante desde **Archivo → Autoguardado** (la marca ✓ indica
  que está activo).
- **Archivo → Historial del documento…** permite ver diferencias y restaurar.

## Atajos y accesibilidad

- **Ver → Atajos de formato…** personaliza los atajos de formato.
- `F1` muestra todos los atajos.
- Toda la interfaz es navegable por teclado; los modales atrapan el foco.

## Repositorio y autopush

**Archivo → Repositorio…** abre un diálogo para configurar:

- URL del remoto (`https://…`, `ssh://…` o `git@host:repo.git`).
- Rama de destino (`main`, `master`, etc.).
- Ruta relativa dentro del repositorio (vacía = raíz).
- Integración antes del push: **merge**, **rebase** o **sin pull**.
- Opciones: hacer pull antes del push y crear la rama si no existe.

La configuración se guarda en `~/.murk/config.json`. Murk clona el repositorio
en `~/.murk/repos/<nombre-del-repo>` y copia allí los documentos publicados.

- **Archivo → Push** guarda el documento activo, hace commit y ejecuta
  `git push origin <rama>`. Muestra una modal con barra de progreso y, al
  terminar, confirma el resultado o el error concreto. Si no hay repositorio
  configurado, ofrece configurarlo en ese momento.
- **Archivo → Autopush** (marcable) repite esa operación cada intervalo tras
  el autoguardado, sin intervención manual.

Los mensajes de commit son `new: <timestamp>` cuando el archivo no estaba
versionado y `update: <timestamp>` cuando se modifica. Requiere `git` y
credenciales configuradas (clave SSH o token HTTPS); los errores de red o
autenticación se muestran como aviso.

## Actualizaciones

**Ayuda → Buscar actualizaciones…** consulta el manifiesto firmado de GitHub
Releases. La instalación requiere que el release incluya firma de updater.

## Problemas frecuentes

| Problema | Solución |
|---|---|
| No abre en Wayland | Prueba `GDK_BACKEND=x11 murk` o actualiza WebKitGTK |
| PDF falla | Instala Chromium o `texlive-xetex` y revisa Preferencias |
| DOCX/EPUB falla | Instala `pandoc` o indica su ruta |
| Acento/IME extraño | Reporta con distribución, ibus/fcitx5 y versión |
| Archivo no UTF-8 | Se detecta automáticamente; si falla, cambia la codificación en la barra de estado |

## Límites conocidos de 1.0

Ver `specs/estado-a11.md`: i18n, multiventana, HTML inline renderizado,
redimensionado de imágenes, importador de temas y otras mejoras P2.
