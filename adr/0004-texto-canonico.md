# ADR 0004 — El texto Markdown como única fuente de verdad

- **Estado:** aceptado
- **Fecha:** 2026-11-19

## Contexto

Un editor WYSIWYG puede representar el documento como un árbol rico y serializarlo a Markdown al guardar. Eso simplifica el render pero arriesga pérdida de formato, orden de atributos, espacios y sintaxis no soportada.

## Decisión

El **buffer de texto Markdown** es la fuente de verdad. La vista se deriva de él mediante decoraciones. Guardar escribe exactamente el buffer (con la normalización mínima configurada).

## Motivos

1. Integridad: abrir y guardar sin cambios produce bytes idénticos.
2. Compatibilidad con herramientas externas y Git.
3. Evita pérdida de sintaxis no modelada.
4. Deshacer y selección son los del editor de texto.

## Consecuencias

**Positivas**
- Cero drift de formato.
- Fácil de probar con fixtures.
- El usuario puede editar la sintaxis en cualquier momento.

**Negativas**
- El render debe tolerar Markdown malformado.
- Las operaciones estructurales (tablas, listas) deben calcular ediciones de texto.
- Los widgets no pueden ser la representación autoritativa.

## Reglas

1. Ninguna acción de render modifica el documento.
2. Las operaciones estructurales generan transacciones mínimas.
3. Las normalizaciones (EOL, espacios finales) son explícitas.
4. Los tests comparan bytes antes/después de abrir y guardar.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| AST rico + serialización | Pérdida de formato y sintaxis |
| Doble buffer (texto + AST) | Sincronización compleja y bugs |
| Guardar HTML | No es Markdown; rompe interoperabilidad |
