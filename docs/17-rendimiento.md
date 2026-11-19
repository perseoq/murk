# 17 — Rendimiento

## 1. Presupuestos

| Escenario | Objetivo | Medición |
|---|---|---|
| Arranque en frío (vacío) | ≤ 1 500 ms | Tauri start → primer frame editable |
| Arranque con sesión de 10 archivos | ≤ 2 500 ms | ídem |
| Latencia de tecleo (100 KB) | ≤ 16 ms p95 | keydown → frame |
| Apertura 1 MB | ≤ 300 ms | click → editable |
| Apertura 10 MB | ≤ 2 s | click → editable (modo simplificado) |
| Scroll 60 fps | ≥ 55 fps | 100 KB con imágenes |
| Búsqueda global 10 000 archivos | ≤ 5 s o progreso | grep-searcher |
| Memoria en reposo | ≤ 250 MB RSS | 1 documento 100 KB |
| Exportación PDF 20 páginas | ≤ 10 s | Chromium |
| Cambio de tema | ≤ 150 ms | sin recargar documento |

## 2. Estrategias

### Editor
- Parse incremental de Lezer; no re-parsear el documento completo.
- Decoraciones solo para el viewport ± 2 pantallas.
- `WidgetType.eq` y caché de render.
- Imágenes con `loading="lazy"` y `decode()`.
- Mermaid/KaTeX diferidos; caché por hash.
- Evitar `EditorView.updateListener` costosos; debounce para persistencia.

### UI
- Sidebar virtualizada para árboles grandes (> 5 000 nodos).
- Resultados de búsqueda paginados.
- Sin frameworks pesados en la ruta crítica; carga diferida de Preferencias y exportación.
- CSS con variables; evitar recálculos de layout en scroll.

### Rust
- IO en hilos/async; nunca bloquear el hilo de UI.
- Lectura con buffer; escritura atómica sin copias innecesarias.
- Watcher con debounce y filtros (ignora `target/`, `.git`, `node_modules`).
- Búsqueda con paralelismo y cancelación.
- Exportación en proceso hijo con timeout.

## 3. Límites y degradación

| Umbral | Degradación |
|---|---|
| > 1 MB | Aviso; spellcheck off |
| > 5 MB | Widgets off; resaltado simplificado |
| > 20 MB | Solo lectura, modo fuente |
| > 1 000 imágenes | Minituras on-demand |
| > 5 000 nodos en árbol | Virtualización forzada |
| > 10 000 resultados | Truncar con aviso |

## 4. Perfilado

- `--profile` abre panel de rendimiento (P2).
- Marcas de rendimiento (`performance.mark`) en arranque, apertura, guardado y exportación.
- Benchmarks en CI con límites de regresión (±20 %).
- Pruebas con documentos de 10 KB, 100 KB, 1 MB y 10 MB.

## 5. Criterios de aceptación

1. Escribir rápido en 1 MB no pierde pulsaciones.
2. El scroll con 200 imágenes mantiene ≥ 50 fps.
3. Cambiar de pestaña no re-parsea el documento completo.
4. La búsqueda global no congela la UI.
5. Ninguna operación de disco bloquea el hilo principal.
6. Los benchmarks de CI fallan ante una regresión > 20 %.
