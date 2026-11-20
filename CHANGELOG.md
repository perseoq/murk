# Changelog

## 1.2.1795201324 - 2026-11-20

### Insertar

- Nuevo menú **Insertar** con listas con viñetas, numeradas y de tareas, cita,
  bloque de código, tabla, fórmula en línea, fórmula en bloque y regla
  horizontal. Las acciones de lista y cita prefijan las líneas seleccionadas.

## 1.2.1795200487 - 2026-11-20

### Correcciones

- El padding interno de los bloques de código vuelve a aplicarse: las reglas del
  tema de CodeMirror lo anulaban por especificidad. Ahora el texto respira 18 px
  a los lados, 12 px arriba y 16 px abajo.
- La línea activa o bajo el ratón en un bloque de código conserva el fondo gris
  claro; ya no se vuelve blanca.
- El texto base del tema claro es negro; solo los enlaces van en azul. El código
  en línea y los marcadores de lista dejan de usar el azul.

## 1.2.1795199376 - 2026-11-20

### Bloques de código

- La cabecera ya no lleva la línea gris inferior y el bloque respira mejor:
  padding de 18 px a los lados, 12 px arriba y 16 px abajo, con una cabecera de
  fondo ligeramente distinto y esquinas redondeadas.

## 1.2.1795197575 - 2026-11-20

### Bloques de código

- **Padding interno** en el bloque y una cabecera superior con separación
  respecto al código.
- **Resaltado por lenguaje** según la valla (`java`, `php`, `javascript`, etc.)
  con una paleta específica para tema claro y oscuro: palabras clave, cadenas,
  comentarios, números, funciones, tipos, operadores y variables.
- En **modo edición** la esquina superior derecha muestra el **lenguaje** del
  bloque. En **solo lectura** muestra un botón **Copiar** que copia el bloque
  completo al portapapeles (con respaldo para navegadores sin Clipboard API).

## 1.2.1795195353 - 2026-11-20

### Correcciones

- El **modo lectura** reconstruye las tablas al activarse: las celdas dejan de
  ser editables y desaparecen los botones de añadir/eliminar hasta volver al
  modo edición.

### Formato del documento

- **Formato → Fuente → Elementos** incluye ahora **Listas**. La familia, negrita,
  cursiva, más negrita, resaltado y color se aplican a las líneas de lista en el
  editor y a los elementos `li` en HTML/PDF/DOCX.

## 1.2.1795192054 - 2026-11-20

### Correcciones

- Los marcadores personalizados de las listas (flechas, palomitas, puntos
  negros/blancos y numeraciones) se ven en la vista previa del editor. El
  widget de lista ahora pinta el marcador calculado en lugar de mostrar siempre
  `•`; solo se veían al exportar porque el CSS de exportación sí los aplicaba.

## 1.2.1795188918 - 2026-11-20

### Correcciones

- Editar celdas y borrar filas o columnas ya no bloquea la aplicación. El
  contenido editable de la celda vive en un elemento separado de los botones
  (al enfocar ya no se pierden las `×`) y los cambios se aplican en una
  microtarea, evitando reentradas de CodeMirror desde eventos del widget.
- Al **añadir una columna**, todas las filas reciben su celda. Las celdas vacías
  se conservan con un marcador invisible porque el parser GFM omite las celdas
  vacías al final de una fila; el editor las muestra y las trata como vacías.
- Las filas y celdas vacías mantienen la altura de una línea, también antes de
  escribir en ellas.

## 1.2.1795187255 - 2026-11-20

### Tablas

- **Borrado por selección**: cada cabecera tiene una `×` para eliminar esa
  columna y cada fila tiene una `×` para eliminar esa fila. Solo se eliminan los
  datos de la columna o fila elegida, manteniendo el resto intacto.
- La barra inferior conserva `+ Fila` y `+ Columna`; ya no borra la última
  columna o fila sin indicar cuál.

## 1.2.1795185312 - 2026-11-20

### Formato del documento

- **Formato → Fuente…**: familia tipográfica, negrita, cursiva, más negrita,
  resaltado amarillo y color de letra para H1–H6, código, citas, cabeceras de
  tabla, enlaces y texto normal.
- **Formato → Lista…**: viñetas (flechas, palomitas, puntos negros y blancos) y
  numeración (`a)`, `A)`, `I)`, `I.`, `1.`, `1)`) aplicadas **solo a la lista
  seleccionada**. En la vista previa los marcadores de lista nunca muestran el
  código fuente.
- La configuración se guarda en el frontmatter YAML (`murk.styles` y
  `murk.lists`) y se aplica al editor, HTML, PDF y DOCX. En DOCX las fuentes,
  colores, negritas, cursivas y resaltados se inyectan en los estilos de Word y
  la numeración ordenada se conserva mediante listas *fancy*; las viñetas
  personalizadas usan el estilo de lista estándar de Word.

## 1.2.1795183629 - 2026-11-20

### Tablas

- La tabla renderizada incluye una **barra de acciones** con `+ Fila`,
  `+ Columna`, `− Fila` y `− Columna`, para cambiar la estructura sin pasar al
  código fuente.
- Al añadir una columna se conserva el ancho guardado y se asigna uno por
  defecto a la nueva; al quitarla se elimina también su ancho.

## 1.2.1795182102 - 2026-11-20

### Correcciones

- La tabla ya no muestra una barra de desplazamiento horizontal cuando cabe en
  el ancho disponible: el tirador de redimensionado queda dentro de la celda y
  solo aparece scroll si la tabla realmente es más ancha.

## 1.2.1795180585 - 2026-11-20

### Tablas editables

- Las tablas renderizadas se editan **directamente en la celda**: clic para
  editar, `Enter` para confirmar, `Escape` para cancelar y `Ctrl+S` guarda el
  cambio pendiente.
- **Tiradores en el borde derecho** de cada cabecera para redimensionar las
  columnas; la tabla pasa a ancho fijo al primer ajuste.
- Las anchuras se guardan en el frontmatter YAML (`murk.tableWidths`) por índice
  de tabla. El frontmatter se muestra como una barra compacta en la vista previa
  y se elimina de las exportaciones HTML, PDF, DOCX, EPUB y LaTeX.

## 1.2.1795178073 - 2026-11-20

### Correcciones

- Las barras de desplazamiento usan un pulgar gris claro (`#9e9e9e`), visible
  en tema claro y oscuro.
- **Mermaid y tablas se renderizan al abrir**: se fuerza el análisis del
  viewport al activar una pestaña y los widgets de bloque se recalculan cuando
  el parser avanza, en lugar de esperar a un cambio de documento o selección.

## 1.2.1795147921 - 2026-11-20

### Correcciones

- **Mermaid**: las etiquetas vuelven a aparecer dentro de las figuras. Se fuerza
  `htmlLabels: false` (Mermaid 12 usaba HTML en `foreignObject` y el saneado lo
  eliminaba) y se mide el texto con una familia tipográfica concreta en lugar de
  `var(--murk-font)`, que WebKit no resuelve al medir.
- **Diagramas en tema oscuro**: legibles, sin etiquetas invisibles; el fondo de
  las etiquetas de arista se iguala al del editor.
- **Matemáticas**: además de `$...$` y `$$...$$` se aceptan los delimitadores
  `\(...\)` en línea y `\[...\]` en bloque.
- **Apertura de archivos en Linux**: al ejecutarse se registra el `.desktop` del
  ejecutable actual y se deja como predeterminado para Markdown, para que el
  doble clic y «Abrir con» usen Murk.

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
