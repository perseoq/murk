# Contribuir a Murk

## Licencia de las contribuciones

Al enviar un cambio aceptas licenciarlo bajo **GPL-3.0-or-later**. No se aceptan contribuciones con licencias incompatibles (ver `NOTICE.md`).

- Firma tus commits con `git commit -s` (Developer Certificate of Origin 1.1).
- Todo archivo fuente nuevo debe incluir el header SPDX:

```text
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors
```

## Reglas de origen limpio

1. **Prohibido** copiar código, bytecode, CSS, temas, iconos, tipografías o textos de Typora u otro producto propietario.
2. Las especificaciones se implementan desde la descripción de comportamiento de `docs/` y `specs/`, no desde binarios descompilados.
3. Si consultas una implementación libre, respeta su licencia y déjalo anotado en el PR.
4. No se aceptan binarios opacos ni dependencias sin licencia verificable.
5. Los nombres, logos y capturas de Typora no se usan en el proyecto.

## Flujo de trabajo

```text
main        -> siempre compila y pasa CI
feat/*      -> una función por rama
fix/*       -> correcciones
docs/*      -> solo documentación
```

1. Abre un issue describiendo el comportamiento esperado y el documento de `docs/` afectado.
2. Crea la rama y añade/actualiza la spec si el comportamiento cambia.
3. Implementa con pruebas.
4. Actualiza `specs/matriz-paridad-typora.md` (estado de la función).
5. PR con: qué, por qué, cómo probarlo, capturas si aplica, y confirmación de licencia.

## Estilo

| Área | Herramienta |
|---|---|
| Rust | `cargo fmt`, `cargo clippy -- -D warnings` |
| TS/JS | ESLint + Prettier, TypeScript `strict` |
| Markdown | 80–100 columnas, un idioma por documento (es) |
| Commits | Conventional Commits (`feat:`, `fix:`, `docs:`, `perf:`, `test:`) |
| Mermaid | Un diagrama por bloque, con título |

## Pruebas obligatorias

- Comportamiento nuevo → prueba unitaria o de integración.
- Cambio en el editor → caso en el corpus `tests/fixtures/*.md`.
- Regresión → prueba que falle antes y pase después.
- Nunca desactivar una prueba sin justificarlo en el PR.

## Revisión

Un PR se acepta si: compila, pasa CI, tiene pruebas, respeta la spec, no introduce assets propietarios y mantiene la licencia.
