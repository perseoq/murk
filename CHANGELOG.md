# Changelog

## 1.2.1795146253 - 2026-11-19

### Correcciones

- Abrir un archivo con la aplicación ya en marcha vuelve a funcionar de forma
  fiable: el evento de segunda instancia se registra antes de restaurar la
  sesión y las rutas que llegan durante el arranque se encolan.
- Se aceptan rutas y URIs `file://` (incluidos `localhost` y `%20`), como las
  que envían algunos gestores de archivos y lanzadores del escritorio.
- La ventana se restaura, muestra y enfoca al abrir un archivo desde fuera.
- El diálogo de apertura acepta tanto una ruta como una lista de rutas.
- El editor fuerza una nueva medición y repintado tras cambiar de documento.

## 1.2.1795142574 - 2026-11-19

### Correcciones

- El cierre de la ventana vuelve a funcionar: el manejador de cierre necesita
  el permiso `core:window:allow-destroy`, que faltaba en la capability.
- El aviso de cambios sin guardar vuelve a aparecer al cerrar con documentos
  modificados.
- El overlay de los modales cubre toda la ventana.
- Contraste corregido en las opciones de los selectores nativos.
- El **modo lectura** ahora bloquea de verdad el documento: al activarlo fuerza
  la vista renderizada (aunque estuvieras en modo código), no revela las marcas
  Markdown al posicionar el cursor y desactiva el botón de código, los atajos de
  formato y las acciones de tabla.

### Mejoras

- **Acerca de Murk** muestra el creador y mantenedor (Rodrigo Quintanar) y su
  contacto; los paquetes usan el mismo dato como `Maintainer`/`publisher`.
- Nuevo logo de Murk: cuadro azul redondeado con silueta blanca de la cabeza y
  el cuello de un boxer **de perfil**, con oreja erguida, hocico corto y papada.
  Se usa como favicon (`public/favicon.svg`) e icono de la aplicación
  (`src-tauri/icons/`, incluidos `.ico` e `.icns`).
- Integración de icono con GNOME/Wayland mediante `enableGTKAppId` y un
  `.desktop` con el id `io.github.perseoq.murk`. La AppImage se integra en
  `~/.local/share` en su primer arranque y actualiza su `Exec` si cambia de ruta.
- El logo del boxer sustituye a la «M» junto al menú Archivo.
- **Archivo → Autoguardado** es una opción marcable que activa o desactiva el
  guardado automático sin abrir Preferencias.
- La barra de estado muestra botones SVG para cambiar entre código fuente,
  editor con vista previa y solo lectura.
- El ítem marcable del menú alinea la marca a la izquierda y el atajo a la
  derecha.

### Repositorio git

- **Archivo → Repositorio…** configura URL, rama, ruta interna, estrategia de
  integración (merge/rebase/sin pull) y creación de rama.
- Configuración persistida en `~/.murk/config.json`; clon local en
  `~/.murk/repos/<repo>`.
- **Archivo → Push** guarda, hace commit y ejecuta `git push origin <rama>`,
  con modal de progreso y verificación del resultado o del error.
- Si no hay repositorio configurado, **Push** pregunta si configurarlo ahora.
- **Archivo → Autopush** hace commit y push automáticos tras el autoguardado.
- Mensajes de commit `new: <timestamp>` y `update: <timestamp>`.

## 1.0.0 — 2026-11-19

Primera versión estable de Murk.

### Editor

- CodeMirror 6 con Markdown GFM, resaltado y preview en vivo.
- Encabezados, énfasis, enlaces, listas, citas, código y reglas con
  revelado de sintaxis al colocar el cursor.
- Formato inline: negrita, cursiva, tachado, código y enlaces.
- Búsqueda/reemplazo local y búsqueda global en la carpeta.

### Contenido

- Imágenes locales con caché y rutas relativas.
- KaTeX para matemáticas en línea y en bloque.
- Mermaid con DOMPurify y tema claro/oscuro.
- Checkboxes de tareas interactivos.
- Tablas GFM con widget, navegación y comandos.

### Archivos y workspace

- Pestañas, sesión restaurable, árbol de archivos, esquema y recientes.
- Codificaciones UTF-8/UTF-16/heredadas, BOM y EOL preservados.
- Watcher con detección de conflictos y diff.
- Guardado atómico y archivos grandes en solo lectura.

### Recuperación

- Snapshots ante cierres anómalos.
- Autoguardado configurable.
- Historial local con diferencias y restauración.

### Exportación

- HTML con imágenes incrustadas.
- PDF vía Chromium o Pandoc/LaTeX.
- DOCX, EPUB, ODT y LaTeX vía Pandoc.
- CLI `--export`, `--version` y `--help`.

### Integración

- Instancia única, apertura de archivos desde CLI/escritorio.
- `.desktop`, asociaciones Markdown, spellcheck nativo e IME.
- Actualizaciones firmadas con `tauri-plugin-updater`.

### Calidad

- 69 tests frontend y 36 tests Rust.
- CI con frontend, Rust, clippy, formato y exportación DOCX.
- Paquetes `.deb`, `.rpm`, AppImage y actualizador firmado.

### Limitaciones conocidas

Ver `specs/estado-a11.md`.
