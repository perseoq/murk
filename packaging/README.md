# Empaquetado y release

## Construir localmente

```bash
npm ci
npm run tauri build
```

Artefactos en `src-tauri/target/release/bundle/`:

```text
deb/murk_1.0.0_amd64.deb
rpm/murk-1.0.0-1.x86_64.rpm
appimage/murk_1.0.0_amd64.AppImage
```

Requiere las dependencias de Tauri y, para DOCX/EPUB, `pandoc`.

## Firma de actualizaciones

La clave pública está en `src-tauri/tauri.conf.json` (plugin `updater`).
La clave privada **no se versiona**; en este equipo se generó en:

```text
~/.config/murk/updater.key
```

Para construir con artefactos de updater:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.config/murk/updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run tauri build -- --config src-tauri/tauri.release.conf.json
```

El resultado incluye `.sig` para cada paquete y `latest.json` si se usa
`tauri-action`.

## CI de release

`.github/workflows/release.yml` se ejecuta al publicar un tag `v*`:

1. Instala dependencias.
2. Construye con `createUpdaterArtifacts`.
3. Publica un draft de GitHub Release con `.deb`, `.rpm`, AppImage y firmas.

Secretos necesarios en GitHub:

| Secreto | Valor |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Contenido de `updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Contraseña (vacía si no tiene) |

El endpoint configurado es:

```text
https://github.com/perseoq/murk/releases/latest/download/latest.json
```

## Verificación

- [ ] `npm run build`
- [ ] `npm test`
- [ ] `cargo fmt --check`
- [ ] `cargo clippy --all-targets -- -D warnings`
- [ ] `cargo test`
- [ ] Instalar el `.rpm`/`.deb` en una máquina limpia.
- [ ] Abrir un `.md` desde el gestor de archivos.
- [ ] Exportar PDF y DOCX.
- [ ] Comprobar `murk --version` y `murk --export`.
