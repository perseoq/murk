# Diagrama — Estados del editor

```mermaid
stateDiagram-v2
  [*] --> Inicializando
  Inicializando --> Live: documento cargado
  Live --> Componiendo: compositionstart (IME)
  Componiendo --> Live: compositionend
  Live --> WidgetActivo: foco en widget
  WidgetActivo --> Live: Esc / clic fuera
  Live --> Buscando: Ctrl+F
  Buscando --> Live: Esc
  Live --> Reemplazando: Ctrl+H
  Reemplazando --> Live: Esc
  Live --> Fuente: Ctrl+/
  Fuente --> Live: Ctrl+/
  Live --> Enfoque: F8
  Enfoque --> Live: F8
  Live --> Typewriter: F9
  Typewriter --> Live: F9
  Live --> Arrastrando: dragenter
  Arrastrando --> Live: drop / dragleave
```

## Reglas por estado

| Estado | Regla |
|---|---|
| Componiendo | Sin transacciones ni decoraciones en el rango |
| WidgetActivo | Las teclas del widget no editan el texto |
| Buscando | El foco está en el panel; `Esc` vuelve al editor |
| Fuente | Sin widgets (excepto imágenes P2) |
| Enfoque | Solo el bloque activo con opacidad completa |
| Typewriter | Línea activa centrada |
| Arrastrando | Se muestra indicador de destino |

## Prioridad

`Componiendo` > `WidgetActivo` > `Buscando` > modos de vista.

Nunca se puede entrar en `Componiendo` y `Buscando` a la vez.
