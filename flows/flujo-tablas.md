# Flujo — Edición de tablas

```mermaid
stateDiagram-v2
  [*] --> Fuente
  Fuente --> Render: cursor fuera de la tabla
  Render --> Fuente: cursor dentro / clic en fuente
  Render --> Celda: doble clic en celda
  Celda --> Render: Esc / clic fuera
  Celda --> NuevaFila: Tab en última celda
  Celda --> NuevaColumna: menú contextual
  Render --> Fuente: Modo fuente
  NuevaFila --> Render
  NuevaColumna --> Render
```

## Interacciones
| Acción | Resultado |
|---|---|
| `Tab` | Siguiente celda; crea fila al final |
| `Shift+Tab` | Celda anterior |
| `Enter` | Fila siguiente, misma columna |
| `Esc` | Salir de la tabla |
| `Alt+↑/↓` | Mover fila |
| `Alt+←/→` | Mover columna |
| Clic en borde “+” | Insertar fila/columna |
| Pegar TSV/CSV | Crear tabla nueva |

## Invariantes
- El documento siempre contiene una tabla GFM válida.
- La alineación se conserva.
- Pipes escapados intactos.
- Deshacer revierte la operación completa.

## Degradación
- > 1 000 filas: render por viewport.
- Tabla malformada: se muestra como texto, nunca se “arregla” sola.
