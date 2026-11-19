// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { describe, expect, it } from "vitest";

import type { OpenedFile, SavedFile } from "../host";
import { Workspace, countWords, displayPath } from "./state";

function openedFile(name: string, path: string, content = ""): OpenedFile {
  return {
    path,
    name,
    content,
    size: content.length,
    modifiedMs: 1,
    readOnly: false,
  };
}

function savedFile(name: string, path: string): SavedFile {
  return { path, name, size: 1, modifiedMs: 2 };
}

describe("Workspace", () => {
  it("crea pestañas sin título con nombres incrementales", () => {
    const workspace = new Workspace();

    const first = workspace.createUntitled();
    const second = workspace.createUntitled();

    expect(first.name).toBe("Sin título");
    expect(second.name).toBe("Sin título-2");
    expect(workspace.tabs).toHaveLength(2);
    expect(workspace.activeId).toBe(second.id);
  });

  it("reutiliza la pestaña sin título vacía al abrir un archivo", () => {
    const workspace = new Workspace();
    const placeholder = workspace.createUntitled();

    const tab = workspace.openDocument(openedFile("nota.md", "/tmp/nota.md", "hola"));

    expect(tab.id).toBe(placeholder.id);
    expect(workspace.tabs).toHaveLength(1);
    expect(tab.path).toBe("/tmp/nota.md");
    expect(tab.content).toBe("hola");
    expect(tab.dirty).toBe(false);
  });

  it("activa la pestaña existente al abrir la misma ruta", () => {
    const workspace = new Workspace();
    const first = workspace.openDocument(openedFile("a.md", "/tmp/a.md"));
    workspace.createUntitled();

    const again = workspace.openDocument(openedFile("a.md", "/tmp/a.md", "nuevo"));

    expect(again.id).toBe(first.id);
    expect(workspace.tabs).toHaveLength(2);
    expect(workspace.activeId).toBe(first.id);
    expect(again.content).toBe(""); // no se recarga un documento abierto
  });

  it("marca sucio al cambiar el contenido y limpio al guardar", () => {
    const workspace = new Workspace();
    const tab = workspace.createUntitled();

    workspace.updateContent(tab.id, "texto");
    expect(tab.dirty).toBe(true);
    expect(tab.content).toBe("texto");

    workspace.markSaved(tab.id, savedFile("texto.md", "/tmp/texto.md"));
    expect(tab.dirty).toBe(false);
    expect(tab.path).toBe("/tmp/texto.md");
    expect(tab.name).toBe("texto.md");
  });

  it("no marca sucio si el contenido no cambió", () => {
    const workspace = new Workspace();
    const tab = workspace.createUntitled();

    workspace.updateContent(tab.id, "");
    expect(tab.dirty).toBe(false);
  });

  it("al cerrar la pestaña activa selecciona la vecina", () => {
    const workspace = new Workspace();
    const first = workspace.openDocument(openedFile("a.md", "/tmp/a.md"));
    const second = workspace.openDocument(openedFile("b.md", "/tmp/b.md"));
    const third = workspace.openDocument(openedFile("c.md", "/tmp/c.md"));

    expect(workspace.activeId).toBe(third.id);

    workspace.closeTab(third.id);
    expect(workspace.activeId).toBe(second.id);
    expect(workspace.tabs).toHaveLength(2);

    workspace.closeTab(first.id);
    expect(workspace.activeId).toBe(second.id);
    expect(workspace.tabs).toHaveLength(1);

    workspace.closeTab(second.id);
    expect(workspace.activeId).toBeNull();
    expect(workspace.tabs).toHaveLength(0);
  });

  it("serializa solo documentos con ruta y conserva índice activo", () => {
    const workspace = new Workspace();
    const first = workspace.openDocument(openedFile("a.md", "/tmp/a.md"));
    workspace.openDocument(openedFile("b.md", "/tmp/b.md"));
    workspace.createUntitled();
    workspace.setActive(first.id);
    first.cursor = 7;
    first.scroll = 0.5;

    const session = workspace.serialize({ width: 1200, height: 800, maximized: false });

    expect(session.openFiles).toEqual([
      { path: "/tmp/a.md", cursor: 7, scroll: 0.5 },
      { path: "/tmp/b.md", cursor: 0, scroll: 0 },
    ]);
    expect(session.activeIndex).toBe(0);
    expect(session.windowWidth).toBe(1200);
    expect(session.maximized).toBe(false);
  });

  it("detecta documentos sucios", () => {
    const workspace = new Workspace();
    const tab = workspace.createUntitled();

    expect(workspace.hasDirty()).toBe(false);
    workspace.updateContent(tab.id, "x");
    expect(workspace.hasDirty()).toBe(true);
  });
});

describe("utilidades", () => {
  it("cuenta palabras con acentos y números", () => {
    expect(countWords("Hola, mundo. Año 2026.")).toBe(4);
    expect(countWords("")).toBe(0);
  });

  it("muestra una ruta abreviada", () => {
    expect(displayPath("/home/roy/notas/a.md")).toBe("/home/roy/notas/a.md");
    expect(displayPath(null)).toBe("Sin título");
  });
});
