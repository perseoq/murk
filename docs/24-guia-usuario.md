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
sudo dnf install murk-1.0.0.x86_64.rpm
```

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
- Buscar `Ctrl+F`, buscar en archivos `Ctrl+Shift+F`, reemplazar `Ctrl+H`.
- Guardar `Ctrl+S`; guardar como `Ctrl+Shift+S`.

## Tablas

- `Ctrl+Shift+T` inserta una tabla.
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
