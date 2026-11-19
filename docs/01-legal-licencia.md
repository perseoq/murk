# 01 — Legal, licencia y origen limpio

## 1. Licencia del proyecto

Murk se licencia bajo **GNU General Public License v3.0 o posterior** (`GPL-3.0-or-later`). Texto completo: `LICENSE.md`.

Consecuencias prácticas:

| Obligación | Cómo se cumple |
|---|---|
| Entregar el código fuente | Repositorio público + fuente en cada release |
| Mantener la misma licencia en derivados | Headers SPDX en todos los archivos |
| Avisos de copyright | `NOTICE.md` y headers |
| Sin restricciones adicionales | No se añaden EULAs ni DRM |
| Instalación de información | Los paquetes incluyen enlace al repositorio |

Cada archivo fuente debe comenzar con:

```text
SPDX-License-Identifier: GPL-3.0-or-later
Copyright (C) 2026 Murk contributors
```

## 2. Qué se puede y qué no

### Permitido

- Reimplementar funciones y flujos observables.
- Ser compatible con el dialecto Markdown/GFM y con archivos `.md` existentes.
- Usar librerías libres compatibles (ver `NOTICE.md`).
- Documentar atajos, menús y comportamientos equivalentes.
- Importar preferencias del usuario (formato propio).

### Prohibido

- Copiar o extraer `atom.compiled.dist.jsc`, `app.asar`, `lib.asar`, `appsrc`, `page-dist` o cualquier bytecode.
- Copiar CSS, temas, iconos, imágenes o tipografías de Typora.
- Copiar textos de `Docs/*.md`, diálogos o documentación.
- Usar “Typora”, su logo o su icono como nombre/marca de Murk.
- Distribuir parches, cracks o binarios modificados de Typora.
- Incluir dependencias con licencia incompatible con GPLv3.

## 3. Proceso clean-room

1. La especificación se escribe a partir de comportamiento observable (uso normal, documentación pública, estándares CommonMark/GFM).
2. Quien implementa no consulta código propietario.
3. Las decisiones se registran en `adr/`.
4. Si se consulta un proyecto libre, se anota en el ADR/PR y se respeta su licencia.
5. Revisión final: ningún asset, cadena o estructura de archivos debe proceder del binario de Typora.

## 4. Compatibilidad de licencias

| Licencia | ¿Compatible con GPLv3 al enlazar? |
|---|---|
| MIT / BSD-2/3 / ISC | Sí |
| Apache-2.0 | Sí (GPLv3) |
| LGPL-2.1/3.0 | Sí, enlace dinámico |
| MPL-2.0 | Sí, archivo por archivo |
| GPL-2.0-only | **No** (salvo excepción) |
| GPL-3.0-or-later | Sí |
| Propietaria / SSPL | **No** |

WebKitGTK se enlaza dinámicamente; el usuario puede sustituirlo. Pandoc y Chromium se ejecutan como procesos separados y no se enlazan.

## 5. Marcas y nombre

- “Murk” es el nombre de trabajo del proyecto.
- No se usa el nombre, logo, icono ni trade dress de Typora.
- Las capturas de documentación deben ser de Murk, nunca de Typora.
- Comparativas pueden mencionar “Typora” de forma nominativa y descriptiva, sin sugerir afiliación.

## 6. Temas y contenido de usuario

- Los temas creados por usuarios son obra suya; Murk solo define el formato.
- **No** se empaquetan temas de Typora ni se copian sus selectores.
- Los documentos del usuario no se suben a ningún servidor.
- Las contribuciones de documentación se licencian como GPL-3.0-or-later para simplificar.

## 7. Distribución y código fuente

Cada release debe incluir o enlazar:

1. Código fuente completo de la versión exacta.
2. `LICENSE.md` y `NOTICE.md`.
3. Instrucciones de compilación reproducibles.
4. Hashes y firma de los artefactos.

La GPLv3 no exige que el código esté en el mismo servidor, pero sí que sea accesible de forma equivalente y gratuita.
