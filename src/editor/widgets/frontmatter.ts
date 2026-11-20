// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { WidgetType, type EditorView } from "@codemirror/view";

import { frontmatterSummary, type FrontmatterBlock } from "../frontmatter";

/** Muestra el frontmatter como una barra compacta; al pulsarla se edita. */
export class FrontmatterWidget extends WidgetType {
  constructor(
    readonly block: FrontmatterBlock,
    readonly key: string,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof FrontmatterWidget && other.key === this.key;
  }

  toDOM(view: EditorView): HTMLElement {
    const element = document.createElement("div");
    element.className = "cm-md-frontmatter";
    element.title = "Clic para editar los metadatos YAML";
    element.textContent = `Metadatos YAML · ${frontmatterSummary(this.block)}`;
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ selection: { anchor: this.block.from + 3 } });
      view.focus();
    });
    return element;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
