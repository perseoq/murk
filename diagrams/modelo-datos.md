# Diagrama — Modelo de datos

```mermaid
erDiagram
  SETTINGS {
    int version
    string theme
    string mode
    bool autosave
    string pdfEngine
  }
  SESSION {
    int version
    string workspaceRoot
    string activeFile
    json window
  }
  TAB {
    string id
    string documentId
    bool pinned
    bool preview
  }
  DOCUMENT {
    string id
    string path
    string content
    string encoding
    bool bom
    string eol
    bool dirty
    number mtime
    string mode
  }
  RECOVERY {
    string id
    string docId
    string path
    datetime createdAt
    string reason
  }
  HISTORY {
    string id
    string path
    string hash
    datetime createdAt
    string trigger
  }
  EXPORT_JOB {
    string id
    string format
    string output
    string status
  }

  SETTINGS ||--o{ SESSION : usa
  SESSION ||--o{ TAB : restaura
  TAB ||--|| DOCUMENT : muestra
  DOCUMENT ||--o{ RECOVERY : genera
  DOCUMENT ||--o{ HISTORY : versiona
  DOCUMENT ||--o{ EXPORT_JOB : exporta
```

## Archivos en disco

```text
~/.config/murk/
├── settings.json
├── session.json
├── themes/<tema>/
└── recovery/<docId>/<ts>.json

~/.local/share/murk/
├── history/index.json
├── history/<hash>.zst
├── backups/<hash>/<ts>.md
└── dictionaries/
```

## Ciclo de vida

1. Abrir → `Document` en memoria (`dirty=false`).
2. Editar → `dirty=true`, snapshots periódicos.
3. Guardar → escritura atómica, `history` si cambió, limpiar recovery.
4. Cerrar → quitar watcher, persistir sesión.
5. Crash → recovery queda hasta el siguiente arranque.
