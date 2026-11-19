# 18 — Seguridad y privacidad

## 1. Principios

1. **Local por defecto**: sin red para abrir, editar, guardar ni exportar.
2. **Mínimo privilegio**: la WebView no accede al disco salvo por comandos autorizados.
3. **Sin telemetría** por defecto; si se añade, opt-in explícito y transparente.
4. **Contenido no confiable**: todo HTML/SVG de usuario se sanea.
5. **Actualizaciones firmadas**.

## 2. Modelo de amenazas

| Amenaza | Vector | Mitigación |
|---|---|---|
| Documento malicioso | HTML/JS/SVG embebido | Sanitización, CSP, sin `unsafe-eval` |
| Enlace malicioso | `javascript:`, `file:` | Lista blanca de esquemas |
| Escape de rutas | `../` en imágenes/enlaces | Scope por documento y validación canónica |
| Comando inyectado | Exportación Pandoc/Chromium | Argumentos como array, sin shell, listas blancas |
| Sidecar comprometido | Binario falso en `PATH` | Rutas absolutas configurables, verificación de ejecutable |
| XSS en Mermaid | `click`/labels | `securityLevel: strict`, saneado del SVG |
| Actualización falsa | Manifiesto alterado | Firma minisign + TLS |
| Fuga de datos | Logs/caché | Sin contenido en logs; caché local |

## 3. Tauri

- `capabilities/` por ventana; sin `fs:default`.
- Comandos expuestos explícitamente; ningún comando genérico de shell.
- `asset` protocol limitado al directorio del documento abierto.
- CSP:

```text
default-src 'self';
img-src 'self' murk-img: data:;
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
script-src 'self';
connect-src 'self';
object-src 'none';
frame-src 'none';
base-uri 'none';
form-action 'none';
```

- Sin `devtools` en release.
- Firma y notarización de binarios cuando aplique.

## 4. Sanitización

- Lista blanca de etiquetas y atributos (ver 06 §5).
- Eliminar `<script>`, `<iframe>`, `<object>`, `<embed>`, `on*`, `javascript:`.
- SVG: eliminar `script`, `foreignObject`, animaciones SMIL y referencias externas.
- Enlaces externos: `rel="noopener noreferrer"`.
- Mermaid: sanitizar el SVG resultante además de `securityLevel`.

## 5. Privacidad

| Dato | Dónde | Sale del equipo |
|---|---|---|
| Documentos | Disco del usuario | Nunca |
| Ajustes/sesión | `~/.config/murk` | Nunca |
| Historial | `~/.local/share/murk` | Nunca |
| Logs | `~/.cache/murk` | Solo si el usuario los comparte |
| Crash reports | Local | No se envían |
| Uso/telemetría | — | No existe por defecto |

- El usuario puede borrar todos los datos desde Preferencias → Avanzado.
- No se leen documentos fuera de los directorios abiertos.

## 6. Actualizaciones

- Manifiesto firmado con minisign/Ed25519; clave pública embebida.
- Se verifica firma y hash antes de instalar.
- HTTPS obligatorio; sin HTTP plano.
- Rollback disponible si la nueva versión no arranca (retención de la anterior).

## 7. Respuesta a incidentes

1. Issue privado o correo de seguridad.
2. Parche en rama privada, release firmado.
3. Aviso público con CVE si aplica.
4. Rotación de clave si se compromete la firma.
