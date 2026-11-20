// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { WidgetType } from "@codemirror/view";

async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
  const done = (): void => {
    button.textContent = "Copiado";
    window.setTimeout(() => {
      button.textContent = "Copiar";
    }, 1400);
  };

  try {
    await navigator.clipboard.writeText(text);
    done();
    return;
  } catch {
    /* usar el respaldo */
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (copied) {
    done();
  }
}

/** Barra superior de un bloque de código: lenguaje o botón de copiar. */
export class CodeHeaderWidget extends WidgetType {
  constructor(
    readonly language: string,
    readonly code: string,
    readonly readOnly: boolean,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof CodeHeaderWidget &&
      other.language === this.language &&
      other.code === this.code &&
      other.readOnly === this.readOnly
    );
  }

  toDOM(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "cm-md-code-header-content";

    if (this.readOnly) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cm-md-code-copy";
      button.title = "Copiar bloque de código";
      button.setAttribute("aria-label", "Copiar bloque de código");
      button.textContent = "Copiar";
      button.addEventListener("mousedown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void copyText(this.code, button);
      });
      bar.append(button);
    } else {
      const badge = document.createElement("span");
      badge.className = "cm-md-code-lang";
      badge.textContent = this.language || "texto";
      bar.append(badge);
    }

    return bar;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
