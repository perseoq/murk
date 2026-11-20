// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { describe, expect, it } from "vitest";

import { MathWidget } from "./math";

describe("widget de matemáticas", () => {
  it("usa un bloque para las fórmulas en display", () => {
    const element = new MathWidget("x^2", true).toDOM();
    expect(element.tagName).toBe("DIV");
    expect(element.classList.contains("cm-md-math-block")).toBe(true);
  });

  it("usa un span para las fórmulas en línea", () => {
    const element = new MathWidget("x^2", false).toDOM();
    expect(element.tagName).toBe("SPAN");
    expect(element.classList.contains("cm-md-math-inline")).toBe(true);
  });
});
