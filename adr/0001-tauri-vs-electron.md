# ADR 0001 — Tauri v2 en lugar de Electron

- **Estado:** aceptado
- **Fecha:** 2026-11-19
- **Decisores:** equipo Murk

## Contexto

Se necesita una app de escritorio Linux (y potencialmente Windows/macOS) con WebView, acceso a archivos, watcher y ejecución de procesos externos. Typora usa Electron, pero replicarlo no obliga a usar la misma tecnología.

## Decisión

Usar **Tauri v2** con frontend TypeScript y núcleo Rust.

## Motivos

1. Binario y memoria mucho menores que Electron.
2. Seguridad por capacidades y CSP más estricta.
3. Rust encaja con IO intensivo, watcher y búsqueda.
4. Empaquetado deb/rpm/AppImage soportado.
5. WebKitGTK disponible en Fedora/Ubuntu (enlace dinámico, LGPL).

## Consecuencias

**Positivas**
- Instalador ~10–20 MB frente a ~100 MB.
- Arranque y RAM mejores.
- API de comandos tipada.

**Negativas**
- WebKitGTK no es Chromium: diferencias de CSS/JS y depuración más difícil.
- PDF de alta fidelidad requiere sidecar Chromium.
- Menos ecosistema de ejemplos que Electron.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Electron | Tamaño/RAM; CSP más laxa por defecto |
| Qt/QML nativo | Ecosistema de edición Markdown maduro en web |
| Flutter | Editor de texto rico y selección menos maduros en desktop |

## Revisión

Si WebKitGTK bloquea funciones críticas (IME, PDF, rendimiento), se reevalúa con un ADR nuevo; no se cambia de stack a mitad de release.
