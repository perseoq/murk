// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { buildPreviewDecorations } from "./live-preview";

interface Collected {
  atomic: Array<[number, number]>;
  classes: string[];
  widgets: number;
  texts: string[];
}

function collect(doc: string, cursor = doc.length, readOnly = false): Collected {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage }), EditorState.readOnly.of(readOnly)],
  });
  const result = buildPreviewDecorations(state, { from: 0, to: state.doc.length });

  const atomic: Array<[number, number]> = [];
  result.atomic.between(0, state.doc.length, (from, to) => {
    atomic.push([from, to]);
  });

  const classes: string[] = [];
  const texts: string[] = [];
  let widgets = 0;
  result.decorations.between(0, state.doc.length, (_from, _to, value) => {
    if (typeof value.spec.class === "string") {
      classes.push(value.spec.class);
    }
    if (value.spec.widget) {
      widgets += 1;
      const text = (value.spec.widget as { text?: unknown }).text;
      if (typeof text === "string") {
        texts.push(text);
      }
    }
  });

  return { atomic, classes, widgets, texts };
}

describe("live preview (A4)", () => {
  it("oculta la marca de encabezado fuera del cursor y la revela dentro", () => {
    const doc = "# Título\n\ntexto";
    const outside = collect(doc);
    expect(outside.atomic).toEqual([[0, 2]]);
    expect(outside.classes).toContain("cm-md-h1");

    const inside = collect(doc, 4);
    expect(inside.atomic).toEqual([]);
    expect(inside.classes).toContain("cm-md-h1");
  });

  it("en solo lectura renderiza todo aunque el cursor esté encima", () => {
    const doc = "# Título\n\ntexto";

    const editing = collect(doc, 4);
    expect(editing.atomic).toEqual([]);

    const reading = collect(doc, 4, true);
    expect(reading.atomic).toEqual([[0, 2]]);
    expect(reading.classes).toContain("cm-md-h1");

    const emphasis = collect("**fuerte** y *énfasis*\n\ntexto", 4, true);
    expect(emphasis.atomic).toContainEqual([0, 2]);
    expect(emphasis.atomic).toContainEqual([8, 10]);
    expect(emphasis.atomic).toContainEqual([13, 14]);
    expect(emphasis.atomic).toContainEqual([21, 22]);
  });

  it("oculta las marcas de énfasis y fuerte", () => {
    const outside = collect("**fuerte** y *énfasis*\n\ntexto");
    expect(outside.atomic).toEqual([
      [0, 2],
      [8, 10],
      [13, 14],
      [21, 22],
    ]);

    const inside = collect("**fuerte** y *énfasis*\n\ntexto", 4);
    expect(inside.atomic).not.toContainEqual([0, 2]);
    expect(inside.atomic).toContainEqual([13, 14]);
  });

  it("oculta enlaces y marca el texto enlazado", () => {
    const result = collect("[enlace](https://x.com)\n\ntexto");

    expect(result.atomic.length).toBeGreaterThanOrEqual(4);
    expect(result.classes).toContain("cm-md-link");
  });

  it("marca el encabezado y los extremos del bloque de código", () => {
    const result = collect("```js\nconst x = 1;\n```\n\ntexto");
    expect(result.classes).toContain("cm-md-code-header");
    expect(result.classes.some((name) => name.includes("cm-md-code-first"))).toBe(true);
    expect(result.classes.some((name) => name.includes("cm-md-code-last"))).toBe(true);
  });

  it("marca las líneas de lista para aplicar estilos", () => {
    const result = collect("- uno\n- dos\n");
    expect(result.classes).toContain("cm-md-list-item");
  });

  it("usa viñetas y numeración personalizadas del frontmatter", () => {
    const doc =
      "---\nmurk:\n  lists:\n    '0':\n      bullet: check\n    '1':\n      marker: upper-alpha\n---\n\n- uno\n- dos\n\n1. a\n2. b\n";
    const result = collect(doc);

    expect(result.texts).toContain("✔");
    expect(result.texts).toContain("A)");
    expect(result.texts).toContain("B)");
    expect(result.texts).not.toContain("•");
  });

  it("acepta los delimitadores MathJax \\( \\) y \\[ \\]", () => {
    const inline = collect("Texto \\(x^2\\) final\n\nresto");
    expect(inline.widgets).toBeGreaterThan(0);

    const block = collect("\\[\\int_0^1 x\\,dx\\]\n\nresto");
    expect(block.widgets).toBeGreaterThan(0);
  });

  it("oculta los backticks de código en línea", () => {
    const result = collect("`código`\n\ntexto");

    expect(result.atomic).toEqual([
      [0, 1],
      [7, 8],
    ]);
    expect(result.classes).toContain("cm-md-inline-code");
  });

  it("colapsa las vallas y mantiene la cabecera del bloque", () => {
    const doc = "```js\nconst x = 1;\n```\n\ntexto";
    const outside = collect(doc);

    expect(outside.atomic).toEqual([
      [0, 5],
      [19, 22],
    ]);
    expect(outside.classes.filter((name) => name === "cm-md-collapsed-line")).toHaveLength(1);
    expect(outside.classes).toContain("cm-md-code-header");
    expect(outside.classes.some((name) => name.includes("cm-md-code-line"))).toBe(true);

    const inside = collect(doc, 10);
    expect(inside.atomic).toEqual([
      [0, 5],
      [19, 22],
    ]);
    expect(inside.classes).toContain("cm-md-code-header");
  });

  it("reemplaza las viñetas por widgets", () => {
    const result = collect("- uno\n- dos");

    expect(result.widgets).toBe(2);
    expect(result.atomic).toEqual([
      [0, 1],
      [6, 7],
    ]);
  });

  it("oculta la marca de cita y añade estilo de bloque", () => {
    const result = collect("> cita");

    expect(result.atomic).toEqual([[0, 2]]);
    expect(result.classes).toContain("cm-md-quote");
  });

  it("reemplaza la línea horizontal por un widget", () => {
    const result = collect("---\n\ntexto");
    expect(result.widgets).toBe(1);
    expect(result.atomic).toEqual([[0, 3]]);
  });

  it("oculta el subrayado de los encabezados Setext", () => {
    const result = collect("Título\n===\n\ntexto");

    expect(result.classes).toContain("cm-md-h1");
    expect(result.classes).toContain("cm-md-collapsed-line");
    expect(result.atomic).toEqual([[7, 10]]);
  });

  it("combina cita y encabezado en la misma línea", () => {
    const result = collect("> # Título\n\ntexto");

    expect(result.classes).toContain("cm-md-quote");
    expect(result.classes).toContain("cm-md-h1");
  });

  it("reemplaza imágenes por widgets y revela la sintaxis al entrar", () => {
    const outside = collect("![alt](img/foto.png)\n\ntexto");
    expect(outside.widgets).toBe(1);
    expect(outside.atomic).toHaveLength(1);

    const inside = collect("![alt](img/foto.png)\n\ntexto", 3);
    expect(inside.widgets).toBe(0);
  });

  it("renderiza matemáticas en línea y en bloque de una línea", () => {
    const inline = collect("$E=mc^2$\n\ntexto");
    expect(inline.widgets).toBe(1);
    expect(inline.atomic).toHaveLength(1);

    const block = collect("$$x^2$$\n\ntexto");
    expect(block.widgets).toBe(1);

    const escaped = collect("cuesta \\$5\n\ntexto");
    expect(escaped.widgets).toBe(0);
  });

  it("convierte las marcas de tarea en checkboxes", () => {
    const result = collect("- [ ] tarea\n- [x] hecha\n\ntexto");

    expect(result.widgets).toBe(4); // dos viñetas + dos checkboxes
    expect(result.atomic).toHaveLength(4);
  });
});
