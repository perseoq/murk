# Flujo — Arranque

## Objetivo
Iniciar Murk en ≤ 1,5 s, restaurar la sesión y estar listo para editar.

```mermaid
flowchart TD
  A[Ejecutar murk] --> B{¿instancia activa?}
  B -- sí --> C[Enviar open al socket]
  C --> D[Enfocar ventana]
  D --> Z[Fin]
  B -- no --> E[Cargar ajustes]
  E --> F{¿JSON válido?}
  F -- no --> G[Renombrar a .bak y usar defaults]
  F -- sí --> H[Crear ventana]
  G --> H
  H --> I{¿restoreSession?}
  I -- no --> J[Mostrar bienvenida]
  I -- sí --> K[Cargar sesión]
  K --> L{¿cierre limpio?}
  L -- no --> M[Ofrecer recuperación]
  L -- sí --> N[Reabrir archivos existentes]
  M --> O[Diálogo de recuperación]
  N --> P[Restaurar cursor y scroll]
  O --> P
  J --> Q[Primer frame editable]
  P --> Q
  Q --> R[Quitar splash]
```

## Pasos
1. Parsear CLI (`archivos`, `--new-window`, `--headless`).
2. Comprobar socket de instancia única.
3. Cargar `settings.json`, validar versión y migrar.
4. Crear ventana con tamaño guardado.
5. Cargar `session.json` si está activo.
6. Detectar cierre anómalo (marcador `clean-exit`).
7. Abrir documentos y posiciones.
8. Registrar watchers de los archivos abiertos.

## Ramas de error
| Error | Resultado |
|---|---|
| Ajustes corruptos | Backup `.bak`, defaults, aviso |
| Archivo de sesión inexistente | Bienvenida |
| Archivo de sesión con rutas muertas | Se omiten, aviso discreto |
| Sin permisos de config | Modo efímero con aviso |
| WebKit no disponible | Error fatal con instrucciones |

## Criterios
- Sin red.
- Sin diálogo modal en arranque normal.
- La ventana aparece aunque la sesión tarde; el contenido carga después.
