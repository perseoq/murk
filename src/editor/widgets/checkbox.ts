// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import type { EditorView } from "@codemirror/view";
import { WidgetType } from "@codemirror/view";

export class CheckboxWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly checked: boolean,
    readonly readOnly: boolean,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof CheckboxWidget &&
      other.from === this.from &&
      other.to === this.to &&
      other.checked === this.checked &&
      other.readOnly === this.readOnly
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const label = document.createElement("label");
    label.className = "cm-md-task";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.disabled = this.readOnly;
    input.setAttribute("aria-label", "Marcar tarea");

    input.addEventListener("change", () => {
      if (this.readOnly) {
        return;
      }
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? "[ ]" : "[x]",
        },
      });
    });

    label.append(input);
    return label;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
