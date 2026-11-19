// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import type { EditorView } from "@codemirror/view";
import { WidgetType } from "@codemirror/view";

import type { Alignment, CellData, TableData } from "../table";

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
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof TableWidget && other.key === this.key;
  }

  toDOM(view: EditorView): HTMLElement {
    const table = document.createElement("table");
    table.className = "cm-md-table";

    const select = (cell: CellData) => {
      view.dispatch({ selection: { anchor: cell.from } });
      view.focus();
    };

    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    this.table.header.forEach((cell, index) => {
      const th = document.createElement("th");
      th.className = alignmentClass(this.table.alignments[index] ?? "default");
      th.append(inline(cell.text));
      th.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        select(cell);
      });
      headerRow.append(th);
    });
    head.append(headerRow);
    table.append(head);

    const body = document.createElement("tbody");
    for (const row of this.table.rows) {
      const tr = document.createElement("tr");
      row.forEach((cell, index) => {
        const td = document.createElement("td");
        td.className = alignmentClass(this.table.alignments[index] ?? "default");
        td.append(inline(cell.text));
        td.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          select(cell);
        });
        tr.append(td);
      });
      body.append(tr);
    }
    table.append(body);

    return table;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
