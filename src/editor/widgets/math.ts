// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { WidgetType } from "@codemirror/view";
import katex from "katex";

export class MathWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly display: boolean,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof MathWidget && other.source === this.source && other.display === this.display
    );
  }

  toDOM(): HTMLElement {
    const element = document.createElement(this.display ? "div" : "span");
    element.className = this.display ? "cm-md-math-block" : "cm-md-math-inline";
    element.setAttribute("title", this.source);

    try {
      katex.render(this.source, element, {
        displayMode: this.display,
        throwOnError: false,
        strict: false,
        trust: false,
      });
    } catch {
      element.textContent = this.source;
      element.classList.add("cm-md-math-error");
    }

    return element;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
