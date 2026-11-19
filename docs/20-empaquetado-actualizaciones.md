# 20 — Empaquetado, distribución y actualizaciones

## 1. Artefactos

| Formato | Uso | Notas |
|---|---|---|
| `.rpm` | Fedora/RHEL | Dependencias declaradas |
| `.deb` | Debian/Ubuntu | Dependencias declaradas |
| AppImage | Universal | Sin instalación; updater opcional |
| `.tar.gz` | Portable | `murk` + recursos |
| Flatpak | P2 | Sandbox, portales |
| Snap | P3 | — |

## 2. Dependencias de ejecución (Linux)

```text
webkit2gtk4.1, gtk3, librsvg2, libxdo, openssl
Opcional: pandoc, texlive-xetex, chromium
```

El paquete **no** debe empaquetar WebKitGTK; se usa el del sistema (seguridad y tamaño).

## 3. Compilación

```bash
npm ci
npm run build            # frontend
cargo tauri build        # bundles en src-tauri/target/release/bundle
```

- Build reproducible: `SOURCE_DATE_EPOCH`, lockfiles, toolchain fijado.
- CI con matriz: Fedora (rpm), Debian (deb), AppImage.
- Cache de `cargo` y `npm`.
- Artefactos firmados y con SHA-256 publicado.

## 4. Estructura instalada

```text
/usr/bin/murk
/usr/lib/murk/                  # binario + recursos
/usr/share/applications/murk.desktop
/usr/share/icons/hicolor/.../murk.png
/usr/share/licenses/murk/LICENSE.md
```

Configuración del usuario en `~/.config/murk/` (nunca en `/usr`).

## 5. Versionado

- SemVer `MAJOR.MINOR.PATCH`.
- `MAJOR`: cambios incompatibles de formato de ajustes/sesión.
- `MINOR`: funciones nuevas compatibles.
- `PATCH`: correcciones.
- Cada release: changelog, notas, checksums, firma.

## 6. Actualizaciones

- Plugin `tauri-plugin-updater` + manifiesto firmado.
- Canales: `stable`, `beta`.
- Descarga en segundo plano; nunca instala mientras hay documentos sin guardar.
- Verificación de firma Ed25519 y hash.
- Si falla, se conserva la versión actual.
- Aviso discreto: “Actualización disponible”; opción “instalar al salir”.

### Manifiesto (ejemplo)

```json
{
  "version": "1.0.1",
  "pub_date": "2026-03-01T12:00:00Z",
  "platforms": {
    "linux-x86_64": {
      "signature": "…",
      "url": "https://ejemplo/murk_1.0.1_amd64.AppImage"
    }
  }
}
```

## 7. Release checklist

- [ ] Matriz P0/P1 al 100 % para la versión.
- [ ] CI verde en las tres plataformas de paquete.
- [ ] Pruebas manuales de flujos críticos.
- [ ] Changelog y notas.
- [ ] Checksums y firmas.
- [ ] `LICENSE.md` y `NOTICE.md` incluidos.
- [ ] Fuente de la versión publicada (tag).
- [ ] Verificación de instalación limpia y actualización.

## 8. Desinstalación

- Elimina binarios y `.desktop`; **no** borra `~/.config/murk` ni `~/.local/share/murk` (se indica al usuario).
- Opción documentada para borrar datos.

## 9. Criterios de aceptación

1. Instalar el `.rpm` en Fedora limpia y abrir un `.md` funciona.
2. La actualización verifica firma y no pierde ajustes.
3. Una actualización fallida no rompe la instalación existente.
4. Los paquetes incluyen licencia y avisos.
5. El binario no requiere red para arrancar.
