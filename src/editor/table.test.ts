// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { findTableNode, parseDelimited, serializeTable, tableAt, tableFromNode } from "./table";

const tableSource = "| Nombre | Edad |\n| :----- | ---: |\n| Ana    | 30   |\n| Luis   | 25   |\n";

function state(doc = tableSource, cursor = 2): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage })],
  });
}

describe("tablas GFM", () => {
  it("parsea encabezado, alineaciones y filas", () => {
    const editorState = state();
    const node = findTableNode(editorState, 2);
    expect(node).not.toBeNull();

    const table = tableFromNode(editorState, node!);
    expect(table).not.toBeNull();
    expect(table!.header.map((cell) => cell.text)).toEqual(["Nombre", "Edad"]);
    expect(table!.alignments).toEqual(["left", "right"]);
    expect(table!.rows.map((row) => row.map((cell) => cell.text))).toEqual([
      ["Ana", "30"],
      ["Luis", "25"],
    ]);
  });

  it("identifica la celda bajo el cursor", () => {
    const editorState = state(tableSource, tableSource.indexOf("Ana") + 1);
    const context = tableAt(editorState, editorState.selection.main.head);

    expect(context).not.toBeNull();
    expect(context!.rowIndex).toBe(0);
    expect(context!.colIndex).toBe(0);
    expect(context!.cell.text).toBe("Ana");
  });

  it("serializa con anchos y alineaciones", () => {
    const result = serializeTable(["A", "B"], [["1", "2"]], ["left", "right"]);

    expect(result).toBe(["| A   | B   |", "| :-- | --: |", "| 1   | 2   |"].join("\n"));
  });

  it("serializa tablas con alineación central", () => {
    const result = serializeTable(["Nombre", "Edad"], [["Ana", "30"]], ["center", "default"]);

    expect(result.split("\n")[1]).toBe("| :----: | ---- |");
  });

  it("convierte TSV en filas", () => {
    expect(parseDelimited("A\tB\n1\t2")).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
  });

  it("convierte CSV con comillas y comas internas", () => {
    expect(parseDelimited('"A, x",B\n1,2')).toEqual([
      ["A, x", "B"],
      ["1", "2"],
    ]);
  });

  it("ignora texto sin separadores", () => {
    expect(parseDelimited("solo texto")).toBeNull();
    expect(parseDelimited("")).toBeNull();
  });
});
