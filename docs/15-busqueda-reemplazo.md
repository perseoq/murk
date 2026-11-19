# 15 — Búsqueda y reemplazo

## 1. Búsqueda en el documento

Panel superior (`Mod+F`) con:

- Campo de búsqueda, contador `n de m`, siguiente/anterior, cerrar.
- Opciones: distinguir mayúsculas, palabra completa, regex.
- Resaltado de coincidencias y de la activa.
- `Enter` = siguiente; `Shift+Enter` = anterior; `Esc` = cerrar y devolver foco.
- La búsqueda no modifica el documento y se cancela al cambiar de pestaña.

### Reemplazo (`Mod+H`)

- Campos buscar/reemplazar, “Reemplazar”, “Reemplazar todo”.
- Vista previa del número de reemplazos.
- Deshacer revierte todo el lote como una transacción.
- Regex: grupos `$1`…`$9`; validación con mensaje de error.

## 2. Búsqueda global

`Mod+Shift+F` abre la vista Búsqueda del sidebar.

| Opción | Descripción |
|---|---|
| Texto | Literal o regex |
| Carpeta | Raíz del workspace (o ruta elegida) |
| Filtros | `*.md`, exclusiones (`!node_modules`, `!.git`) |
| Mayúsculas | Sí/No |
| Palabra completa | Sí/No |
| Regex | Sí/No |
| Contexto | 0–3 líneas alrededor |

Resultados agrupados por archivo con número de línea y fragmento resaltado. Clic abre el archivo en la coincidencia; `F4` recorre resultados.

### Motor

- Rust `grep-searcher` + `ignore` (respeta `.gitignore`, ignora binarios).
- Límites: 10 000 coincidencias, 200 MB escaneados, 20 s; se muestra aviso al truncar.
- Cancelable; progreso en la vista.
- Sin indexación en v1 (búsqueda en vivo). Índice opcional P2.

## 3. Búsqueda de archivos

`Mod+P` (Quick Open):

- Fuzzy match sobre rutas del workspace.
- Muestra ruta relativa y extensión.
- `↑/↓` navega, `Enter` abre, `Esc` cierra.

## 4. Búsqueda en preferencias

- Filtro en el diálogo de Preferencias que resalta secciones y opciones.

## 5. Casos borde

| Caso | Comportamiento |
|---|---|
| Búsqueda con documento sin guardar | Busca en el buffer |
| Regex inválida | Borde rojo + mensaje; no ejecuta |
| Coincidencia dentro de código | Se incluye (opción “excluir código” P2) |
| Archivo borrado durante búsqueda | Se omite con aviso |
| Resultados en binarios | Excluidos |
| Enlaces simbólicos | No se siguen por defecto |
| Ruta sin permisos | Se omite y se registra |

## 6. Criterios de aceptación

1. `Mod+F` encuentra texto con acentos y mayúsculas según opción.
2. Reemplazar todo es una sola operación de deshacer.
3. La búsqueda global respeta `.gitignore`.
4. Cerrar el panel restaura el foco y la selección.
5. Los resultados no bloquean la UI durante la búsqueda.
6. `F4` recorre coincidencias en orden y hace scroll al contexto.
