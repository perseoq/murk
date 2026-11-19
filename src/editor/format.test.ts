// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { computeFormatEdit, formatKeymap } from "./format";

function state(doc: string, from: number, to = from): EditorState {
  return EditorState.create({ doc, selection: { anchor: from, head: to } });
}

describe("formato inline", () => {
  it("envuelve la selección en negrita", () => {
    const edit = computeFormatEdit(state("hola", 0, 4), "bold");
    expect(edit.insert).toBe("**hola**");
    expect(edit.selectionFrom).toBe(2);
  });

  it("inserta marcadores vacíos y deja el cursor dentro", () => {
    const edit = computeFormatEdit(state("hola", 2), "italic");
    expect(edit.insert).toBe("**");
    expect(edit.selectionFrom).toBe(3);
  });

  it("quita marcadores existentes", () => {
    const edit = computeFormatEdit(state("**hola**", 0, 8), "bold");
    expect(edit.insert).toBe("hola");
  });

  it("crea enlaces alrededor de la selección", () => {
    const edit = computeFormatEdit(state("hola", 0, 4), "link");
    expect(edit.insert).toBe("[hola]()");
    expect(edit.selectionFrom).toBe(7);
  });

  it("desenvuelve un enlace existente", () => {
    const edit = computeFormatEdit(state("[hola](url)", 0, 11), "link");
    expect(edit.insert).toBe("hola");
  });

  it("genera keymap por defecto y con overrides", () => {
    const defaults = formatKeymap();
    expect(defaults.map((binding) => binding.key)).toEqual([
      "Mod-b",
      "Mod-i",
      "Alt-Shift-5",
      "Mod-Shift-`",
      "Mod-k",
    ]);

    const custom = formatKeymap({ "format.bold": "Ctrl+Alt+B" });
    expect(custom[0].key).toBe("Mod-Alt-b");
  });
});
