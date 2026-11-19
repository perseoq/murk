// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { WidgetType } from "@codemirror/view";

const cache = new Map<string, string>();
let sequence = 0;

export function isDarkTheme(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const explicit = document.documentElement.dataset.theme;
  if (explicit === "dark") {
    return true;
  }
  if (explicit === "light") {
    return false;
  }

  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

async function render(source: string, dark: boolean): Promise<string> {
  const key = `${dark ? "dark" : "light"}\u0000${source}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const [{ default: mermaid }, { default: DOMPurify }] = await Promise.all([
    import("mermaid"),
    import("dompurify"),
  ]);

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
    fontFamily: "var(--murk-font)",
    flowchart: { htmlLabels: false, useMaxWidth: true },
  });

  sequence += 1;
  const { svg } = await mermaid.render(`murk-mermaid-${sequence}`, source);
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });

  cache.set(key, clean);
  return clean;
}

export class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly dark: boolean,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof MermaidWidget && other.source === this.source && other.dark === this.dark
    );
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-md-mermaid";

    void render(this.source, this.dark)
      .then((svg) => {
        if (container.isConnected) {
          container.innerHTML = svg;
        }
      })
      .catch((error: unknown) => {
        if (!container.isConnected) {
          return;
        }
        container.replaceChildren();
        const message = document.createElement("p");
        message.className = "cm-md-mermaid-error";
        message.textContent = `No se pudo renderizar Mermaid: ${String(error)}`;
        const code = document.createElement("pre");
        code.className = "cm-md-mermaid-source";
        code.textContent = this.source;
        container.append(message, code);
      });

    return container;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
