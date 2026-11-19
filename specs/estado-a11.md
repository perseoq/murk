# Estado tras A11 — Paridad y pulido

Actualizado: 2026-11-19. Commit `9021352`.

## Implementado en A11

| Área | Detalle |
|---|---|
| Formato inline | Negrita, cursiva, tachado, código y enlace desde menú **Formato** y teclado. |
| Atajos configurables | Editor de atajos de formato en `Ver → Atajos de formato…`; se guardan en `settings.json`. |
| Accesibilidad | Trampa de foco y restauración en modales; flechas en pestañas laterales; roles ARIA; foco visible. |
| Rendimiento | Contadores y estado con debounce de 120 ms; pestañas solo se repintan al cambiar el estado sucio. |
| IME | Los atajos globales se ignoran durante composición; el live preview no se recalcula al componer. |
| Historial de atajos | La lista de ayuda muestra los atajos personalizados. |

## Cobertura de la matriz

- **P0:** completo para el flujo de escritorio (archivos, editor, preview, tablas, widgets, exportación, recuperación, workspace).
- **P1:** implementado el núcleo; quedan brechas conocidas que no bloquean el uso diario.
- **P2:** pendiente por diseño.

## Brechas conocidas (documentadas para A12/backlog)

1. **i18n**: la UI está en español; no hay catálogos `es/en` intercambiables.
2. **Multiventana**: la instancia única enfoca la ventana existente; `--new-window` no crea otra.
3. **HTML inline**: el editor muestra el HTML como texto; no se renderiza saneado en preview.
4. **Imágenes**: no hay redimensionado persistente arrastrando.
5. **Temas**: no existe importador de temas de terceros; solo temas CSS propios.
6. **Exportación por lotes** y **pintar TOC**: no implementadas.
7. **Matemáticas**: sin numeración de ecuaciones ni macros por documento.
8. **Flowchart.js / js-sequence-diagrams**: no soportados.
9. **Tablas**: render y comandos completos; edición in-place con rejilla editable queda como mejora.
10. **Atajos globales**: personalizables solo los de formato; los de archivo/ver usan los valores por defecto.

Estas brechas se revisarán en A12 y, si no entran en el release, quedarán como issues post-1.0.

## Evidencia

- Commit: `9021352`.
- CI: run `44616040579` (frontend y Rust verdes).
- Tests: 69 frontend, 36 Rust.
