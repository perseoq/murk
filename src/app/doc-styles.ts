// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { findFrontmatter, murkFromFrontmatter, updateMurk } from "../editor/frontmatter";

export type StyleTarget =
  "body" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "code" | "quote" | "tableHeader" | "link";

export interface TargetStyle {
  family?: string;
  bold?: boolean;
  italic?: boolean;
  heavier?: boolean;
  highlight?: boolean;
  color?: string;
}

export interface DocumentStyles {
  targets: Partial<Record<StyleTarget, TargetStyle>>;
}

export const STYLE_TARGETS: Array<{ id: StyleTarget; label: string }> = [
  { id: "body", label: "Texto normal" },
  { id: "h1", label: "Título 1 (H1)" },
  { id: "h2", label: "Título 2 (H2)" },
  { id: "h3", label: "Título 3 (H3)" },
  { id: "h4", label: "Título 4 (H4)" },
  { id: "h5", label: "Título 5 (H5)" },
  { id: "h6", label: "Título 6 (H6)" },
  { id: "code", label: "Código" },
  { id: "quote", label: "Cita" },
  { id: "tableHeader", label: "Cabecera de tabla" },
  { id: "link", label: "Enlace" },
];

export const FONT_FAMILIES: Array<{ label: string; value: string }> = [
  { label: "Predeterminada", value: "" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Noto Sans", value: "'Noto Sans', sans-serif" },
  { label: "DejaVu Sans", value: "'DejaVu Sans', sans-serif" },
  { label: "Arial / Helvetica", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "DejaVu Sans Mono", value: "'DejaVu Sans Mono', monospace" },
  { label: "Courier New", value: "'Courier New', monospace" },
];

const EDITOR_SELECTORS: Record<StyleTarget, string> = {
  body: ".cm-content",
  h1: ".cm-md-h1",
  h2: ".cm-md-h2",
  h3: ".cm-md-h3",
  h4: ".cm-md-h4",
  h5: ".cm-md-h5",
  h6: ".cm-md-h6",
  code: ".cm-md-inline-code, .cm-md-code-line, .cm-md-table code",
  quote: ".cm-md-quote",
  tableHeader: ".cm-md-table th",
  link: ".cm-md-link, .cm-md-table-link",
};

const EXPORT_SELECTORS: Record<StyleTarget, string> = {
  body: "body",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  code: "code, pre code, pre",
  quote: "blockquote",
  tableHeader: "thead th",
  link: "a",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}

function normalizeTarget(value: unknown): TargetStyle {
  if (!isRecord(value)) {
    return {};
  }
  const style: TargetStyle = {};
  if (typeof value.family === "string" && value.family.trim()) {
    style.family = value.family
      .replace(/[<>;{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (value.bold === true) {
    style.bold = true;
  }
  if (value.italic === true) {
    style.italic = true;
  }
  if (value.heavier === true) {
    style.heavier = true;
  }
  if (value.highlight === true) {
    style.highlight = true;
  }
  const color = validColor(value.color);
  if (color) {
    style.color = color;
  }
  return style;
}

export function normalizeStyles(value: unknown): DocumentStyles {
  const styles: DocumentStyles = { targets: {} };
  if (!isRecord(value) || !isRecord(value.targets)) {
    return styles;
  }
  for (const target of STYLE_TARGETS) {
    const normalized = normalizeTarget(value.targets[target.id]);
    if (Object.keys(normalized).length > 0) {
      styles.targets[target.id] = normalized;
    }
  }
  return styles;
}

export function stylesFromState(state: EditorState): DocumentStyles {
  return normalizeStyles(murkFromFrontmatter(findFrontmatter(state)).styles);
}

export function serializeStyles(styles: DocumentStyles): Record<string, unknown> {
  const targets: Record<string, unknown> = {};
  for (const target of STYLE_TARGETS) {
    const style = styles.targets[target.id];
    if (!style) {
      continue;
    }
    const value: Record<string, unknown> = {};
    if (style.family) value.family = style.family;
    if (style.bold) value.bold = true;
    if (style.italic) value.italic = true;
    if (style.heavier) value.heavier = true;
    if (style.highlight) value.highlight = true;
    if (style.color) value.color = style.color;
    if (Object.keys(value).length > 0) {
      targets[target.id] = value;
    }
  }
  return { targets };
}

function declarations(style: TargetStyle): string {
  const parts: string[] = [];
  if (style.family) {
    parts.push(`font-family:${style.family}`);
  }
  if (style.bold) {
    parts.push("font-weight:700");
  }
  if (style.heavier) {
    parts.push("font-weight:800");
  }
  if (style.italic) {
    parts.push("font-style:italic");
  }
  if (style.highlight) {
    parts.push("background-color:#fff59d", "color:#1f2328");
  }
  if (style.color) {
    parts.push(`color:${style.color}`);
  }
  return parts.join(";");
}

export function stylesToCss(styles: DocumentStyles, mode: "editor" | "export"): string {
  const selectors = mode === "editor" ? EDITOR_SELECTORS : EXPORT_SELECTORS;
  const prefix = mode === "editor" ? ".editor-host " : "";
  const rules: string[] = [];

  for (const target of STYLE_TARGETS) {
    const style = styles.targets[target.id];
    if (!style) {
      continue;
    }
    const body = declarations(style);
    if (!body) {
      continue;
    }
    rules.push(`${prefix}${selectors[target.id]} { ${body} }`);
  }

  return rules.join("\n");
}

/** Aplica los estilos del documento al editor (vista previa en vivo). */
export function applyStyles(styles: DocumentStyles): void {
  if (typeof document === "undefined") {
    return;
  }
  const css = stylesToCss(styles, "editor");
  let element = document.getElementById("murk-document-styles") as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = "murk-document-styles";
    document.head.append(element);
  }
  if (element.textContent !== css) {
    element.textContent = css;
  }
}

export function applyDocumentStyles(state: EditorState): void {
  applyStyles(stylesFromState(state));
}

export function saveStyles(view: EditorView, styles: DocumentStyles): void {
  const serialized = serializeStyles(styles);
  updateMurk(view, (murk) => {
    if (Object.keys(serialized.targets as Record<string, unknown>).length > 0) {
      murk.styles = serialized;
    } else {
      delete murk.styles;
    }
  });
}
