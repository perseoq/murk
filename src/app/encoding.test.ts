// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { describe, expect, it } from "vitest";

import { convertEol, detectEol, encodingDisplayName, normalizeEol } from "./encoding";

describe("encoding", () => {
  it("detecta el fin de línea predominante", () => {
    expect(detectEol("a\nb\n")).toBe("lf");
    expect(detectEol("a\r\nb\r\n")).toBe("crlf");
    expect(detectEol("a\rb\r")).toBe("cr");
    expect(detectEol("sin saltos")).toBe("lf");
    expect(detectEol("a\r\nb\nc")).toBe("crlf");
  });

  it("convierte el fin de línea sin duplicar retornos", () => {
    expect(convertEol("a\r\nb\nc", "lf")).toBe("a\nb\nc");
    expect(convertEol("a\r\nb\nc", "crlf")).toBe("a\r\nb\r\nc");
    expect(convertEol("a\r\nb\nc", "cr")).toBe("a\rb\rc");
  });

  it("normaliza valores desconocidos a LF", () => {
    expect(normalizeEol("crlf")).toBe("crlf");
    expect(normalizeEol("cr")).toBe("cr");
    expect(normalizeEol("otro")).toBe("lf");
    expect(normalizeEol(undefined)).toBe("lf");
  });
  it("muestra nombres legibles de codificación", () => {
    expect(encodingDisplayName("utf-8")).toBe("UTF-8");
    expect(encodingDisplayName("utf-16le")).toBe("UTF-16 LE");
    expect(encodingDisplayName("desconocida")).toBe("desconocida");
  });
});
