# Diagrama — Estados del documento

```mermaid
stateDiagram-v2
  [*] --> Cerrado
  Cerrado --> Abriendo: open
  Abriendo --> Limpio: éxito
  Abriendo --> Error: fallo
  Error --> Cerrado: descartar
  Limpio --> Sucio: edición
  Sucio --> Sucio: edición / snapshot
  Sucio --> Guardando: save
  Guardando --> Limpio: ok
  Guardando --> Sucio: error (se conserva buffer)
  Limpio --> Conflicto: cambio externo
  Sucio --> Conflicto: cambio externo
  Conflicto --> Limpio: recargar
  Conflicto --> Sucio: mantener
  Limpio --> Huerfano: borrado externo
  Sucio --> Huerfano: borrado externo
  Huerfano --> Sucio: guardar recrea
  Limpio --> Cerrado: close
  Sucio --> Cerrando: close
  Cerrando --> Guardando: guardar
  Cerrando --> Cerrado: descartar
  Cerrando --> Sucio: cancelar
```

## Invariantes

| Estado | Invariante |
|---|---|
| Limpio | `content` == disco |
| Sucio | `content` ≠ disco |
| Guardando | No se aceptan nuevas escrituras simultáneas |
| Conflicto | No se autoguarda |
| Huérfano | No se autoguarda hasta decisión |
| Cerrado | Sin watcher ni snapshots |

## Transiciones prohibidas

- Limpio → Cerrado sin comprobar disco.
- Conflicto → Guardando automático.
- Sucio → Cerrado sin diálogo.
- Cualquier estado → Abriendo si ya está abierto.
