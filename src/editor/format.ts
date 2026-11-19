// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import type { EditorState } from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";

export type FormatAction = "bold" | "italic" | "strikethrough" | "code" | "link";

export interface FormatEdit {
  from: number;
  to: number;
  insert: string;
  selectionFrom: number;
  selectionTo: number;
}

export const FORMAT_ACTIONS: Array<{
  action: FormatAction;
  label: string;
  shortcut: string;
}> = [
  { action: "bold", label: "Negrita", shortcut: "Ctrl+B" },
  { action: "italic", label: "Cursiva", shortcut: "Ctrl+I" },
  { action: "strikethrough", label: "Tachado", shortcut: "Alt+Shift+5" },
  { action: "code", label: "Código en línea", shortcut: "Ctrl+Shift+`" },
  { action: "link", label: "Enlace", shortcut: "Ctrl+K" },
];

const MARKERS: Record<Exclude<FormatAction, "link">, string> = {
  bold: "**",
  italic: "*",
  strikethrough: "~~",
  code: "`",
};

export function computeFormatEdit(state: EditorState, action: FormatAction): FormatEdit {
  const selection = state.selection.main;
  const text = state.sliceDoc(selection.from, selection.to);

  if (action === "link") {
    const existing = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(text);
    if (existing) {
      const label = existing[1];
      return {
        from: selection.from,
        to: selection.to,
        insert: label,
        selectionFrom: selection.from,
        selectionTo: selection.from + label.length,
      };
    }

    if (selection.empty) {
      return {
        from: selection.from,
        to: selection.to,
        insert: "[]()",
        selectionFrom: selection.from + 1,
        selectionTo: selection.from + 1,
      };
    }

    return {
      from: selection.from,
      to: selection.to,
      insert: `[${text}]()`,
      selectionFrom: selection.from + text.length + 3,
      selectionTo: selection.from + text.length + 3,
    };
  }

  const marker = MARKERS[action];

  if (text.length >= marker.length * 2 && text.startsWith(marker) && text.endsWith(marker)) {
    const inner = text.slice(marker.length, text.length - marker.length);
    return {
      from: selection.from,
      to: selection.to,
      insert: inner,
      selectionFrom: selection.from,
      selectionTo: selection.from + inner.length,
    };
  }

  if (selection.empty) {
    return {
      from: selection.from,
      to: selection.to,
      insert: `${marker}${marker}`,
      selectionFrom: selection.from + marker.length,
      selectionTo: selection.from + marker.length,
    };
  }

  return {
    from: selection.from,
    to: selection.to,
    insert: `${marker}${text}${marker}`,
    selectionFrom: selection.from + marker.length,
    selectionTo: selection.to + marker.length,
  };
}

export function applyFormat(view: EditorView, action: FormatAction): boolean {
  const edit = computeFormatEdit(view.state, action);
  view.dispatch({
    changes: { from: edit.from, to: edit.to, insert: edit.insert },
    selection: { anchor: edit.selectionFrom, head: edit.selectionTo },
  });
  view.focus();
  return true;
}

function codemirrorShortcut(shortcut: string): string {
  return shortcut
    .replace(/\bCtrl\b/g, "Mod")
    .replace(/\bCmd\b/g, "Mod")
    .replace(/\s+/g, "")
    .replace(/\+/g, "-");
}

export function formatKeymap(overrides: Record<string, string> = {}): KeyBinding[] {
  return FORMAT_ACTIONS.map((entry) => {
    const custom = overrides[`format.${entry.action}`];
    const shortcut = codemirrorShortcut(custom?.trim() || entry.shortcut);
    return {
      key: shortcut.replace(/-([A-Za-z])$/, (_match, letter: string) => `-${letter.toLowerCase()}`),
      run: (view: EditorView) => applyFormat(view, entry.action),
    };
  });
}
