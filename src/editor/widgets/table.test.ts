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

function build(readOnly = false, document = DOC): { state: EditorState; table: TableData } {
  const state = EditorState.create({
    doc: document,
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
  it("permite editar una celda y sincroniza el Markdown", async () => {
    const { state, table } = build();
    const { view, changes } = fakeView(state);
    const widget = new TableWidget(table, "tabla", 0);
    const element = widget.toDOM(view);
    document.body.append(element);

    const cells = Array.from(element.querySelectorAll<HTMLElement>("td .cm-md-table-cell"));
    expect(cells).toHaveLength(2);

    cells[0].dispatchEvent(new FocusEvent("focus"));
    expect(cells[0].dataset.editing).toBe("true");
    expect(cells[0].textContent).toBe("1");

    cells[0].textContent = "nuevo";
    cells[0].dispatchEvent(new FocusEvent("blur"));
    await Promise.resolve();

    expect(changes).toEqual([
      { from: table.rows[0][0].from, to: table.rows[0][0].to, insert: "nuevo" },
    ]);
    element.remove();
  });

  it("escapa las barras verticales al editar", async () => {
    const { state, table } = build();
    const { view, changes } = fakeView(state);
    const widget = new TableWidget(table, "tabla", 0);
    const element = widget.toDOM(view);
    document.body.append(element);

    const cell = element.querySelector<HTMLElement>("td .cm-md-table-cell");
    cell?.dispatchEvent(new FocusEvent("focus"));
    if (cell) {
      cell.textContent = "a | b";
      cell.dispatchEvent(new FocusEvent("blur"));
    }
    await Promise.resolve();

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

  it("añade filas y columnas desde la barra de la tabla", async () => {
    const { state, table } = build();
    const { view, changes } = fakeView(state);
    const widget = new TableWidget(table, "tabla", 0);
    const element = widget.toDOM(view);
    document.body.append(element);

    const button = (label: string): HTMLButtonElement | undefined =>
      Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find((entry) =>
        entry.textContent?.includes(label),
      );

    button("+ Fila")?.click();
    await Promise.resolve();
    expect(changes[0]).toMatchObject({ insert: "\n|    |    |" });

    button("+ Columna")?.click();
    await Promise.resolve();
    expect(changes[1]).toMatchObject({ from: table.from, to: table.to });
    const added = (changes[1] as { insert: string }).insert;
    expect(added).toContain("Columna");
    expect(added.split("\n")[0].split("|")).toHaveLength(5);

    element.remove();
  });

  it("elimina solo la columna cuyo título se pulsa", async () => {
    const { state, table } = build(false, "| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n\ntexto");
    const { view, changes } = fakeView(state);
    const element = new TableWidget(table, "tabla", 0).toDOM(view);

    const buttons = element.querySelectorAll<HTMLButtonElement>(".cm-md-table-delete-col");
    expect(buttons).toHaveLength(3);
    buttons[1].click();
    await Promise.resolve();

    const insert = (changes[0] as { insert: string }).insert;
    expect(insert).toContain("A");
    expect(insert).toContain("C");
    expect(insert).not.toContain("B");
    expect(insert).toContain("1");
    expect(insert).toContain("3");
    expect(insert).not.toContain("2");
    expect(insert.split("\n")[0].split("|")).toHaveLength(4);
  });

  it("elimina solo la fila cuyo botón se pulsa", async () => {
    const { state, table } = build(false, "| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\ntexto");
    const { view, changes } = fakeView(state);
    const element = new TableWidget(table, "tabla", 0).toDOM(view);

    const buttons = element.querySelectorAll<HTMLButtonElement>(".cm-md-table-delete-row");
    expect(buttons).toHaveLength(2);
    buttons[0].click();
    await Promise.resolve();

    const insert = (changes[0] as { insert: string }).insert;
    expect(insert).not.toContain("1");
    expect(insert).not.toContain("2");
    expect(insert).toContain("3");
    expect(insert).toContain("4");
    expect(insert.split("\n")).toHaveLength(3);
  });

  it("no ofrece borrar la última columna", () => {
    const { state, table } = build(false, "| A |\n|---|\n| 1 |\n\ntexto");
    const { view } = fakeView(state);
    const element = new TableWidget(table, "tabla", 0).toDOM(view);
    expect(element.querySelectorAll(".cm-md-table-delete-col")).toHaveLength(0);
  });

  it("no muestra la barra de acciones en solo lectura", () => {
    const { state, table } = build(true);
    const { view } = fakeView(state);
    const element = new TableWidget(table, "tabla", 0).toDOM(view);
    expect(element.querySelector(".cm-md-table-toolbar")).toBeNull();
    expect(element.querySelectorAll(".cm-md-table-delete-col")).toHaveLength(0);
    expect(element.querySelectorAll(".cm-md-table-delete-row")).toHaveLength(0);
  });

  it("no es editable en solo lectura", () => {
    const { state, table } = build(true);
    const { view } = fakeView(state);
    const widget = new TableWidget(table, "tabla", 0);
    const element = widget.toDOM(view);

    expect(element.querySelectorAll(".cm-md-table-resize")).toHaveLength(0);
    expect(
      element.querySelector("td .cm-md-table-cell")?.getAttribute("contenteditable"),
    ).toBeNull();
  });
});
