// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import {
  findFrontmatter,
  frontmatterSummary,
  setTableWidths,
  tableWidthsFromState,
} from "./frontmatter";

function state(document: string): EditorState {
  return EditorState.create({ doc: document });
}

function fakeView(initial: EditorState): { view: EditorView; current: () => EditorState } {
  let current = initial;
  const view = {
    get state() {
      return current;
    },
    dispatch(spec: Parameters<EditorState["update"]>[0]) {
      current = current.update(spec).state;
    },
  } as unknown as EditorView;
  return { view, current: () => current };
}

describe("frontmatter YAML", () => {
  it("detecta y parsea el bloque inicial", () => {
    const document =
      "---\ntitle: Hola\nmurk:\n  tableWidths:\n    '0':\n      - 120\n      - 200\n---\n\n# Doc";
    const block = findFrontmatter(state(document));
    expect(block?.data.title).toBe("Hola");
    expect(tableWidthsFromState(state(document))["0"]).toEqual([120, 200]);
  });

  it("ignora documentos sin frontmatter o con YAML inválido", () => {
    expect(findFrontmatter(state("# Hola"))).toBeNull();
    expect(findFrontmatter(state("---\n: : :\n---"))).toBeNull();
  });

  it("resume el número de campos", () => {
    const block = findFrontmatter(state("---\ntitle: Doc\nauthor: Rey\n---\n\nx"));
    expect(block).not.toBeNull();
    if (block) {
      expect(frontmatterSummary(block)).toBe("2 campos");
    }
  });

  it("guarda anchuras conservando el resto de claves", () => {
    const { view, current } = fakeView(state("---\ntitle: Doc\n---\n\n# Hola"));

    setTableWidths(view, 1, [150, 220]);

    const block = findFrontmatter(current());
    expect(block?.data.title).toBe("Doc");
    expect(tableWidthsFromState(current())["1"]).toEqual([150, 220]);
    expect(current().doc.toString().startsWith("---\n")).toBe(true);
    expect(current().doc.toString()).toContain("# Hola");
  });

  it("crea el frontmatter cuando no existe", () => {
    const { view, current } = fakeView(state("# Hola"));

    setTableWidths(view, 0, [100]);

    expect(tableWidthsFromState(current())["0"]).toEqual([100]);
    expect(current().doc.toString()).toContain("# Hola");
    expect(current().doc.toString().startsWith("---\n")).toBe(true);
  });
});
