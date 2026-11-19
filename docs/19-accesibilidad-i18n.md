# 19 — Accesibilidad e internacionalización

## 1. Accesibilidad (WCAG 2.2 AA)

| Criterio | Implementación |
|---|---|
| Teclado | Todas las acciones accesibles; sin trampas de foco |
| Foco visible | Anillo de 2 px con contraste ≥ 3:1 |
| Contraste | Texto ≥ 4.5:1; UI ≥ 3:1 en ambos temas |
| Zoom | 50–300 % sin pérdida de función |
| Movimiento | `prefers-reduced-motion` respetado |
| Texto alternativo | Imágenes y diagramas con descripción |
| Semántica | Roles ARIA en pestañas, árbol, diálogos, menús |
| Errores | Asociados al campo y anunciados |
| Idioma | `lang` correcto en el documento y la UI |

### Editor

- CM6 expone el contenido como texto editable accesible.
- Los widgets no deben robar el foco; se anuncian con `aria-label`.
- Los checkboxes son alcanzables y conmutables por teclado.
- La tabla tiene semántica de tabla; en modo live, navegación por celdas.
- Anuncios de estado (guardado, errores) vía región `aria-live="polite"`.

### Pruebas

- Navegación completa solo con teclado (lista de verificación manual).
- Auditoría con axe-core en CI sobre vistas principales.
- Prueba con Orca en GNOME/Wayland.
- Contraste verificado en los temas incluidos.

## 2. Internacionalización

- Catálogos JSON por idioma: `locales/<lang>.json`.
- Clave → cadena; sin concatenación de fragmentos.
- Interpolación con `{name}`; plurales con ICU MessageFormat.
- Idioma inicial: `LANG`/`LC_ALL`, luego `en`.
- Cambio en caliente sin reiniciar (P1).
- Fechas y números con `Intl`.
- RTL: `dir="rtl"` y estilos lógicos (`margin-inline`, `padding-inline`).

### Idiomas iniciales

| Código | Idioma | Prioridad |
|---|---|---|
| `es` | Español | P0 |
| `en` | Inglés | P0 |
| `pt-BR` | Portugués (Brasil) | P1 |
| `fr` | Francés | P1 |
| `de` | Alemán | P1 |
| `ja` | Japonés | P2 |
| `zh-CN` | Chino simplificado | P2 |

### Reglas de traducción

- No traducir sintaxis Markdown, nombres de comandos ni rutas.
- Mantener longitud razonable (la UI no debe romperse).
- Documentar contexto para traductores (`_comment`).
- Las traducciones se revisan por hablantes nativos.

## 3. Documentos del usuario

- `lang` del frontmatter afecta a la corrección y a la exportación.
- El editor no impone dirección de texto; soporta contenido bidi.
- Fuentes con cobertura CJK/Arabe configurables.

## 4. Criterios de aceptación

1. Completar “abrir → editar → guardar → exportar” solo con teclado.
2. axe-core sin violaciones críticas en las 5 vistas principales.
3. Cambiar a `es`/`en` traduce toda la UI sin claves sin traducir visibles.
4. El zoom al 200 % no oculta controles.
5. Los lectores de pantalla anuncian guardado y errores.
