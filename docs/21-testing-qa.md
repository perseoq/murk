# 21 — Testing y QA

## 1. Pirámide

| Nivel | Herramienta | Cobertura |
|---|---|---|
| Unitario Rust | `cargo test` | fs, encoding, export args, búsqueda |
| Unitario TS | Vitest | comandos, decoraciones, utilidades |
| Integración | Vitest + mocks IPC | flujos de documento |
| E2E | Playwright + `tauri-driver` | flujos de usuario |
| Golden Markdown | corpus → HTML/AST | fidelidad |
| Rendimiento | benchmarks en CI | regresiones |
| Accesibilidad | axe-core | vistas principales |
| Manual | checklist | IME, Wayland, impresión |

## 2. Corpus Markdown

`tests/fixtures/`:

```text
basic.md              # CommonMark básico
gfm-tables.md         # tablas, alineación, escapes
gfm-tasks.md          # listas de tareas
code-fences.md        # lenguajes, anidados, info strings
math.md               # inline, bloque, errores
mermaid.md            # todos los tipos
images.md             # relativas, absolutas, rotas
frontmatter.md        # YAML/TOML/JSON
links.md              # relativos, externos, anclas
unicode.md            # CJK, RTL, emoji, combinados
large-100k.md         # rendimiento
large-10m.md          # degradación
nasty.md              # HTML, scripts, entidades, escapes
```

Cada fixture tiene su salida esperada (HTML/snapshot) y se ejecuta en cada PR.

## 3. Pruebas críticas (P0)

1. Abrir → editar → guardar preserva bytes no modificados.
2. CRLF/BOM/encoding se conservan.
3. Recuperación tras `kill -9`.
4. Conflicto de edición externa.
5. Exportar PDF/DOCX con tablas, código, math y mermaid.
6. Atajos principales.
7. Búsqueda/reemplazo con regex.
8. Cierre con cambios (3 opciones).
9. IME sin duplicación.
10. Actualización firmada.

## 4. E2E

- `tauri-driver` + WebDriver (WebKitGTK).
- Cada prueba parte de un perfil temporal (`XDG_CONFIG_HOME` aislado).
- Capturas en fallo.
- Se ejecutan en CI con Xvfb/Weston headless.
- Tiempo máximo por prueba: 60 s.

## 5. Matriz manual por release

| Área | Casos |
|---|---|
| Wayland/X11 | Arranque, IME, portapapeles, diálogos |
| Escalado | 100/150/200 %, HiDPI |
| Fuentes | Noto, DejaVu, CJK |
| Archivos | red, permisos, symlinks, disco lleno |
| Exportación | con/sin pandoc, con/sin chromium |
| Temas | claro/oscuro/sistema, tema de usuario |
| Accesibilidad | teclado, Orca |

## 6. Criterios de calidad

- Cobertura de líneas ≥ 70 % en módulos críticos (fs, export, recovery).
- 0 errores de `clippy -D warnings`.
- 0 violaciones críticas de axe.
- Sin regresiones de rendimiento > 20 %.
- Todo bug corregido lleva prueba de regresión.

## 7. Gestión de bugs

| Severidad | Definición | SLA |
|---|---|---|
| S1 | Pérdida/corrupción de datos, crash al arrancar | 24 h |
| S2 | Función principal rota | 7 días |
| S3 | Molesto con workaround | próximo release |
| S4 | Cosmético | backlog |

Plantilla de issue: versión, SO, pasos, esperado, obtenido, log, fixture.
