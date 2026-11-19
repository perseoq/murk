# 13 — Temas y CSS

## 1. Modelo de tema

Un tema es una carpeta con:

```text
mi-tema/
├── theme.json      # metadatos
├── theme.css       # estilos
└── assets/         # opcional: fuentes, fondos
```

`theme.json`:

```json
{
  "id": "mi-tema",
  "name": "Mi tema",
  "version": "1.0.0",
  "author": "Roy",
  "license": "GPL-3.0-or-later",
  "mode": "light",
  "variables": {
    "--murk-bg": "#ffffff",
    "--murk-fg": "#1f2328",
    "--murk-accent": "#0969da"
  },
  "imports": ["base.css"]
}
```

## 2. CSS

- Variables mínimas que todo tema debe definir: fondo, texto, acento, borde, selección, código, cita, tabla.
- Clases estables documentadas: `.murk-heading-1`, `.murk-blockquote`, `.murk-table`, `.murk-code`, `.murk-math`, `.murk-mermaid`.
- Se prohíbe `@import` remoto; solo rutas locales dentro del tema.
- Sin `javascript:` ni `expression()`.
- Tamaño máximo del CSS: 1 MB.

### Variables principales

```css
:root {
  --murk-bg: #fff;
  --murk-bg-secondary: #f6f8fa;
  --murk-fg: #1f2328;
  --murk-fg-muted: #59636e;
  --murk-accent: #0969da;
  --murk-border: #d1d9e0;
  --murk-selection: #b6d7ff;
  --murk-code-bg: #f6f8fa;
  --murk-font: "Noto Serif", serif;
  --murk-mono: "Noto Sans Mono", monospace;
  --murk-font-size: 16px;
  --murk-line-height: 1.7;
  --murk-max-width: 46rem;
}
```

## 3. Descubrimiento e instalación

- Temas internos en `resources/themes/`.
- Temas de usuario en `~/.config/murk/themes/`.
- “Abrir carpeta de temas” desde el menú Tema.
- “Recargar temas” sin reiniciar.
- Un tema inválido se ignora con aviso; nunca impide arrancar.

## 4. Modo claro/oscuro

- `mode: light | dark | system` por tema.
- Con `system`, se elige variante según `prefers-color-scheme`.
- Cambio automático al cambiar el esquema del sistema.
- La transición no debe perder foco ni scroll.

## 5. Tipografías

- Fuentes por defecto: Noto Serif / Noto Sans Mono (o las del sistema).
- El usuario puede indicar familia, tamaño (10–32 px), interlineado (1.2–2.2) y ancho de línea.
- Fuentes locales vía `@font-face` dentro del tema.
- Sin descargas de fuentes en tiempo de ejecución.

## 6. Resaltado de código

- Temas de Shiki incluidos (`github-light`, `github-dark`, etc.).
- El tema del documento puede fijar `codeTheme` o heredar claro/oscuro.
- Números de línea opcionales.
- Copiar bloque y selector de lenguaje.

## 7. CSS de impresión

- `theme-print.css` opcional; si no, el tema define `@media print`.
- Reglas mínimas: fondo blanco, texto negro, sin sombras, enlaces con URL visible (opcional), `break-inside: avoid` para tablas/código/diagramas.
- Márgenes y tamaño los controla la exportación, no el tema.

## 8. Compatibilidad

- Murk **no** carga temas de Typora directamente; el DOM y las clases son distintos.
- Se ofrece un importador (P2) que traduce variables y reglas comunes, avisando de lo no soportado.
- Nunca se empaquetan temas de terceros sin licencia compatible.

## 9. Criterios de aceptación

1. Un tema nuevo aparece en el menú sin reiniciar.
2. Cambiar de tema no altera el documento ni las posiciones.
3. Un `theme.json` inválido muestra error y mantiene el tema anterior.
4. El PDF usa los estilos del tema activo.
5. El zoom y el tamaño de fuente no rompen el layout.
6. Ningún tema puede ejecutar JavaScript.
