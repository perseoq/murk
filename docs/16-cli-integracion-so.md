# 16 — CLI e integración con el sistema

## 1. CLI

```text
murk [opciones] [archivos…]

Opciones:
  -n, --new-window        Abre una ventana nueva
  -w, --wait              Espera a que se cierre la pestaña
  --export <formato>      html | pdf | docx | epub | odt | latex | md
  -o, --output <ruta>     Destino de exportación
  --page <A4|Letter|Legal>
  --margin <mm>
  --theme <id>
  --headless              Sin interfaz (solo exportación)
  --version               Muestra la versión
  -h, --help              Ayuda
```

Reglas:

- `murk archivo.md` abre el archivo; si ya está abierto, enfoca la pestaña.
- Sin argumentos: restaura la sesión o muestra la bienvenida.
- `-` lee Markdown de stdin y abre un documento sin título.
- `--wait` es útil para `git commit -e`.
- Códigos de salida: `0` éxito, `1` error de uso, `2` error de archivo, `3` exportación fallida.

## 2. Instancia única

- Al iniciar, si ya hay una instancia, se envía la solicitud por socket UNIX (`$XDG_RUNTIME_DIR/murk.sock`) y se cierra.
- Formato del mensaje: JSON `{action: "open", paths: [...]}`.
- Si el socket está obsoleto, se elimina y se arranca normalmente.
- `--new-window` fuerza una instancia nueva.

## 3. Escritorio (Linux)

- `.desktop` instalado en `/usr/share/applications/murk.desktop` (paquete) o `~/.local/share/applications/` (usuario).
- Acciones: nueva ventana, abrir carpeta, abrir reciente.
- Iconos en `/usr/share/icons/hicolor/{scalable,128x128,64x64}/apps/murk.*`.
- Asociaciones MIME: `text/markdown`, `text/x-markdown`, `text/plain` (opcional), extensiones `.md`, `.markdown`, `.mdown`, `.mkd`, `.mdwn`.
- “Abrir con Murk” desde el gestor de archivos.
- `gio open archivo.md` funciona tras registrar la asociación.

### Ejemplo `.desktop`

```ini
[Desktop Entry]
Type=Application
Name=Murk
Comment=Editor de Markdown con preview en vivo
Exec=murk %F
Icon=murk
Terminal=false
Categories=Office;TextEditor;Utility;
MimeType=text/markdown;text/x-markdown;
StartupWMClass=Murk
```

## 4. Protocolo de URL

`murk://open?path=/ruta/archivo.md` (P2)

- Solo abre rutas locales; se valida y se pide confirmación si están fuera de los directorios recientes.
- No se aceptan URLs `http(s)` en el protocolo (evita abusos).

## 5. Integración con Git

- Detecta repositorio por `.git` al abrir carpeta.
- Muestra rama en la barra de estado (P2).
- Historial local es independiente de Git; no ejecuta `git` sin acción del usuario.
- `--wait` permite usarlo como editor (`GIT_EDITOR="murk --wait"`).

## 6. Portapapeles y selección

- “Abrir desde portapapeles” (P2).
- Selección de texto del sistema para “nuevo documento desde selección” (P2).

## 7. Criterios de aceptación

1. `murk a.md b.md` abre dos pestañas en una sola ventana.
2. Una segunda invocación enfoca la instancia existente.
3. `murk --export pdf a.md -o a.pdf` funciona sin abrir ventana.
4. El `.desktop` aparece en el menú de aplicaciones tras instalar.
5. `xdg-open` de un `.md` usa Murk si es el predeterminado.
6. Los errores de CLI salen por stderr con código ≠ 0.
