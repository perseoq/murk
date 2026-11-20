// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { syntaxTree } from "@codemirror/language";
import { EditorSelection, type EditorState } from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

export type Alignment = "default" | "left" | "center" | "right";

export interface CellData {
  text: string;
  from: number;
  to: number;
}

export interface TableData {
  from: number;
  to: number;
  header: CellData[];
  alignments: Alignment[];
  rows: CellData[][];
  headerLine: number;
  separatorLine: number;
  rowLines: number[];
}

export interface TableContext {
  table: TableData;
  rowIndex: number;
  colIndex: number;
  cell: CellData;
}

const EMPTY_CELL = "\u200b";

function cellData(state: EditorState, cell: SyntaxNode): CellData {
  return {
    // El parser GFM omite las celdas vacías al final de una fila. El marcador
    // invisible mantiene la celda en el árbol sin mostrarse en el editor.
    text: state
      .sliceDoc(cell.from, cell.to)
      .replace(/\u200b/g, "")
      .trim(),
    from: cell.from,
    to: cell.to,
  };
}

function parseAlignments(separator: string, columns: number): Alignment[] {
  const markers = separator
    .split("|")
    .map((marker) => marker.trim())
    .filter((marker) => marker.length > 0);

  return Array.from({ length: columns }, (_, index) => {
    const marker = markers[index] ?? "";
    const left = marker.startsWith(":");
    const right = marker.endsWith(":");
    if (left && right) {
      return "center";
    }
    if (left) {
      return "left";
    }
    if (right) {
      return "right";
    }
    return "default";
  });
}

export function tableFromNode(state: EditorState, node: SyntaxNode): TableData | null {
  const headerNode = node.getChild("TableHeader");
  const separator = node.getChildren("TableDelimiter")[0];
  if (!headerNode || !separator) {
    return null;
  }

  const header = headerNode.getChildren("TableCell").map((cell) => cellData(state, cell));
  const rows = node
    .getChildren("TableRow")
    .map((row) => row.getChildren("TableCell").map((cell) => cellData(state, cell)));

  const separatorLine = state.doc.lineAt(separator.from);
  const rowLines = node.getChildren("TableRow").map((row) => state.doc.lineAt(row.from).number);

  return {
    from: node.from,
    to: node.to,
    header,
    alignments: parseAlignments(
      state.sliceDoc(separatorLine.from, separatorLine.to),
      header.length,
    ),
    rows,
    headerLine: state.doc.lineAt(node.from).number,
    separatorLine: separatorLine.number,
    rowLines,
  };
}

export function findTableNode(state: EditorState, position: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1);
  while (node) {
    if (node.name === "Table") {
      return node;
    }
    node = node.parent;
  }
  return null;
}

export function tableAt(state: EditorState, position: number): TableContext | null {
  const node = findTableNode(state, position);
  if (!node) {
    return null;
  }

  const table = tableFromNode(state, node);
  if (!table) {
    return null;
  }

  const line = state.doc.lineAt(position).number;
  let rowIndex: number;
  let cells: CellData[];

  if (line === table.headerLine) {
    rowIndex = -1;
    cells = table.header;
  } else {
    rowIndex = table.rowLines.indexOf(line);
    if (rowIndex === -1) {
      return null;
    }
    cells = table.rows[rowIndex];
  }

  if (cells.length === 0) {
    return null;
  }

  let colIndex = cells.findIndex((cell) => cell.from <= position && position <= cell.to);
  if (colIndex === -1) {
    colIndex = cells.findIndex((cell) => cell.from >= position);
  }
  if (colIndex === -1) {
    colIndex = cells.length - 1;
  }

  return { table, rowIndex, colIndex, cell: cells[colIndex] };
}

function marker(width: number, alignment: Alignment): string {
  const dashes = Math.max(1, width);
  switch (alignment) {
    case "left":
      return `:${"-".repeat(Math.max(2, dashes - 1))}`;
    case "right":
      return `${"-".repeat(Math.max(2, dashes - 1))}:`;
    case "center":
      return `:${"-".repeat(Math.max(1, dashes - 2))}:`;
    default:
      return "-".repeat(Math.max(3, dashes));
  }
}

export function serializeTable(
  header: string[],
  rows: string[][],
  alignments: Alignment[] = [],
): string {
  const columns = Math.max(header.length, ...rows.map((row) => row.length), 1);

  const normalize = (row: string[]): string[] =>
    Array.from({ length: columns }, (_, index) => (row[index] ?? "").trim() || EMPTY_CELL);

  const headerCells = normalize(header);
  const dataRows = rows.map(normalize);
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(3, headerCells[column].length, ...dataRows.map((row) => row[column].length)),
  );

  const formatRow = (cells: string[]): string =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;

  const delimiter = `| ${widths
    .map((width, index) => marker(width, alignments[index] ?? "default").padEnd(width))
    .join(" | ")} |`;

  return [formatRow(headerCells), delimiter, ...dataRows.map(formatRow)].join("\n");
}

export function emptyRow(columns: number): string {
  return `| ${Array.from({ length: columns }, () => EMPTY_CELL).join(" | ")} |`;
}

function rebuild(
  view: EditorView,
  table: TableData,
  header: string[],
  rows: string[][],
  alignments: Alignment[],
): void {
  const text = serializeTable(header, rows, alignments);
  view.dispatch({
    changes: { from: table.from, to: table.to, insert: text },
    selection: { anchor: Math.min(table.from + 2, table.from + text.length) },
  });
  view.focus();
}

function insertRow(view: EditorView, ctx: TableContext, where: "above" | "below"): boolean {
  const { table } = ctx;
  const columns = table.header.length;

  if (ctx.rowIndex === -1) {
    if (where === "above") {
      return false;
    }
    const separator = view.state.doc.line(table.separatorLine);
    view.dispatch({
      changes: { from: separator.to, insert: `\n${emptyRow(columns)}` },
      selection: { anchor: separator.to + 3 },
    });
    view.focus();
    return true;
  }

  const line = view.state.doc.line(table.rowLines[ctx.rowIndex]);
  if (where === "above") {
    view.dispatch({
      changes: { from: line.from, insert: `${emptyRow(columns)}\n` },
      selection: { anchor: line.from + 2 },
    });
  } else {
    view.dispatch({
      changes: { from: line.to, insert: `\n${emptyRow(columns)}` },
      selection: { anchor: line.to + 3 },
    });
  }
  view.focus();
  return true;
}

function deleteRow(view: EditorView, ctx: TableContext): boolean {
  if (ctx.rowIndex < 0) {
    return false;
  }

  const line = view.state.doc.line(ctx.table.rowLines[ctx.rowIndex]);
  const from = line.from > 0 ? line.from - 1 : line.from;
  view.dispatch({
    changes: { from, to: line.to },
    selection: { anchor: Math.min(ctx.table.from + 2, from) },
  });
  view.focus();
  return true;
}

function insertColumn(view: EditorView, ctx: TableContext, side: "left" | "right"): boolean {
  const index = side === "left" ? ctx.colIndex : ctx.colIndex + 1;
  const header = ctx.table.header.map((cell) => cell.text);
  const rows = ctx.table.rows.map((row) => row.map((cell) => cell.text));
  const alignments = [...ctx.table.alignments];

  header.splice(index, 0, "Columna");
  for (const row of rows) {
    row.splice(index, 0, "");
  }
  alignments.splice(index, 0, "default");

  rebuild(view, ctx.table, header, rows, alignments);
  return true;
}

function deleteColumn(view: EditorView, ctx: TableContext): boolean {
  if (ctx.table.header.length <= 1) {
    return false;
  }

  const header = ctx.table.header.map((cell) => cell.text);
  const rows = ctx.table.rows.map((row) => row.map((cell) => cell.text));
  const alignments = [...ctx.table.alignments];

  header.splice(ctx.colIndex, 1);
  for (const row of rows) {
    row.splice(ctx.colIndex, 1);
  }
  alignments.splice(ctx.colIndex, 1);

  rebuild(view, ctx.table, header, rows, alignments);
  return true;
}

function alignColumn(view: EditorView, ctx: TableContext, alignment: Alignment): boolean {
  const alignments = [...ctx.table.alignments];
  alignments[ctx.colIndex] = alignment;
  rebuild(
    view,
    ctx.table,
    ctx.table.header.map((cell) => cell.text),
    ctx.table.rows.map((row) => row.map((cell) => cell.text)),
    alignments,
  );
  return true;
}

function formatTable(view: EditorView, ctx: TableContext): boolean {
  rebuild(
    view,
    ctx.table,
    ctx.table.header.map((cell) => cell.text),
    ctx.table.rows.map((row) => row.map((cell) => cell.text)),
    ctx.table.alignments,
  );
  return true;
}

export function insertTable(view: EditorView): boolean {
  if (view.state.readOnly) {
    return false;
  }
  const { state } = view;
  const selection = state.selection.main;
  const text = serializeTable(["Columna 1", "Columna 2"], [["", ""]], ["default", "default"]);

  const before =
    selection.from > 0 && state.doc.sliceString(selection.from - 1, selection.from) !== "\n"
      ? "\n"
      : "";
  const after =
    selection.to < state.doc.length &&
    state.doc.sliceString(selection.to, selection.to + 1) !== "\n"
      ? "\n"
      : "";

  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: `${before}${text}${after}` },
    selection: { anchor: selection.from + before.length + 2 },
  });
  view.focus();
  return true;
}

export function nextCell(view: EditorView): boolean {
  if (view.state.readOnly) {
    return false;
  }
  const ctx = tableAt(view.state, view.state.selection.main.head);
  if (!ctx) {
    return false;
  }

  if (ctx.colIndex < ctx.table.header.length - 1) {
    const cells = ctx.rowIndex === -1 ? ctx.table.header : ctx.table.rows[ctx.rowIndex];
    view.dispatch({ selection: { anchor: cells[ctx.colIndex + 1].from } });
    return true;
  }

  if (ctx.rowIndex < ctx.table.rows.length - 1) {
    const nextRowIndex = ctx.rowIndex + 1;
    view.dispatch({ selection: { anchor: ctx.table.rows[nextRowIndex][0].from } });
    return true;
  }

  const line = view.state.doc.line(ctx.table.rowLines[ctx.rowIndex] ?? ctx.table.separatorLine);
  const row = emptyRow(ctx.table.header.length);
  view.dispatch({
    changes: { from: line.to, insert: `\n${row}` },
    selection: { anchor: line.to + 3 },
  });
  return true;
}

export function previousCell(view: EditorView): boolean {
  const ctx = tableAt(view.state, view.state.selection.main.head);
  if (!ctx) {
    return false;
  }

  if (ctx.colIndex > 0) {
    const cells = ctx.rowIndex === -1 ? ctx.table.header : ctx.table.rows[ctx.rowIndex];
    view.dispatch({ selection: { anchor: cells[ctx.colIndex - 1].from } });
    return true;
  }

  if (ctx.rowIndex > -1) {
    const previous = ctx.rowIndex - 1;
    const cells = previous === -1 ? ctx.table.header : ctx.table.rows[previous];
    view.dispatch({ selection: { anchor: cells[cells.length - 1].from } });
    return true;
  }

  view.dispatch({ selection: { anchor: ctx.table.header[0].from } });
  return true;
}

export function nextRow(view: EditorView): boolean {
  if (view.state.readOnly) {
    return false;
  }
  const ctx = tableAt(view.state, view.state.selection.main.head);
  if (!ctx) {
    return false;
  }

  if (ctx.rowIndex === -1) {
    if (ctx.table.rows.length > 0) {
      view.dispatch({
        selection: { anchor: ctx.table.rows[0][ctx.colIndex]?.from ?? ctx.table.rows[0][0].from },
      });
      return true;
    }
  } else if (ctx.rowIndex < ctx.table.rows.length - 1) {
    const next = ctx.table.rows[ctx.rowIndex + 1][ctx.colIndex];
    if (next) {
      view.dispatch({ selection: { anchor: next.from } });
      return true;
    }
  }

  const line = view.state.doc.line(ctx.table.rowLines[ctx.rowIndex] ?? ctx.table.separatorLine);
  const row = emptyRow(ctx.table.header.length);
  view.dispatch({
    changes: { from: line.to, insert: `\n${row}` },
    selection: { anchor: line.to + 3 },
  });
  return true;
}

export type TableAction =
  | "rowAbove"
  | "rowBelow"
  | "deleteRow"
  | "colLeft"
  | "colRight"
  | "deleteCol"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "format";

export function runTableAction(view: EditorView, action: TableAction): boolean {
  if (view.state.readOnly) {
    return false;
  }
  const ctx = tableAt(view.state, view.state.selection.main.head);
  if (!ctx) {
    return false;
  }

  switch (action) {
    case "rowAbove":
      return insertRow(view, ctx, "above");
    case "rowBelow":
      return insertRow(view, ctx, "below");
    case "deleteRow":
      return deleteRow(view, ctx);
    case "colLeft":
      return insertColumn(view, ctx, "left");
    case "colRight":
      return insertColumn(view, ctx, "right");
    case "deleteCol":
      return deleteColumn(view, ctx);
    case "alignLeft":
      return alignColumn(view, ctx, "left");
    case "alignCenter":
      return alignColumn(view, ctx, "center");
    case "alignRight":
      return alignColumn(view, ctx, "right");
    case "format":
      return formatTable(view, ctx);
  }
}

export function parseDelimited(source: string): string[][] | null {
  const text = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
  if (!text) {
    return null;
  }

  const delimiter = text.includes("\t")
    ? "\t"
    : text.includes(",") && text.includes("\n")
      ? ","
      : null;
  if (!delimiter) {
    return null;
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  const columns = Math.max(...rows.map((entry) => entry.length));
  return rows.map((entry) =>
    Array.from({ length: columns }, (_, index) => entry[index]?.trim() ?? ""),
  );
}

function insideTableOrCode(state: EditorState, position: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1);
  while (node) {
    if (
      node.name === "Table" ||
      node.name === "FencedCode" ||
      node.name === "CodeBlock" ||
      node.name === "InlineCode"
    ) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

export function handleTablePaste(event: ClipboardEvent, view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (insideTableOrCode(view.state, selection.from)) {
    return false;
  }

  const text = event.clipboardData?.getData("text/plain");
  if (!text) {
    return false;
  }

  const rows = parseDelimited(text);
  if (!rows || rows.length === 0) {
    return false;
  }

  const [header, ...body] = rows;
  const table = serializeTable(header, body);
  event.preventDefault();

  const { state } = view;
  const before =
    selection.from > 0 && state.doc.sliceString(selection.from - 1, selection.from) !== "\n"
      ? "\n"
      : "";
  const after =
    selection.to < state.doc.length &&
    state.doc.sliceString(selection.to, selection.to + 1) !== "\n"
      ? "\n"
      : "";

  view.dispatch({
    changes: {
      from: selection.from,
      to: selection.to,
      insert: `${before}${table}${after}`,
    },
    selection: EditorSelection.single(selection.from + before.length + 2),
  });
  view.focus();
  return true;
}

export function insertCellBreak(view: EditorView): boolean {
  if (view.state.readOnly) {
    return false;
  }
  const context = tableAt(view.state, view.state.selection.main.head);
  if (!context) {
    return false;
  }

  const selection = view.state.selection.main;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: "<br>" },
    selection: { anchor: selection.from + 4 },
  });
  return true;
}

export const tableKeymap: readonly KeyBinding[] = [
  { key: "Tab", run: nextCell },
  { key: "Shift-Tab", run: previousCell },
  { key: "Enter", run: nextRow },
  { key: "Mod-Enter", run: insertCellBreak },
];
