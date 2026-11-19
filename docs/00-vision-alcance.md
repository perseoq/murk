# 00 — Visión y alcance

## 1. Problema

Typora define un estándar de edición Markdown: una sola superficie donde el texto se ve formateado al instante, sin panel de preview separado, con atajos, tablas, matemáticas y exportación de calidad. Murk busca ofrecer ese mismo flujo en software libre (GPLv3), sin depender de una licencia propietaria.

## 2. Objetivo

Reimplementar, desde cero y de forma limpia, un editor con **paridad funcional observable** con Typora 1.14.x en Linux, priorizando:

1. Edición Markdown con preview en vivo en una sola superficie.
2. Fidelidad del archivo: el Markdown en disco nunca se corrompe ni se reescribe sin necesidad.
3. Rendimiento percibido: apertura y escritura sin fricción.
4. Exportación fiel: HTML, PDF, DOCX, EPUB, LaTeX.
5. Integración con el escritorio: CLI, MIME, `.desktop`, apertura desde el gestor de archivos.

## 3. Personas

| Persona | Necesidad principal |
|---|---|
| Escritor técnico | Notas largas, tablas, código, exportar a DOCX/PDF |
| Estudiante/investigador | Matemáticas, referencias, PDF limpio |
| Desarrollador | README, notas con code fences, búsqueda global |
| Usuario migrado de Typora | Mismos atajos, menús y resultado visual |
| Autor de temas | CSS personalizado y recarga en caliente |

## 4. Alcance funcional (resumen)

- Editor WYSIWYG sobre Markdown, modo fuente y modo mixto.
- GFM: tablas, tareas, tachado, autolinks, footnotes, frontmatter.
- KaTeX (inline/bloque) y Mermaid (todos los tipos habituales).
- Imágenes: drag & drop, pegado, rutas relativas, copia a carpeta.
- Pestañas, árbol de archivos, outline, búsqueda global.
- Autoguardado, recuperación tras caída, historial local.
- Exportación HTML/PDF/DOCX/EPUB/ODT/LaTeX, con plantillas.
- Temas CSS, modo claro/oscuro, tipografías personalizadas.
- Atajos configurables, corrector ortográfico, soporte IME.
- CLI y asociación de archivos.

## 5. Fuera de alcance (v1)

- Colaboración en tiempo real y sincronización en nube.
- Aplicaciones móviles.
- Plugins de terceros ejecutando código arbitrario.
- Compatibilidad binaria con archivos de configuración de Typora (se puede importar, no depender de ellos).
- Firma de PDF, OCR, bases de datos de notas.

## 6. Niveles de paridad

| Nivel | Definición | Ejemplo |
|---|---|---|
| **P0** | Imprescindible para considerar Murk usable | Abrir, editar, guardar, preview, GFM, exportar PDF |
| **P1** | Paridad esperada en 1.0 | Tablas editables, math, Mermaid, temas, historial |
| **P2** | Pulido posterior | flowchart.js, i18n completa, atajos de Typora importados |

La matriz detallada vive en `specs/matriz-paridad-typora.md`.

## 7. Métricas de éxito

| Métrica | Objetivo |
|---|---|
| Arranque en frío (SSD, documento vacío) | ≤ 1,5 s |
| Latencia de tecleo en documento de 100 KB | ≤ 16 ms p95 |
| Apertura de 1 MB | ≤ 300 ms |
| Documento de 10 MB sin bloqueo | ≤ 2 s hasta editable |
| Fugas de datos del archivo | 0 en el corpus de pruebas |
| Cobertura de la matriz P0/P1 | 100 % antes de 1.0 |
| Pruebas E2E de flujos críticos | 100 % verdes en CI |

## 8. Principios de diseño

1. **El texto es la verdad.** La vista deriva del Markdown; nunca se serializa un AST que reescriba el documento completo.
2. **Cambios mínimos.** Cada acción produce la edición de texto más pequeña posible.
3. **Sin pérdida.** Encoding, BOM, EOL, espacios finales y estructura se preservan salvo acción explícita.
4. **Offline primero.** Ninguna función requiere red.
5. **Accesible.** Todo se puede hacer con teclado.
6. **Legal.** Implementación clean-room; ver `01-legal-licencia.md`.

## 9. Criterio de “terminado” para 1.0

- Matriz P0 y P1 al 100 %.
- Exportaciones verificadas contra documentos de referencia.
- Sin pérdida de datos en 72 h de pruebas de estrés.
- Paquetes `.deb`, `.rpm` y AppImage firmados.
- Documentación de usuario y de proyecto completa.
