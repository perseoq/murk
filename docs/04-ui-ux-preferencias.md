# 04 — UI, UX y preferencias

## 1. Ventana

```text
┌──────────────────────────────────────────────────────────────┐
│ ● ● ●   [archivo.md ×] [notas.md ×] [+]          ⌕  ⚙  ⋯   │  barra de pestañas
├──────────┬───────────────────────────────────────────────────┤
│ Sidebar  │                                                   │
│ Archivos │              Área de edición                      │
│ Esquema  │        (una sola superficie, preview vivo)        │
│ Búsqueda │                                                   │
│          │                                                   │
├──────────┴───────────────────────────────────────────────────┤
│ 1 234 palabras · 7 890 caracteres · UTF-8 · LF · Markdown   │  barra de estado
└──────────────────────────────────────────────────────────────┘
```

- Ventana mínima 640×480; estado y tamaño restaurados.
- Barra de título nativa en Linux (CSD opcional P2); tema de ventana sigue al sistema.
- Pantalla completa (`F11`) y modo enfoque sin distracciones (`F8`).

## 2. Pestañas

| Comportamiento | Regla |
|---|---|
| Abrir | Un clic en archivo del árbol abre en pestaña de vista previa (cursiva); doble clic o edición la fija |
| Cerrar | `Ctrl+W`; si `dirty`, diálogo Guardar / Descartar / Cancelar |
| Reordenar | Drag & drop; persistido en sesión |
| Desbordamiento | Scroll horizontal + menú de pestañas |
| Nuevo | `Ctrl+N`, título “Sin título-N” |
| Duplicar | `Ctrl+Shift+N` (duplica ruta, no pestaña) |
| Contexto | Cerrar, cerrar otras, cerrar a la derecha, copiar ruta, revelar en gestor, fijar |

## 3. Sidebar

- Ancho 180–480 px, colapsable (`Ctrl+Shift+1`), recordado.
- Vistas exclusivas: **Archivos**, **Esquema**, **Búsqueda**.
- **Archivos**: árbol del directorio abierto; iconos por extensión; ocultos según ajuste; menú contextual (nuevo, renombrar, eliminar a papelera, revelar, copiar ruta).
- **Esquema**: headings H1–H6 con sangría; clic desplaza; resalta la sección visible; filtro al escribir.
- **Búsqueda**: ver `15-busqueda-reemplazo.md`.

## 4. Barra de estado

Elementos (ocultables): palabras, caracteres, líneas; encoding; EOL; idioma del corrector; modo (`Live`/`Source`); zoom. Clic en encoding/EOL abre selector. Clic en conteo abre estadísticas (palabras, caracteres con/sin espacios, párrafos, tiempo de lectura).

## 5. Menús (Linux)

### Archivo
Nuevo, Nueva ventana, Abrir, Abrir reciente ▸, Abrir carpeta, Guardar, Guardar como, Guardar todo, Mover a papelera, Exportar ▸, Imprimir, Preferencias, Salir.

### Editar
Deshacer, Rehacer, Cortar, Copiar, Pegar, Pegar como texto plano, Seleccionar todo, Buscar, Buscar siguiente/anterior, Reemplazar, Buscar en archivos.

### Párrafo
Título 1–6, Párrafo, Aumentar/disminuir nivel, Cita, Lista con viñetas, Lista numerada, Lista de tareas, Bloque de código, Fórmula matemática, Tabla, Línea horizontal, Índice (TOC), Footnote.

### Formato
Negrita, Cursiva, Subrayado (`<u>`), Tachado, Código en línea, Resaltado, Superíndice, Subíndice, Enlace, Imagen, Limpiar formato.

### Vista
Modo fuente, Modo enfoque, Modo máquina de escribir, Barra lateral, Esquema, Números de línea, Ajuste de línea, Zoom ▸, Pantalla completa, Alternar tema.

### Tema
Lista de temas instalados + “Abrir carpeta de temas” + “Recargar temas”.

### Ayuda
Documentación, Atajos de teclado, Acerca de, Reportar un problema, Licencia.

## 6. Preferencias

Diálogo con búsqueda y secciones:

| Sección | Opciones |
|---|---|
| Apariencia | Tema, modo claro/oscuro/sistema, fuente, monoespaciada, tamaño, interlineado, ancho de línea, zoom |
| Editor | Modo por defecto, autoguardado, corrector e idioma, puntuación inteligente, saltos duros, números de línea, autopar de símbolos, plegado |
| Archivos | Restaurar sesión, autoguardado al cerrar, inserción de imágenes, carpeta de imágenes, encoding por defecto, recortar espacios finales |
| Exportar | Motor PDF, tamaño de página, márgenes, incrustar imágenes, ruta de Pandoc, conservar HTML |
| Atajos | Tabla editable con búsqueda y detección de conflictos |
| Avanzado | Nivel de log, abrir carpeta de configuración, restablecer |

Cambios se aplican en caliente salvo los que requieren reinicio (se indica con icono).

## 7. Primer arranque y bienvenida

1. Detecta idioma del sistema.
2. Muestra bienvenida con: abrir archivo, abrir carpeta, crear documento, enlace a guía y atajos.
3. Solicita (opcional) asociación de archivos `.md`, `.markdown`, `.mdown`, `.txt`.
4. No pide cuenta, red ni licencia.

## 8. Notificaciones

- Toast inferior derecho: 4 s; errores 8 s con “Detalles”.
- Diálogos modales solo para pérdida de datos, conflictos y operaciones destructivas.
- Barra de progreso para exportaciones > 1 s, cancelable.

## 9. Interacción

- Drag & drop de archivos: abre pestaña; sobre el editor inserta enlace/imagen.
- Doble clic en palabra: selección; triple: párrafo.
- `Ctrl+rueda`: zoom 50–300 %.
- `Alt+clic`: cursor múltiple (P1).
- Todos los elementos accesibles por teclado con foco visible.

## 10. Criterios de aceptación

1. Cerrar con cambios ofrece exactamente Guardar/Descartar/Cancelar.
2. La sesión restaura pestañas, cursor, scroll, modo y tamaño de ventana.
3. Ningún menú supera los 15 elementos sin submenú.
4. Cambiar de tema no pierde foco ni scroll del editor.
5. La UI funciona a 1280×720 y a 200 % de zoom sin recortes.
