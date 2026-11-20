// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { ensureSyntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { buildPreviewDecorations } from "./live-preview";

function markers(doc: string): string[] {
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [markdown({ base: markdownLanguage })],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  const result = buildPreviewDecorations(state, { from: 0, to: state.doc.length });
  const texts: string[] = [];

  result.decorations.between(0, state.doc.length, (_from, _to, value) => {
    const widget = value.spec.widget as { text?: unknown; toDOM?: () => HTMLElement } | undefined;
    if (widget && typeof widget.text === "string" && widget.toDOM) {
      texts.push(widget.toDOM().textContent ?? "");
    }
  });

  return texts;
}

describe("marcadores de lista renderizados", () => {
  it("pinta las viñetas personalizadas del frontmatter", () => {
    const doc =
      "---\nmurk:\n  lists:\n    '0':\n      bullet: check\n    '1':\n      marker: upper-alpha\n---\n\n- uno\n- dos\n\n1. a\n2. b\n";
    expect(markers(doc)).toEqual(["✔", "✔", "A)", "B)"]);
  });

  it("pinta flechas y puntos blancos", () => {
    const arrow = "---\nmurk:\n  lists:\n    '0':\n      bullet: arrow\n---\n\n- uno\n- dos\n";
    expect(markers(arrow)).toEqual(["→", "→"]);

    const circle = "---\nmurk:\n  lists:\n    '0':\n      bullet: circle\n---\n\n- uno\n- dos\n";
    expect(markers(circle)).toEqual(["◦", "◦"]);
  });

  it("mantiene el punto y la numeración por defecto", () => {
    const doc = "- uno\n- dos\n\n1. a\n2. b\n";
    expect(markers(doc)).toEqual(["•", "•", "1.", "2."]);
  });
});
