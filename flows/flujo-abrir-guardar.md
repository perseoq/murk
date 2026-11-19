# Flujo — Abrir y guardar

```mermaid
sequenceDiagram
  actor U as Usuario
  participant UI as UI
  participant R as Rust
  participant FS as Disco

  U->>UI: Abrir archivo
  UI->>R: file_open(path)
  R->>FS: stat + read
  FS-->>R: bytes
  R->>R: detectar encoding/BOM/EOL
  R-->>UI: DocumentPayload
  UI->>UI: crear pestaña + EditorState
  UI->>R: dir_watch(dirname)

  U->>UI: Editar
  UI->>UI: dirty = true

  U->>UI: Ctrl+S
  UI->>R: file_save(path, content, encoding, eol)
  R->>FS: escribir .tmp + fsync
  R->>FS: rename(.tmp, path)
  R-->>UI: SaveResult(mtime, size)
  UI->>UI: dirty = false
  UI->>R: recovery_delete(docId)
```

## Reglas
1. Abrir un archivo ya abierto enfoca su pestaña.
2. Guardar sin ruta → diálogo Guardar como.
3. El guardado es atómico; si falla, el original no cambia.
4. No se reescribe si `dirty=false` (mtime intacto).
5. Encoding y EOL se conservan salvo cambio explícito.

## Guardar como

```mermaid
flowchart TD
  A[Ctrl+Shift+S] --> B[Diálogo nativo]
  B --> C{¿existe?}
  C -- sí --> D[Confirmar sobrescritura]
  C -- no --> E[Guardar]
  D --> E
  E --> F[Actualizar pestaña y watcher]
```

## Conflictos
| Caso | Acción |
|---|---|
| Cambió en disco sin cambios locales | Recarga silenciosa |
| Cambió en disco con cambios locales | Recargar / Mantener / Comparar |
| Archivo borrado | Marcar huérfana; guardar recrea previa confirmación |
| Sin permisos | Mantener buffer; ofrecer Guardar como |
