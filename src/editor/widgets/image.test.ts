// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { beforeEach, describe, expect, it } from "vitest";

import { clearImageCache, resolveImagePath, setImageDocumentPath } from "./image";

describe("imágenes", () => {
  beforeEach(() => {
    setImageDocumentPath(null);
    clearImageCache();
  });

  it("resuelve rutas relativas contra el documento", () => {
    setImageDocumentPath("/home/roy/notas/a.md");

    expect(resolveImagePath("img/foto.png")).toBe("/home/roy/notas/img/foto.png");
    expect(resolveImagePath("../foto.png")).toBe("/home/roy/foto.png");
    expect(resolveImagePath("./foto.png")).toBe("/home/roy/notas/foto.png");
  });

  it("conserva rutas absolutas y decodifica espacios", () => {
    setImageDocumentPath("/home/roy/notas/a.md");

    expect(resolveImagePath("/tmp/foto.png")).toBe("/tmp/foto.png");
    expect(resolveImagePath("mi%20foto.png")).toBe("/home/roy/notas/mi foto.png");
    expect(resolveImagePath("file:///tmp/foto.png")).toBe("/tmp/foto.png");
  });

  it("no intenta cargar recursos remotos o data URLs", () => {
    setImageDocumentPath("/home/roy/notas/a.md");

    expect(resolveImagePath("https://x.com/a.png")).toBeNull();
    expect(resolveImagePath("data:image/png;base64,AAAA")).toBeNull();
  });

  it("devuelve null para relativas sin documento", () => {
    expect(resolveImagePath("foto.png")).toBeNull();
  });
});
