# ADR 0003 — PDF con Chromium headless como motor principal

- **Estado:** aceptado
- **Fecha:** 2026-11-19

## Contexto

La exportación a PDF debe conservar el aspecto del editor: tema, fuentes, tablas, código resaltado, matemáticas y diagramas. WebKitGTK permite imprimir con diálogo, pero no ofrece impresión headless fiable ni control fino de página.

## Decisión

Usar **Chromium headless** (`--headless --print-to-pdf`) como motor PDF por defecto, con **Pandoc + XeLaTeX** como alternativa configurable.

## Motivos

1. Fidelidad CSS y de fuentes muy alta.
2. Soporta `@page`, márgenes, saltos y encabezados.
3. Renderiza el mismo HTML del editor.
4. Disponible en la mayoría de sistemas o instalable.

## Consecuencias

**Positivas**
- PDF visualmente consistente con la app.
- Una sola ruta de render HTML para editor y PDF.

**Negativas**
- Dependencia externa grande (~150 MB si se empaqueta).
- Hay que localizar el binario y validarlo.
- Diferencias menores entre distribuciones.

## Reglas

1. Si Chromium no está disponible, se ofrece Pandoc/LaTeX.
2. Nunca se descarga Chromium automáticamente.
3. La ruta es configurable en Preferencias.
4. Los argumentos se pasan como array, sin shell.
5. Timeout 120 s y cancelación con limpieza de temporales.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| WebKitGTK print | Sin headless fiable; control limitado |
| WeasyPrint | Subconjunto CSS; menos fidelidad |
| wkhtmltopdf | Proyecto poco mantenido; motor antiguo |
| Pandoc+LaTeX único | Excelente tipografía, pero requiere TeX y no reproduce el tema |

## Revisión

Si se adopta un motor PDF nativo de Tauri con suficiente fidelidad, se reevalúa.
