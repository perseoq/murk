// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import { findFrontmatter, murkFromFrontmatter, updateMurk } from "./frontmatter";

export type BulletStyle = "arrow" | "check" | "dot" | "circle";
export type OrderedStyle =
  "lower-alpha" | "upper-alpha" | "upper-roman" | "upper-roman-dot" | "decimal" | "decimal-paren";

export interface ListStyle {
  bullet?: BulletStyle;
  marker?: OrderedStyle;
}

export interface ListInfo {
  index: number;
  ordered: boolean;
  from: number;
  to: number;
  preview: string;
  style: ListStyle | null;
}

export const BULLET_OPTIONS: Array<{ id: BulletStyle; label: string; char: string }> = [
  { id: "arrow", label: "Flechas", char: "→" },
  { id: "check", label: "Palomitas", char: "✔" },
  { id: "dot", label: "Puntos negros", char: "•" },
  { id: "circle", label: "Puntos blancos", char: "◦" },
];

export const ORDERED_OPTIONS: Array<{ id: OrderedStyle; label: string; sample: string }> = [
  { id: "lower-alpha", label: "a) b) c)", sample: "a)" },
  { id: "upper-alpha", label: "A) B) C)", sample: "A)" },
  { id: "upper-roman", label: "I) II) III)", sample: "I)" },
  { id: "upper-roman-dot", label: "I. II. III.", sample: "I." },
  { id: "decimal", label: "1. 2. 3.", sample: "1." },
  { id: "decimal-paren", label: "1) 2) 3)", sample: "1)" },
];

const BULLETS = new Set(BULLET_OPTIONS.map((option) => option.id));
const MARKERS = new Set(ORDERED_OPTIONS.map((option) => option.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeListStyle(value: unknown): ListStyle | null {
  if (!isRecord(value)) {
    return null;
  }
  const style: ListStyle = {};
  if (typeof value.bullet === "string" && BULLETS.has(value.bullet as BulletStyle)) {
    style.bullet = value.bullet as BulletStyle;
  }
  if (typeof value.marker === "string" && MARKERS.has(value.marker as OrderedStyle)) {
    style.marker = value.marker as OrderedStyle;
  }
  return Object.keys(style).length > 0 ? style : null;
}

export function listsFromState(state: EditorState): Record<string, ListStyle> {
  const murk = murkFromFrontmatter(findFrontmatter(state));
  if (!isRecord(murk.lists)) {
    return {};
  }
  const lists: Record<string, ListStyle> = {};
  for (const [key, value] of Object.entries(murk.lists)) {
    const style = normalizeListStyle(value);
    if (style) {
      lists[key] = style;
    }
  }
  return lists;
}

export function saveListStyle(view: EditorView, index: number, style: ListStyle): void {
  updateMurk(view, (murk) => {
    const lists = isRecord(murk.lists) ? { ...murk.lists } : {};
    const cleaned: ListStyle = {};
    if (style.bullet) {
      cleaned.bullet = style.bullet;
    }
    if (style.marker) {
      cleaned.marker = style.marker;
    }
    if (Object.keys(cleaned).length > 0) {
      lists[String(index)] = cleaned;
    } else {
      delete lists[String(index)];
    }
    if (Object.keys(lists).length > 0) {
      murk.lists = lists;
    } else {
      delete murk.lists;
    }
  });
}

export function bulletChar(style: BulletStyle): string {
  return BULLET_OPTIONS.find((option) => option.id === style)?.char ?? "•";
}

const ROMAN: Array<[number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function romanNumber(value: number): string {
  let remaining = Math.max(1, Math.floor(value));
  let output = "";
  for (const [amount, symbol] of ROMAN) {
    while (remaining >= amount) {
      output += symbol;
      remaining -= amount;
    }
  }
  return output;
}

export function orderedMarker(style: OrderedStyle, ordinal: number): string {
  const value = Math.max(1, ordinal);
  switch (style) {
    case "lower-alpha":
      return `${String.fromCharCode(97 + ((value - 1) % 26))})`;
    case "upper-alpha":
      return `${String.fromCharCode(65 + ((value - 1) % 26))})`;
    case "upper-roman":
      return `${romanNumber(value)})`;
    case "upper-roman-dot":
      return `${romanNumber(value)}.`;
    case "decimal":
      return `${value}.`;
    case "decimal-paren":
      return `${value})`;
  }
}

/** Posición del ListItem dentro de su lista (1-based). */
export function itemOrdinal(mark: SyntaxNode): number {
  const item = mark.parent;
  const list = item?.parent;
  if (!item || !list) {
    return 1;
  }
  let count = 0;
  for (let child = list.firstChild; child; child = child.nextSibling) {
    if (child.name === "ListItem") {
      count += 1;
      if (child.from === item.from) {
        return count;
      }
    }
  }
  return Math.max(1, count);
}

function listName(name: string): boolean {
  return name === "BulletList" || name === "OrderedList";
}

/** Listas del documento en orden, con su estilo guardado. */
export function listsInState(state: EditorState): ListInfo[] {
  const styles = listsFromState(state);
  const doc = state.doc;
  const result: ListInfo[] = [];
  let index = 0;

  const tree = ensureSyntaxTree(state, doc.length, 1000) ?? syntaxTree(state);
  tree.iterate({
    enter: (node) => {
      if (!listName(node.name)) {
        return;
      }
      const firstLine = doc.lineAt(node.from);
      result.push({
        index,
        ordered: node.name === "OrderedList",
        from: node.from,
        to: node.to,
        preview: firstLine.text.replace(/^\s*([-*+]|\d+[.)])\s+/, "").slice(0, 60),
        style: styles[String(index)] ?? null,
      });
      index += 1;
    },
  });

  return result;
}

export function listIndexAt(state: EditorState, position: number): number | null {
  let found: ListInfo | null = null;
  for (const info of listsInState(state)) {
    if (info.from <= position && position <= info.to) {
      if (!found || info.to - info.from < found.to - found.from) {
        found = info;
      }
    }
  }
  return found?.index ?? null;
}

export function listsToCss(lists: ListInfo[]): string {
  const rules: string[] = [];
  lists.forEach((info) => {
    const style = info.style;
    if (!style) {
      return;
    }
    const className = `murk-list-${info.index}`;
    if (info.ordered && style.marker) {
      const counter = `murk-counter-${info.index}`;
      let counterStyle = "decimal";
      let suffix = ".";
      switch (style.marker) {
        case "lower-alpha":
          counterStyle = "lower-alpha";
          suffix = ")";
          break;
        case "upper-alpha":
          counterStyle = "upper-alpha";
          suffix = ")";
          break;
        case "upper-roman":
          counterStyle = "upper-roman";
          suffix = ")";
          break;
        case "upper-roman-dot":
          counterStyle = "upper-roman";
          suffix = ".";
          break;
        case "decimal":
          counterStyle = "decimal";
          suffix = ".";
          break;
        case "decimal-paren":
          counterStyle = "decimal";
          suffix = ")";
          break;
      }
      rules.push(
        `ol.${className} { list-style: none; padding-left: 2em; counter-reset: ${counter}; }`,
      );
      rules.push(`ol.${className} > li { counter-increment: ${counter}; position: relative; }`);
      rules.push(
        `ol.${className} > li::before { content: counter(${counter}, ${counterStyle}) "${suffix}"; position: absolute; left: -1.7em; }`,
      );
    } else if (!info.ordered && style.bullet) {
      rules.push(`ul.${className} { list-style: none; padding-left: 1.7em; }`);
      rules.push(`ul.${className} > li { position: relative; }`);
      rules.push(
        `ul.${className} > li::before { content: "${bulletChar(style.bullet)}"; position: absolute; left: -1.2em; }`,
      );
    }
  });
  return rules.join("\n");
}

/**
 * Reescribe los marcadores de listas ordenadas con estilos personalizados para
 * que Pandoc (DOCX/LaTeX/EPUB) conserve la numeración elegida.
 */
export function rewriteListsForPandoc(state: EditorState): string {
  const infos = listsInState(state);
  const styles = new Map(infos.map((info) => [info.index, info]));
  const edits: Array<{ from: number; to: number; insert: string }> = [];
  let index = 0;
  const stack: number[] = [];
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);

  tree.iterate({
    enter: (node) => {
      if (listName(node.name)) {
        stack.push(index);
        index += 1;
        return;
      }
      if (node.name !== "ListMark") {
        return;
      }
      const current = stack.at(-1);
      const info = current === undefined ? undefined : styles.get(current);
      if (!info?.ordered || !info.style?.marker) {
        return;
      }
      edits.push({
        from: node.from,
        to: node.to,
        insert: orderedMarker(info.style.marker, itemOrdinal(node.node)),
      });
    },
    leave: (node) => {
      if (listName(node.name)) {
        stack.pop();
      }
    },
  });

  if (edits.length === 0) {
    return state.doc.toString();
  }

  let content = state.doc.toString();
  for (const edit of edits.sort((a, b) => b.from - a.from)) {
    content = content.slice(0, edit.from) + edit.insert + content.slice(edit.to);
  }
  return content;
}
