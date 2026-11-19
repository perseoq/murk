# 07 — Tablas

## 1. Formato

Se usa **tabla GFM**:

```markdown
| Izquierda | Centro | Derecha |
| :-------- | :----: | ------: |
| a         | b      | c       |
```

- La fila de separación define alineación (`:--`, `:-:`, `--:`).
- Se admiten pipes escapados `\|` y pipes dentro de código en línea.
- Filas con distinto número de celdas se completan visualmente, no se reescriben.

## 2. Render

- Widget de tabla en modo live, con anchos calculados y scroll horizontal si excede el ancho.
- Cabecera con fondo del tema; alineación aplicada.
- Celdas con Markdown inline renderizado (énfasis, código, enlaces).
- Números de fila/columna visibles al pasar el ratón (P2).
- Sin bordes verticales gruesos; estilo consistente con el tema.

## 3. Edición

### Navegación

| Tecla | Acción |
|---|---|
| `Tab` | Siguiente celda; en la última, nueva fila |
| `Shift+Tab` | Celda anterior |
| `Enter` | Baja de fila, misma columna (en la última, crea fila) |
| `Esc` | Sale de la tabla hacia después del bloque |
| Flechas | Movimiento dentro de la celda; en bordes, celda adyacente |
| `Ctrl+Enter` | Nueva línea dentro de la celda (`<br>`) |

### Estructura

- `Alt+↑/↓`: mover fila.
- `Alt+←/→`: mover columna.
- Botón “+” en bordes: insertar fila/columna.
- Menú contextual de celda: insertar/eliminar fila o columna, alinear, borrar contenido.

### Formato de celda

- Se escribe Markdown inline normal.
- El ancho de columna se calcula por contenido; el usuario puede arrastrar el borde (estado de UI, no se guarda en el archivo).

## 4. Vista fuente

Al colocar el cursor en la tabla (o en modo Source) se muestra la sintaxis original. El widget se sustituye por texto alineado con la misma estructura. Al salir, se vuelve a renderizar.

## 5. Pegado

- Pegar TSV/CSV desde hoja de cálculo: crea tabla GFM.
- Pegar tabla HTML: convierte a GFM.
- Pegar texto con pipes: se interpreta como tabla si tiene fila separadora válida.
- Pegar dentro de una celda: solo el contenido de la celda (primera si hay varias).

## 6. Operaciones masivas

| Comando | Efecto |
|---|---|
| Formatear tabla | Alinea pipes y rellena espacios (acción explícita) |
| Ordenar filas | Asc/desc por columna (acción explícita) |
| Convertir a lista | Cada fila → ítem con separador `—` (P2) |
| Copiar como CSV | Al portapapeles |

Ninguna operación de formato se ejecuta automáticamente al guardar.

## 7. Casos borde

| Caso | Comportamiento |
|---|---|
| Tabla vacía (solo cabecera) | Válida; se puede añadir filas |
| Sin fila separadora | No es tabla; se trata como párrafo |
| Celdas vacías | Se preservan |
| Pipe al inicio/final | Se tolera; se conserva el texto original |
| Tabla dentro de cita/lista | Se renderiza con la sangría correspondiente |
| Tabla gigante (> 1000 filas) | Render por viewport; aviso de rendimiento |
| Caracteres anchos (CJK) | Anchos calculados con `Intl.Segmenter` |
| Emoji | Ancho correcto |

## 8. Exportación

- HTML: `<table>` semántica con `thead`/`tbody`.
- PDF: CSS de impresión con `table-layout: auto`, evita cortes de fila (`break-inside: avoid`).
- DOCX/EPUB: Pandoc conserva la tabla GFM.

## 9. Criterios de aceptación

1. `Tab` recorre todas las celdas y crea fila al final.
2. Insertar/eliminar fila y columna produce Markdown válido y deshacer lo revierte.
3. Una tabla pegada desde LibreOffice Calc se convierte correctamente (incluidas celdas con comas).
4. Los pipes escapados sobreviven a edición y guardado.
5. El archivo guardado sin editar es idéntico al original.
6. La tabla exportada a PDF no parte filas a la mitad cuando es posible.
