// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { WidgetType } from "@codemirror/view";

const cache = new Map<string, string>();
let sequence = 0;

/**
 * Devuelve una familia tipográfica concreta para Mermaid.
 *
 * Mermaid mide el texto con el canvas: si recibe `var(--murk-font)` WebKit no
 * puede resolverla y las etiquetas quedan sin tamaño o fuera de las figuras.
 */
function resolvedFontFamily(): string {
  if (typeof window === "undefined") {
    return "sans-serif";
  }
  const family = getComputedStyle(document.body).fontFamily?.trim();
  if (family && !family.includes("var(")) {
    return family;
  }
  const variable = getComputedStyle(document.documentElement)
    .getPropertyValue("--murk-font")
    .trim();
  return variable || "sans-serif";
}

function cssColor(variable: string, fallback: string): string {
  if (typeof document === "undefined") {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

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

interface NodeColors {
  fill: string;
  stroke: string;
  text: string;
}

const DARK_PALETTE: NodeColors[] = [
  { fill: "#12324a", stroke: "#58a6ff", text: "#e6edf3" },
  { fill: "#2d2440", stroke: "#a78bfa", text: "#e6edf3" },
  { fill: "#1f3b2a", stroke: "#56d364", text: "#e6edf3" },
  { fill: "#3d3220", stroke: "#e3b341", text: "#e6edf3" },
  { fill: "#40262f", stroke: "#f778ba", text: "#e6edf3" },
  { fill: "#1f3a3d", stroke: "#39c5cf", text: "#e6edf3" },
];

const LIGHT_PALETTE: NodeColors[] = [
  { fill: "#dbeafe", stroke: "#2563eb", text: "#1f2328" },
  { fill: "#ede9fe", stroke: "#7c3aed", text: "#1f2328" },
  { fill: "#dcfce7", stroke: "#16a34a", text: "#1f2328" },
  { fill: "#fef3c7", stroke: "#d97706", text: "#1f2328" },
  { fill: "#fce7f3", stroke: "#db2777", text: "#1f2328" },
  { fill: "#cffafe", stroke: "#0891b2", text: "#1f2328" },
];

function applyStyle(element: Element, declarations: Record<string, string>): void {
  const keys = Object.keys(declarations);
  const kept = (element.getAttribute("style") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !keys.some((key) => part.startsWith(`${key}:`)));
  for (const key of keys) {
    kept.push(`${key}:${declarations[key]}`);
  }
  element.setAttribute("style", kept.join(";"));
}

/**
 * Asigna un color distinto a cada figura del diagrama.
 *
 * Mermaid usa el mismo relleno para todos los nodos de un flowchart; esta
 * pasada recorre los grupos y aplica una paleta con contraste suficiente en
 * tema claro y oscuro.
 */
export function colorizeDiagram(svg: string, dark: boolean): string {
  if (typeof DOMParser === "undefined") {
    return svg;
  }

  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) {
    return svg;
  }

  const palette = dark ? DARK_PALETTE : LIGHT_PALETTE;
  const shapes = document.querySelectorAll(
    "g.node, g.cluster, g.classGroup, g.statediagram-state, rect.actor",
  );

  shapes.forEach((group, index) => {
    const colors = palette[index % palette.length];
    const target =
      group.tagName.toLowerCase() === "rect"
        ? group
        : group.querySelector("rect, polygon, path, circle, ellipse");
    if (target) {
      applyStyle(target, { fill: colors.fill, stroke: colors.stroke });
    }
    const labels = group.querySelectorAll("text, tspan");
    labels.forEach((label) => applyStyle(label, { fill: colors.text }));
  });

  return new XMLSerializer().serializeToString(document.documentElement);
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
    // En Mermaid 12 `htmlLabels` es global: si queda en true, las etiquetas
    // son HTML dentro de <foreignObject> y el saneado las elimina.
    htmlLabels: false,
    fontFamily: resolvedFontFamily(),
    themeVariables: {
      background: cssColor("--murk-bg", dark ? "#0d1117" : "#ffffff"),
      edgeLabelBackground: cssColor("--murk-bg", dark ? "#0d1117" : "#ffffff"),
    },
    flowchart: { useMaxWidth: true },
  });

  sequence += 1;
  const { svg } = await mermaid.render(`murk-mermaid-${sequence}`, source);
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });

  const colored = colorizeDiagram(clean, dark);
  cache.set(key, colored);
  return colored;
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
