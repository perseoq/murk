// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { history, redo, undo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { EditorState, type Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";

interface CommandTarget {
  state: EditorState;
  dispatch: (transaction: Transaction) => void;
}

function insertAtEnd(state: EditorState, text: string): EditorState {
  return state.update({
    changes: { from: state.doc.length, insert: text },
    selection: { anchor: state.doc.length + text.length },
  }).state;
}

describe("editor base (CM6)", () => {
  it("deshace y rehace transacciones con historial", () => {
    let state = EditorState.create({ doc: "hola", extensions: [history()] });
    state = insertAtEnd(state, " mundo");

    expect(state.doc.toString()).toBe("hola mundo");

    let current = state;
    const view: CommandTarget = {
      get state() {
        return current;
      },
      dispatch(transaction: Transaction) {
        current = transaction.state;
      },
    };

    expect(undo(view)).toBe(true);
    expect(current.doc.toString()).toBe("hola");

    expect(redo(view)).toBe(true);
    expect(current.doc.toString()).toBe("hola mundo");
  });

  it("parsea GFM: tablas y listas de tareas", () => {
    const state = EditorState.create({
      doc: "| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] hecha\n",
      extensions: [markdown({ base: markdownLanguage })],
    });

    const tree = syntaxTree(state).toString();

    expect(tree).toContain("Table");
    expect(tree).toContain("Task");
  });

  it("parsea énfasis, código y encabezados", () => {
    const state = EditorState.create({
      doc: "# Título\n\n**fuerte** y *énfasis* y `código`\n",
      extensions: [markdown({ base: markdownLanguage })],
    });

    const tree = syntaxTree(state).toString();

    expect(tree).toContain("ATXHeading1");
    expect(tree).toContain("StrongEmphasis");
    expect(tree).toContain("Emphasis");
    expect(tree).toContain("InlineCode");
  });
});
