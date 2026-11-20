// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { buildBlockDecorations } from "./block-widgets";

interface Collected {
  atomic: number;
  widgets: number;
}

function collect(doc: string, cursor = doc.length, readOnly = false): Collected {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage }), EditorState.readOnly.of(readOnly)],
  });
  const result = buildBlockDecorations(state);

  let atomic = 0;
  result.atomic.between(0, state.doc.length, () => {
    atomic += 1;
  });

  let widgets = 0;
  result.decorations.between(0, state.doc.length, (_from, _to, value) => {
    if (value.spec.widget) {
      widgets += 1;
    }
  });

  return { atomic, widgets };
}

describe("widgets de bloque (A5)", () => {
  it("sustituye un bloque Mermaid por un widget", () => {
    const result = collect("```mermaid\ngraph TD\nA-->B\n```\n\ntexto");

    expect(result.widgets).toBe(1);
    expect(result.atomic).toBe(1);
  });

  it("revela el código Mermaid cuando el cursor está dentro", () => {
    const result = collect("```mermaid\ngraph TD\nA-->B\n```\n\ntexto", 15);

    expect(result.widgets).toBe(0);
    expect(result.atomic).toBe(0);
  });

  it("sustituye matemáticas en bloque de varias líneas", () => {
    const result = collect("$$\n\\int_0^1 x^2 dx\n$$\n\ntexto");

    expect(result.widgets).toBe(1);
    expect(result.atomic).toBe(1);
  });

  it("sustituye matemáticas \\[ ... \\] de varias líneas", () => {
    const doc = "\\[\n\\int_0^1 x^2 dx\n\\]\n\ntexto";
    const result = collect(doc);

    expect(result.widgets).toBe(1);
    expect(result.atomic).toBe(1);

    const inside = collect(doc, 4);
    expect(inside.widgets).toBe(0);
  });

  it("revela el bloque matemático con el cursor dentro", () => {
    const result = collect("$$\n\\int x\n$$\n\ntexto", 4);

    expect(result.widgets).toBe(0);
  });

  it("no interpreta $$ dentro de un bloque de código", () => {
    const result = collect("```\n$$\n```\n\ntexto");

    expect(result.widgets).toBe(0);
  });

  it("no renderiza Mermaid de otros lenguajes", () => {
    const result = collect("```js\nconst x = 1;\n```\n\ntexto");

    expect(result.widgets).toBe(0);
  });

  it("sustituye una tabla por un widget y la revela al entrar", () => {
    const doc = "| A | B |\n|---|---|\n| 1 | 2 |\n\ntexto";
    const outside = collect(doc);

    expect(outside.widgets).toBe(1);
    expect(outside.atomic).toBe(1);

    const inside = collect(doc, 3);
    expect(inside.widgets).toBe(0);
    expect(inside.atomic).toBe(0);
  });

  it("mantiene la tabla, Mermaid y las fórmulas renderizadas en solo lectura", () => {
    const table = "| A | B |\n|---|---|\n| 1 | 2 |\n\ntexto";
    const tableInside = collect(table, 3, true);
    expect(tableInside.widgets).toBe(1);
    expect(tableInside.atomic).toBe(1);

    const mermaid = "```mermaid\ngraph TD\nA-->B\n```\n\ntexto";
    const mermaidInside = collect(mermaid, 15, true);
    expect(mermaidInside.widgets).toBe(1);
    expect(mermaidInside.atomic).toBe(1);

    const math = "$$\n\\int x\n$$\n\ntexto";
    const mathInside = collect(math, 4, true);
    expect(mathInside.widgets).toBe(1);
    expect(mathInside.atomic).toBe(1);
  });
});
