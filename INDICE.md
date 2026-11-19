# Índice de la documentación

## Orden de lectura recomendado

1. `README.md` — qué es Murk y qué significa paridad.
2. `docs/00-vision-alcance.md` — objetivos y límites.
3. `docs/01-legal-licencia.md` — GPLv3 y origen limpio.
4. `docs/02-arquitectura.md` — cómo se construye.
5. `docs/03-modelo-datos.md` — entidades y persistencia.
6. `docs/04-ui-ux-preferencias.md` — interfaz y ajustes.
7. `docs/05-editor-live-preview.md` — el corazón del editor.
8. `docs/06-markdown-gfm.md` — dialecto soportado.
9. `docs/07-tablas.md` a `docs/12-exportacion.md` — funciones principales.
10. `docs/13-temas-css.md` a `docs/19-accesibilidad-i18n.md` — personalización, sistema y calidad.
11. `docs/20-empaquetado-actualizaciones.md` a `docs/23-glosario.md` — entrega y operación.
12. `specs/matriz-paridad-typora.md` — checklist de paridad.
13. `flows/` y `diagrams/` — comportamiento y arquitectura visual.
14. `adr/` — por qué se tomó cada decisión.

## Árbol

```text
murk/
├── README.md
├── INDICE.md
├── AGENT_PHASES.md     plan de ejecución por fases agénticas
├── LICENSE.md          GPL-3.0 (texto completo)
├── NOTICE.md           licencias de terceros
├── CONTRIBUTING.md     cómo contribuir
├── docs/               especificación funcional (24 documentos)
├── flows/              flujos en Mermaid (8)
├── diagrams/           arquitectura y estados (5)
├── specs/              matriz, criterios, casos borde, plantilla
└── adr/                decisiones de arquitectura (5)
```

## Documentos por tema

| Tema | Documentos |
|---|---|
| Producto | `docs/00`, `docs/22`, `specs/matriz-paridad-typora.md` |
| Legal | `docs/01`, `NOTICE.md`, `LICENSE.md`, `adr/0005-gplv3.md` |
| Arquitectura | `docs/02`, `docs/03`, `diagrams/` , `adr/0001`, `adr/0002` |
| Editor | `docs/05`, `docs/06`, `docs/07`, `docs/08`, `docs/14` |
| Archivos | `docs/09`, `docs/10`, `docs/11` |
| Salida | `docs/12`, `docs/13`, `adr/0003` |
| Sistema | `docs/16`, `docs/20`, `docs/18` |
| Calidad | `docs/17`, `docs/19`, `docs/21`, `specs/` |
| Flujos | `flows/` |

## Convenciones

- Idioma de la documentación: español.
- Un tema por archivo; nombres en kebab-case.
- Diagramas en Mermaid dentro de bloques de código.
- Prioridades: P0, P1, P2.
- Estado de cada función: `spec`, `wip`, `done`.
- Toda decisión relevante se registra en `adr/`.
