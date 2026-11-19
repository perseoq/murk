# 14 — Atajos, corrector e IME

## 1. Atajos por defecto (Linux)

`Mod` = `Ctrl`. En macOS será `Cmd`.

### Archivo
| Acción | Atajo |
|---|---|
| Nuevo | `Mod+N` |
| Nueva ventana | `Mod+Shift+N` |
| Abrir | `Mod+O` |
| Abrir carpeta | `Mod+Shift+O` |
| Guardar | `Mod+S` |
| Guardar como | `Mod+Shift+S` |
| Guardar todo | `Mod+Alt+S` |
| Exportar | `Mod+Shift+E` |
| Imprimir | `Mod+P` |
| Preferencias | `Mod+,` |
| Cerrar pestaña | `Mod+W` |
| Salir | `Mod+Q` |

### Editar
| Acción | Atajo |
|---|---|
| Deshacer / Rehacer | `Mod+Z` / `Mod+Shift+Z` |
| Cortar / Copiar / Pegar | `Mod+X` / `Mod+C` / `Mod+V` |
| Pegar texto plano | `Mod+Shift+V` |
| Buscar | `Mod+F` |
| Buscar siguiente / anterior | `F3` / `Shift+F3` |
| Reemplazar | `Mod+H` |
| Buscar en archivos | `Mod+Shift+F` |
| Seleccionar todo | `Mod+A` |

### Formato
| Acción | Atajo |
|---|---|
| Negrita | `Mod+B` |
| Cursiva | `Mod+I` |
| Subrayado | `Mod+U` |
| Tachado | `Alt+Shift+5` |
| Código en línea | ``Mod+Shift+` `` |
| Enlace | `Mod+K` |
| Imagen | `Mod+Shift+I` |
| Limpiar formato | `Mod+\` |

### Párrafo
| Acción | Atajo |
|---|---|
| Título 1–6 | `Mod+1` … `Mod+6` |
| Párrafo | `Mod+0` |
| Aumentar/disminuir nivel | `Mod+]` / `Mod+[` |
| Cita | `Mod+Shift+Q` |
| Lista viñetas | `Mod+Shift+8` |
| Lista numerada | `Mod+Shift+7` |
| Lista de tareas | `Mod+Shift+9` |
| Bloque de código | `Mod+Shift+K` |
| Fórmula | `Mod+Shift+M` |
| Tabla | `Mod+Shift+T` |
| Línea horizontal | `Mod+Shift+R` |

### Vista
| Acción | Atajo |
|---|---|
| Modo fuente | `Mod+/` |
| Modo enfoque | `F8` |
| Máquina de escribir | `F9` |
| Barra lateral | `Mod+Shift+1` |
| Pantalla completa | `F11` |
| Zoom + / − / 0 | `Mod+=` / `Mod+-` / `Mod+0` |

## 2. Personalización

`settings.json → keybindings`:

```json
{
  "keybindings": {
    "format.bold": "Mod+Alt+B",
    "view.source": "Mod+Shift+M"
  }
}
```

- Formato: `Mod+[Alt+][Shift+]<tecla>`.
- Detección de conflictos: muestra el comando en conflicto y no aplica.
- Restablecer individual o todo.
- Los atajos del sistema tienen prioridad; si no se pueden capturar, se avisa.
- Editor visual en Preferencias → Atajos con búsqueda.

## 3. Corrector ortográfico

- Motor: Nuspell o Hunspell vía Rust; diccionarios en `~/.local/share/murk/dictionaries/`.
- Idiomas: se detectan los instalados en el sistema; por documento se puede fijar uno.
- Subrayado ondulado en palabras desconocidas (decoración de CM6, no HTML nativo).
- Menú contextual: sugerencias (máx. 5), “Añadir al diccionario”, “Ignorar”, “Idiomas…”.
- No corrige dentro de código, URLs, fórmulas ni frontmatter.
- Diccionario personal en `~/.config/murk/dictionaries/user.txt`.
- Desactivado por defecto en documentos > 1 MB.

## 4. IME (entrada de métodos)

- Soporte de ibus y fcitx5 en Wayland y X11.
- Reglas duras:
  1. No se despacha ninguna transacción durante la composición.
  2. Las decoraciones no se recalculan sobre el rango en composición.
  3. Enter/Tab durante composición pertenecen al IME, no al editor.
- Pruebas manuales obligatorias: español (tildes), japonés (kana→kanji), chino (pinyin), coreano (hangul).
- Barra de estado indica el idioma activo del corrector, no el del IME.

## 5. Portapapeles

- Copiar selección: Markdown crudo; “Copiar como HTML” en menú contextual (P1).
- Pegar HTML: conversión a Markdown.
- Pegar imagen: ver 09.
- Pegar texto enriquecido de navegador: conserva enlaces, listas y énfasis.

## 6. Criterios de aceptación

1. Todos los atajos funcionan con el foco en el editor y no colisionan con el IME.
2. Un atajo conflictivo se rechaza con mensaje claro.
3. El corrector no marca código ni URLs.
4. Escribir con IME no duplica ni pierde caracteres en 1 000 composiciones.
5. Los atajos persisten y se pueden restablecer.
