# Diagrama — Contexto y contenedores (C4)

## Nivel 1: contexto

```mermaid
flowchart LR
  U[Usuario] -->|edita Markdown| M[Murk]
  M -->|lee/escribe| F[(Sistema de archivos)]
  M -->|exporta| P[Pandoc]
  M -->|PDF| C[Chromium headless]
  M -->|actualiza| S[Servidor de releases]
  M -->|abre enlaces| B[Navegador]
```

## Nivel 2: contenedores

```mermaid
flowchart TB
  subgraph W["Ventana Tauri"]
    UI["WebView<br/>UI + CodeMirror 6"]
    CORE["Núcleo Rust<br/>comandos + eventos"]
  end
  UI <-->|IPC| CORE
  CORE --> FS[(Disco)]
  CORE --> CFG[("~/.config/murk")]
  CORE --> DAT[("~/.local/share/murk")]
  CORE -->|spawn| PAN[Pandoc]
  CORE -->|spawn| CHR[Chromium]
  CORE -->|TLS| UPD[Releases]
  UI -->|solo lectura| IMG[Protocolo murk-img]
  IMG --> FS
```

## Responsabilidades

| Contenedor | Hace | No hace |
|---|---|---|
| WebView | Editor, render, UI, estado efímero | IO directo no autorizado |
| Rust core | IO, watcher, búsqueda, exportación, persistencia | Render |
| Pandoc | Conversión DOCX/EPUB/ODT/LaTeX | Interpretar el editor |
| Chromium | Impresión a PDF | Acceso a datos del usuario |
| Servidor | Manifiesto firmado y artefactos | Recibir documentos |

## Fronteras de confianza

- El contenido del documento es **no confiable** (HTML/SVG se sanea).
- Los sidecars reciben solo rutas y argumentos validados.
- El servidor de actualizaciones nunca recibe datos del usuario.
