# Murk

**Murk** es un editor de Markdown de escritorio para Linux, rápido y ligero.
Escribe en Markdown y ve el resultado renderizado al instante, con tablas,
matemáticas, diagramas, imágenes y exportación a varios formatos.

- **Versión:** 1.2.1795195353
- **Plataforma:** Linux x86_64 (`.deb`, `.rpm` y AppImage)
- **Licencia:** GNU General Public License v3.0 o posterior

## Características

- **Vista previa en vivo** sobre el propio Markdown, sin panel dividido.
- **Markdown GFM**: encabezados, listas, tablas, tareas, citas, código,
  enlaces, imágenes, notas al pie y HTML permitido.
- **Matemáticas** con KaTeX y **diagramas** Mermaid.
- **Tablas editables**: insertar, añadir o borrar filas y columnas, alinear.
- **Espacio de trabajo**: pestañas, árbol de archivos, esquema del documento y
  búsqueda global.
- **Búsqueda y reemplazo** con expresiones regulares y búsqueda en archivos.
- **Exportación** a HTML, PDF, DOCX, EPUB y LaTeX; también desde la CLI.
- **Autoguardado** configurable, snapshots y recuperación tras un cierre
  inesperado.
- **Temas** claro, oscuro y automático según el sistema.
- **Git integrado**: configura un repositorio, haz commit y publica con un clic.
- **Actualizaciones firmadas** desde GitHub Releases.
- **CLI e integración con el escritorio**: abrir archivos, instancia única y
  asociación de archivos `.md`.

## Instalación

Descarga el paquete desde la página de
[releases](https://github.com/perseoq/murk/releases/latest).

### Debian, Ubuntu y derivados

```bash
sudo apt install ./Murk_1.2.1795195353_amd64.deb
```

### Fedora, RHEL y derivados

```bash
sudo dnf install ./Murk-1.2.1795195353-1.x86_64.rpm
```

### AppImage (cualquier distribución)

```bash
chmod +x Murk_1.2.1795195353_amd64.AppImage
./Murk_1.2.1795195353_amd64.AppImage
```

La AppImage se integra en el menú de aplicaciones la primera vez que se
ejecuta: crea su entrada `.desktop` y copia los iconos a `~/.local/share`.
Si mueves el archivo, la entrada se actualiza en el siguiente arranque.

## Primeros pasos

1. Abre Murk y crea un documento con **Ctrl+N** o abre uno con **Ctrl+O**.
2. Escribe en Markdown; el resultado se renderiza en el mismo editor.
3. Guarda con **Ctrl+S**. El autoguardado puede activarse en
   **Archivo → Autoguardado**.
4. Exporta desde **Archivo → Exportar** o con la CLI:

```bash
murk --export pdf -o salida.pdf documento.md
```

## Atajos principales

| Acción | Atajo |
|---|---|
| Nuevo / abrir / guardar | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| Guardar como | `Ctrl+Shift+S` |
| Buscar / reemplazar | `Ctrl+F` / `Ctrl+H` |
| Buscar en archivos | `Ctrl+Shift+F` |
| Negrita / cursiva / enlace | `Ctrl+B` / `Ctrl+I` / `Ctrl+K` |
| Insertar tabla | `Ctrl+Shift+T` |
| Alternar código fuente | `Ctrl+/` |
| Modo enfoque / máquina de escribir | `F8` / `F9` |
| Preferencias | `Ctrl+,` |

## Actualizaciones

Murk comprueba las actualizaciones firmadas publicadas en GitHub Releases.
Puedes buscarlas manualmente desde **Ayuda → Buscar actualizaciones**.

## Datos de la aplicación

| Ruta | Contenido |
|---|---|
| `~/.murk/config.json` | Configuración y repositorio git |
| `~/.murk/repos/` | Clones locales gestionados por Murk |
| `~/.config/murk/` | Preferencias, sesión y recuperación |

## Licencia

Murk se distribuye bajo **GPL-3.0-or-later**. Consulta `LICENSE.md` para el
texto completo y `NOTICE.md` para las licencias de terceros.

## Autor

**Rodrigo Quintanar** — creador y mantenedor
[djperseo@outlook.es](mailto:djperseo@outlook.es)

