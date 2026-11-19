# ADR 0002 — CodeMirror 6 para el editor y live preview por decoraciones

- **Estado:** aceptado
- **Fecha:** 2026-11-19

## Contexto

La función distintiva de Typora es editar Markdown viendo el resultado en la misma superficie. Hay que elegir entre un editor de texto enriquecido (ProseMirror/TipTap) y uno de código con decoraciones (CodeMirror 6).

## Decisión

Usar **CodeMirror 6** con `@codemirror/lang-markdown` + `@lezer/markdown` y un sistema propio de decoraciones para el preview en vivo.

## Motivos

1. El Markdown sigue siendo el texto real; no hay round-trip AST→texto que pueda corromper el archivo.
2. Parser incremental eficiente para documentos grandes.
3. Control total de selección, IME, undo y accesibilidad.
4. Decoraciones + `atomicRanges` + widgets cubren el comportamiento de Typora.
5. Licencia MIT, compatible con GPLv3.

## Consecuencias

**Positivas**
- Fidelidad byte a byte del documento.
- Rendimiento predecible.
- Base sólida para tablas, math y diagramas como widgets.

**Negativas**
- Hay que implementar el preview desde cero (es el mayor coste del proyecto).
- Tablas in-place y selección entre widgets requieren trabajo fino.
- Riesgo de bugs visuales en casos anidados.

## Reglas derivadas

1. Nunca se serializa el documento completo; solo ediciones mínimas.
2. Las decoraciones no alteran el documento.
3. Nada se transforma durante composición IME.
4. Los widgets solo se montan en viewport.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| ProseMirror/Milkdown | Riesgo de reescritura del Markdown; más difícil preservar bytes |
| TipTap | Igual, y menos control del modelo de texto |
| contenteditable propio | Complejidad extrema de selection/undo/IME |
| WebView + `<textarea>` | Sin decoraciones viables |

## Revisión

Se hará un prototipo con headings, énfasis, listas, imágenes y una tabla antes de M4. Si el prototipo no alcanza los presupuestos de rendimiento, se documenta y se ajusta el alcance, no el stack.
