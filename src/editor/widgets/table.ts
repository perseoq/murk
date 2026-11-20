// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import type { EditorView } from "@codemirror/view";
import { WidgetType } from "@codemirror/view";

import type { Alignment, CellData, TableData } from "../table";
import { emptyRow, serializeTable } from "../table";
import { setTableWidths } from "../frontmatter";

function inline(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|~~([^~]+)~~|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      fragment.append(document.createTextNode(text.slice(last, match.index)));
    }

    if (match[2]) {
      const strong = document.createElement("strong");
      strong.textContent = match[2];
      fragment.append(strong);
    } else if (match[3]) {
      const emphasis = document.createElement("em");
      emphasis.textContent = match[3];
      fragment.append(emphasis);
    } else if (match[4]) {
      const code = document.createElement("code");
      code.textContent = match[4];
      fragment.append(code);
    } else if (match[5]) {
      const strike = document.createElement("del");
      strike.textContent = match[5];
      fragment.append(strike);
    } else if (match[6]) {
      const link = document.createElement("span");
      link.className = "cm-md-table-link";
      link.textContent = match[6];
      if (match[7]) {
        link.title = match[7];
      }
      fragment.append(link);
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) {
    fragment.append(document.createTextNode(text.slice(last)));
  }

  return fragment;
}

function alignmentClass(alignment: Alignment): string {
  return `cm-md-align-${alignment}`;
}

export class TableWidget extends WidgetType {
  constructor(
    readonly table: TableData,
    readonly key: string,
    readonly index: number,
    readonly widths: number[] = [],
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof TableWidget &&
      other.key === this.key &&
      other.widths.length === this.widths.length &&
      other.widths.every((width, index) => width === this.widths[index])
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-table-wrap";

    const table = document.createElement("table");
    table.className = "cm-md-table";

    const columns = this.table.header.length;
    let widths = [...this.widths];
    const colgroup = document.createElement("colgroup");
    const cols = Array.from({ length: columns }, (_, column) => {
      const col = document.createElement("col");
      if (widths[column]) {
        col.style.width = `${widths[column]}px`;
      }
      colgroup.append(col);
      return col;
    });
    table.append(colgroup);

    const applyWidths = (): void => {
      widths.forEach((width, column) => {
        cols[column]?.style.setProperty("width", `${width}px`);
      });
      table.style.tableLayout = "fixed";
      table.style.width = `${widths.reduce((total, width) => total + width, 0)}px`;
    };

    if (widths.length > 0) {
      applyWidths();
    }

    const editable = !view.state.readOnly;

    const restore = (element: HTMLElement, cell: CellData): void => {
      element.replaceChildren(inline(cell.text));
      delete element.dataset.editing;
    };

    const commit = (element: HTMLElement, cell: CellData): void => {
      if (element.dataset.editing !== "true") {
        return;
      }
      const raw = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      delete element.dataset.editing;
      if (raw === cell.text) {
        restore(element, cell);
        return;
      }
      view.dispatch({
        changes: { from: cell.from, to: cell.to, insert: raw.replace(/\|/g, "\\|") },
      });
    };

    const deleteRow = (rowIndex: number): void => {
      const header = this.table.header.map((cell) => cell.text);
      const rows = this.table.rows.map((row) => row.map((cell) => cell.text));
      rows.splice(rowIndex, 1);
      const text = serializeTable(header, rows, this.table.alignments);
      view.dispatch({ changes: { from: this.table.from, to: this.table.to, insert: text } });
    };

    const deleteColumn = (column: number): void => {
      if (columns <= 1) {
        return;
      }
      const header = this.table.header.map((cell) => cell.text);
      const rows = this.table.rows.map((row) => row.map((cell) => cell.text));
      header.splice(column, 1);
      for (const row of rows) {
        row.splice(column, 1);
      }
      const alignments = [...this.table.alignments];
      alignments.splice(column, 1);
      const text = serializeTable(header, rows, alignments);
      view.dispatch({ changes: { from: this.table.from, to: this.table.to, insert: text } });
      if (widths.length > 0) {
        setTableWidths(
          view,
          this.index,
          widths.filter((_, index) => index !== column),
        );
      }
    };

    const buildCell = (
      tag: "th" | "td",
      cell: CellData,
      column: number,
      header: boolean,
      rowIndex?: number,
    ): HTMLElement => {
      const element = document.createElement(tag);
      element.className = alignmentClass(this.table.alignments[column] ?? "default");
      element.append(inline(cell.text));

      if (!editable) {
        return element;
      }

      element.contentEditable = "true";
      element.spellcheck = false;
      element.setAttribute("role", header ? "columnheader" : "cell");
      element.title = "Clic para editar la celda";

      element.addEventListener("focus", () => {
        if (element.dataset.editing === "true") {
          return;
        }
        element.dataset.editing = "true";
        element.textContent = cell.text;
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      });

      element.addEventListener("blur", () => commit(element, cell));

      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          commit(element, cell);
          element.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          restore(element, cell);
          element.blur();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          // Guardar sin perder la celda que se está editando.
          commit(element, cell);
          element.blur();
        }
      });

      element.addEventListener("mousedown", (event) => {
        event.stopPropagation();
      });

      if (header && columns > 1) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "cm-md-table-delete-col";
        remove.title = "Eliminar esta columna";
        remove.setAttribute("aria-label", "Eliminar esta columna");
        remove.textContent = "×";
        remove.addEventListener("mousedown", (event) => event.stopPropagation());
        remove.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deleteColumn(column);
        });
        element.append(remove);
      }

      if (!header && rowIndex !== undefined && column === 0) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "cm-md-table-delete-row";
        remove.title = "Eliminar esta fila";
        remove.setAttribute("aria-label", "Eliminar esta fila");
        remove.textContent = "×";
        remove.addEventListener("mousedown", (event) => event.stopPropagation());
        remove.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deleteRow(rowIndex);
        });
        element.append(remove);
      }

      return element;
    };

    const startResize = (event: PointerEvent, column: number): void => {
      if (!editable) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const handle = event.currentTarget as HTMLElement;
      const startX = event.clientX;
      const initial =
        widths.length > 0
          ? [...widths]
          : Array.from({ length: columns }, (_, index) => {
              const cell = headerRow.children[index] as HTMLElement | undefined;
              return Math.round(cell?.getBoundingClientRect().width ?? 120);
            });
      const startWidth = initial[column] ?? 120;

      handle.setPointerCapture(event.pointerId);

      const onMove = (move: PointerEvent): void => {
        widths = [...initial];
        widths[column] = Math.max(64, Math.round(startWidth + move.clientX - startX));
        applyWidths();
      };
      const finish = (): void => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("pointercancel", finish);
        if (widths.length > 0) {
          setTableWidths(view, this.index, widths);
        }
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    };

    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    this.table.header.forEach((cell, column) => {
      const th = buildCell("th", cell, column, true);
      if (editable) {
        const handle = document.createElement("span");
        handle.className = "cm-md-table-resize";
        handle.title = "Arrastra para redimensionar";
        handle.addEventListener("pointerdown", (event) => startResize(event, column));
        th.append(handle);
      }
      headerRow.append(th);
    });
    head.append(headerRow);
    table.append(head);

    const body = document.createElement("tbody");
    for (const [rowIndex, row] of this.table.rows.entries()) {
      const tr = document.createElement("tr");
      row.forEach((cell, column) => {
        tr.append(buildCell("td", cell, column, false, rowIndex));
      });
      body.append(tr);
    }
    table.append(body);

    const addRow = (): void => {
      const last = this.table.rowLines.at(-1) ?? this.table.separatorLine;
      const line = view.state.doc.line(last);
      view.dispatch({ changes: { from: line.to, insert: `\n${emptyRow(columns)}` } });
    };

    const addColumn = (): void => {
      const header = this.table.header.map((cell) => cell.text);
      const rows = this.table.rows.map((row) => row.map((cell) => cell.text));
      header.push("Columna");
      for (const row of rows) {
        row.push("");
      }
      const text = serializeTable(header, rows, [...this.table.alignments, "default"]);
      view.dispatch({ changes: { from: this.table.from, to: this.table.to, insert: text } });
      if (widths.length > 0) {
        setTableWidths(view, this.index, [...widths, 160]);
      }
    };

    const toolbar = document.createElement("div");
    toolbar.className = "cm-md-table-toolbar";
    const addButton = (
      label: string,
      title: string,
      action: () => void,
      disabled = false,
    ): void => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = title;
      button.disabled = disabled;
      button.addEventListener("mousedown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      });
      toolbar.append(button);
    };

    addButton("+ Fila", "Añadir una fila al final", addRow);
    addButton("+ Columna", "Añadir una columna a la derecha", addColumn);

    wrap.append(table);
    if (editable) {
      wrap.append(toolbar);
    }
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
