# Criterios de aceptación globales

Escritos en Gherkin. Cada release debe pasar los criterios de su hito y los anteriores.

## A. Integridad de datos

```gherkin
Escenario: Abrir y guardar sin cambios
  Dado un archivo Markdown con BOM, CRLF y espacios finales
  Cuando lo abro y lo guardo sin editar
  Entonces el archivo en disco es idéntico byte a byte

Escenario: Fallo de escritura
  Dado un archivo en un directorio sin permisos de escritura
  Cuando intento guardar
  Entonces veo un error claro
  Y el archivo original permanece intacto
  Y el buffer conserva mis cambios

Escenario: Recuperación tras caída
  Dado un documento con cambios sin guardar
  Cuando el proceso muere abruptamente
  Y vuelvo a abrir Murk
  Entonces se me ofrece recuperar el contenido
  Y restaurarlo no sobrescribe el archivo hasta que guarde
```

## B. Editor

```gherkin
Escenario: Preview en vivo
  Dado un párrafo con "**texto**"
  Cuando el cursor está fuera de la negrita
  Entonces los asteriscos no se ven y el texto está en negrita
  Cuando coloco el cursor dentro
  Entonces los asteriscos son visibles y editables

Escenario: IME
  Dado el IME en modo composición
  Cuando escribo caracteres compuestos
  Entonces no se pierde ni duplica ningún carácter
  Y no se disparan transacciones hasta terminar la composición
```

## C. Archivos

```gherkin
Escenario: Conflicto externo
  Dado un archivo abierto con cambios locales
  Cuando otro programa modifica el archivo
  Entonces veo un diálogo con Recargar, Mantener y Comparar
  Y no se pierde mi versión sin confirmación

Escenario: Sesión
  Dado 3 pestañas abiertas con cursor y scroll
  Cuando cierro y reabro Murk
  Entonces las 3 pestañas se restauran en el mismo estado
```

## D. Exportación

```gherkin
Escenario: PDF fiel
  Dado un documento con títulos, tabla, código, math y mermaid
  Cuando exporto a PDF
  Entonces el PDF respeta tema, márgenes y saltos
  Y no hay elementos cortados ni imágenes rotas

Escenario: Sin Pandoc
  Dado un sistema sin Pandoc
  Cuando exporto a DOCX
  Entonces recibo un mensaje que explica cómo instalarlo
  Y el PDF por Chromium sigue funcionando
```

## E. UI

```gherkin
Escenario: Cierre con cambios
  Dado un documento sucio
  Cuando cierro la pestaña
  Entonces elijo entre Guardar, Descartar y Cancelar
  Y Cancelar mantiene la pestaña abierta

Escenario: Tema
  Dado un tema de usuario válido
  Cuando lo selecciono
  Entonces se aplica en menos de 150 ms
  Y no se pierde el foco ni la posición del cursor
```

## F. Sistema

```gherkin
Escenario: Segunda instancia
  Dado Murk abierto
  Cuando ejecuto "murk otro.md"
  Entonces se abre otra.md como pestaña en la ventana existente

Escenario: Actualización manipulada
  Dado un manifiesto con firma inválida
  Cuando Murk comprueba actualizaciones
  Entonces no descarga ni instala nada
```

## G. Calidad

- 0 errores de `clippy -D warnings`.
- 0 violaciones críticas de axe-core.
- Cobertura ≥ 70 % en fs/export/recovery.
- Benchmarks sin regresión > 20 %.
- Todos los criterios P0 del release en verde.
