// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { ensureSyntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { describe, expect, it } from "vitest";

import { tableFromNode, type TableData } from "../table";
import { TableWidget } from "./table";

const DOC = "| A | B |\n|---|---|\n| 1 | 2 |\n\ntexto";

function build(readOnly = false): { state: EditorState; table: TableData } {
  const state = EditorState.create({
    doc: DOC,
    extensions: [markdown({ base: markdownLanguage }), EditorState.readOnly.of(readOnly)],
  });
  const tree = ensureSyntaxTree(state, state.doc.length);
  let node: SyntaxNode | null = null;
  if (tree) {
    tree.iterate({
      enter: (current) => {
        if (current.name === "Table") {
          node = current.node;
        }
      },
    });
  }
  const table = node ? tableFromNode(state, node) : null;
  if (!table) {
    throw new Error("no se encontró la tabla");
  }
  return { state, table };
}

function fakeView(state: EditorState): { view: EditorView; changes: Array<unknown> } {
  const changes: Array<unknown> = [];
  const view = {
    state,
    dispatch(spec: { changes?: unknown }) {
      changes.push(spec.changes);
    },
    focus() {
      /* sin efecto */
    },
  } as unknown as EditorView;
  return { view, changes };
}

describe("widget de tabla", () => {
  it("permite editar una celda y sincroniza el Markdown", () => {
    const { state, table } = build();
    const { view, changes } = fakeView(state);
    const widget = new TableWidget(table, "tabla", 0);
    const element = widget.toDOM(view);
    document.body.append(element);

    const cells = Array.from(element.querySelectorAll<HTMLTableCellElement>("td"));
    expect(cells).toHaveLength(2);

    cells[0].dispatchEvent(new FocusEvent("focus"));
    expect(cells[0].dataset.editing).toBe("true");
    expect(cells[0].textContent).toBe("1");

    cells[0].textContent = "nuevo";
    cells[0].dispatchEvent(new FocusEvent("blur"));

    expect(changes).toEqual([
      { from: table.rows[0][0].from, to: table.rows[0][0].to, insert: "nuevo" },
    ]);
    element.remove();
  });

  it("escapa las barras verticales al editar", () => {
    const { state, table } = build();
    const { view, changes } = fakeView(state);
    const widget = new TableWidget(table, "tabla", 0);
    const element = widget.toDOM(view);
    document.body.append(element);

    const cell = element.querySelector<HTMLTableCellElement>("td");
    cell?.dispatchEvent(new FocusEvent("focus"));
    if (cell) {
      cell.textContent = "a | b";
      cell.dispatchEvent(new FocusEvent("blur"));
    }

    expect(changes[0]).toMatchObject({ insert: "a \\| b" });
    element.remove();
  });

  it("muestra un tirador por columna y respeta las anchuras", () => {
    const { state, table } = build();
    const { view } = fakeView(state);
    const widget = new TableWidget(table, "tabla", 2, [140, 180]);
    const element = widget.toDOM(view);

    expect(element.querySelectorAll(".cm-md-table-resize")).toHaveLength(2);
    const cols = Array.from(element.querySelectorAll<HTMLTableColElement>("col"));
    expect(cols.map((col) => col.style.width)).toEqual(["140px", "180px"]);
    const tableElement = element.querySelector("table");
    expect(tableElement?.style.tableLayout).toBe("fixed");
    expect(tableElement?.style.width).toBe("320px");
  });

  it("no es editable en solo lectura", () => {
    const { state, table } = build(true);
    const { view } = fakeView(state);
    const widget = new TableWidget(table, "tabla", 0);
    const element = widget.toDOM(view);

    expect(element.querySelectorAll(".cm-md-table-resize")).toHaveLength(0);
    expect(element.querySelector("td")?.getAttribute("contenteditable")).toBeNull();
  });
});
