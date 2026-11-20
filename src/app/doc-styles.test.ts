// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import {
  normalizeStyles,
  saveStyles,
  serializeStyles,
  stylesFromState,
  stylesToCss,
} from "./doc-styles";

function state(document: string): EditorState {
  return EditorState.create({ doc: document });
}

describe("estilos del documento", () => {
  it("lee y normaliza el frontmatter", () => {
    const styles = stylesFromState(
      state(
        "---\nmurk:\n  styles:\n    targets:\n      h1:\n        bold: true\n        color: '#ff0000'\n      code:\n        family: monospace\n---\n\n# Hola",
      ),
    );

    expect(styles.targets.h1).toEqual({ bold: true, color: "#ff0000" });
    expect(styles.targets.code).toEqual({ family: "monospace" });
    expect(styles.targets.h2).toBeUndefined();
  });

  it("descarta valores inválidos", () => {
    const styles = normalizeStyles({
      targets: {
        h1: { color: "rojo", family: "Inter; } body { display:none", bold: "yes" },
        link: { color: "#00ff00" },
      },
    });

    expect(styles.targets.h1).toEqual({ family: "Inter body display:none" });
    expect(styles.targets.link).toEqual({ color: "#00ff00" });
  });

  it("genera CSS para el editor y para la exportación", () => {
    const styles = normalizeStyles({
      targets: {
        h1: { family: "Georgia, serif", heavier: true, highlight: true },
        tableHeader: { bold: true },
        list: { italic: true },
        link: { color: "#0066cc" },
      },
    });

    const editor = stylesToCss(styles, "editor");
    expect(editor).toContain(".editor-host .cm-md-h1");
    expect(editor).toContain("font-family:Georgia, serif");
    expect(editor).toContain("font-weight:800");
    expect(editor).toContain("background-color:#fff59d");
    expect(editor).toContain(".editor-host .cm-md-table th");
    expect(editor).toContain(".editor-host .cm-md-list-item");

    const exported = stylesToCss(styles, "export");
    expect(exported).toContain("h1 {");
    expect(exported).toContain("thead th {");
    expect(exported).toContain("li {");
    expect(exported).toContain("a {");
    expect(exported).not.toContain("cm-md-h1");
  });

  it("guarda y elimina estilos conservando el resto del frontmatter", () => {
    let current = state("---\ntitle: Doc\n---\n\n# Hola");
    const view = {
      get state() {
        return current;
      },
      dispatch(spec: Parameters<EditorState["update"]>[0]) {
        current = current.update(spec).state;
      },
    } as unknown as EditorView;

    saveStyles(view, normalizeStyles({ targets: { h2: { italic: true } } }));
    expect(stylesFromState(current).targets.h2).toEqual({ italic: true });

    const parsed = JSON.parse(JSON.stringify(serializeStyles(stylesFromState(current))));
    expect(parsed.targets.h2.italic).toBe(true);

    saveStyles(view, { targets: {} });
    expect(stylesFromState(current).targets).toEqual({});
    expect(current.doc.toString()).toContain("title: Doc");
  });
});
