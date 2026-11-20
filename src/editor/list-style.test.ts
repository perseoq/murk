// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  bulletChar,
  listsFromState,
  listsInState,
  listsToCss,
  orderedMarker,
  rewriteListsForPandoc,
  romanNumber,
} from "./list-style";

function state(document: string): EditorState {
  return EditorState.create({
    doc: document,
    extensions: [markdown({ base: markdownLanguage })],
  });
}

describe("estilos de lista", () => {
  it("convierte números romanos", () => {
    expect(romanNumber(1)).toBe("I");
    expect(romanNumber(4)).toBe("IV");
    expect(romanNumber(9)).toBe("IX");
    expect(romanNumber(14)).toBe("XIV");
  });

  it("genera marcadores de viñeta y ordenados", () => {
    expect(bulletChar("arrow")).toBe("→");
    expect(bulletChar("check")).toBe("✔");
    expect(bulletChar("circle")).toBe("◦");
    expect(orderedMarker("lower-alpha", 2)).toBe("b)");
    expect(orderedMarker("upper-alpha", 3)).toBe("C)");
    expect(orderedMarker("upper-roman", 4)).toBe("IV)");
    expect(orderedMarker("upper-roman-dot", 4)).toBe("IV.");
    expect(orderedMarker("decimal", 7)).toBe("7.");
    expect(orderedMarker("decimal-paren", 7)).toBe("7)");
  });

  it("lee los estilos del frontmatter y localiza las listas", () => {
    const document = state(
      "---\nmurk:\n  lists:\n    '0':\n      bullet: check\n    '1':\n      marker: upper-roman\n---\n\n- uno\n- dos\n\n1. a\n2. b\n",
    );

    expect(listsFromState(document)).toEqual({
      "0": { bullet: "check" },
      "1": { marker: "upper-roman" },
    });

    const infos = listsInState(document);
    expect(infos).toHaveLength(2);
    expect(infos[0]).toMatchObject({ index: 0, ordered: false, preview: "uno" });
    expect(infos[1]).toMatchObject({ index: 1, ordered: true, preview: "a" });
  });

  it("genera CSS de exportación con contadores y viñetas", () => {
    const infos = listsInState(
      state(
        "---\nmurk:\n  lists:\n    '0':\n      bullet: arrow\n    '1':\n      marker: upper-alpha\n---\n\n- uno\n\n1. a\n",
      ),
    );
    const css = listsToCss(infos);

    expect(css).toContain("ul.murk-list-0");
    expect(css).toContain('content: "→"');
    expect(css).toContain("ol.murk-list-1");
    expect(css).toContain("counter(murk-counter-1, upper-alpha)");
  });

  it("reescribe los marcadores ordenados para Pandoc", () => {
    const document = state(
      "---\nmurk:\n  lists:\n    '0':\n      marker: upper-alpha\n---\n\n1. uno\n2. dos\n",
    );
    const rewritten = rewriteListsForPandoc(document);

    expect(rewritten).toContain("A) uno");
    expect(rewritten).toContain("B) dos");
    expect(rewritten).not.toContain("1. uno");
  });

  it("no toca las listas sin estilo personalizado", () => {
    const document = state("1. uno\n2. dos\n");
    expect(rewriteListsForPandoc(document)).toBe("1. uno\n2. dos\n");
  });
});
