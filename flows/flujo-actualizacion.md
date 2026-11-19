# Flujo — Actualización

```mermaid
sequenceDiagram
  participant App as Murk
  participant Upd as Servidor
  participant User as Usuario

  App->>Upd: GET manifiesto (TLS)
  Upd-->>App: versión + firma + URL
  App->>App: verificar firma Ed25519
  alt firma inválida
    App->>User: error silencioso (log)
  else versión nueva
    App->>User: aviso discreto
    User->>App: descargar
    App->>Upd: descargar artefacto
    App->>App: verificar hash + firma
    alt fallo
      App->>User: error; conservar versión
    else ok
      App->>User: instalar al salir / ahora
      App->>App: programar instalación
    end
  end
```

## Reglas
- HTTPS obligatorio.
- Nunca instalar con documentos sin guardar.
- Conservar la versión anterior para rollback.
- Canales `stable` y `beta`.
- Sin descargas automáticas en modo `offline`.

## Criterios
- Un manifiesto manipulado no instala nada.
- La actualización no borra ajustes ni sesión.
- Si el binario nuevo no arranca, se ofrece volver atrás.
