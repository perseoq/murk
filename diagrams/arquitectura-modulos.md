# Diagrama — Módulos

```mermaid
flowchart TB
  subgraph Frontend
    APP[app/]
    ED[editor/]
    WS[workspace/]
    EX[export/]
    ST[settings/]
    I18N[i18n/]
  end

  subgraph Editor
    CORE[core.ts]
    LP[live-preview.ts]
    SM[source-mode.ts]
    WID[widgets/]
    CMD[commands/]
    SEARCH[search.ts]
    SPELL[spellcheck.ts]
  end

  subgraph Backend
    FC[file.rs]
    DC[dir.rs]
    WC[watch.rs]
    SC[search.rs]
    EC[export.rs]
    SEC[session.rs]
    STC[settings.rs]
    PLAT[platform/]
  end

  APP --> ED
  APP --> WS
  APP --> ST
  APP --> EX
  ED --> CORE
  CORE --> LP
  CORE --> SM
  LP --> WID
  CORE --> CMD
  ED --> SEARCH
  ED --> SPELL
  WS --> WC
  EX --> EC
  APP --> I18N

  CORE <-->|IPC| FC
  WS <-->|IPC| DC
  WS <-->|IPC| WC
  SEARCH <-->|IPC| SC
  EX <-->|IPC| EC
  APP <-->|IPC| SEC
  ST <-->|IPC| STC
  APP <-->|IPC| PLAT
```

## Acoplamiento

- `editor/` no conoce Tauri: recibe una interfaz `HostApi` inyectada.
- `workspace/` y `settings/` dependen de comandos tipados.
- `export/` reutiliza el render del editor solo a través de una API pública.
- Los widgets no acceden a red ni a disco directamente.

## Regla de dependencias

```text
ui -> app -> editor -> widgets
ui -> workspace -> host
export -> render -> editor
nunca: editor -> tauri
nunca: widgets -> fs
```
