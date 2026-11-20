// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { describe, expect, it, vi } from "vitest";

import { CodeHeaderWidget } from "./code";

describe("cabecera de bloque de código", () => {
  it("muestra el lenguaje en modo edición", () => {
    const element = new CodeHeaderWidget("javascript", "const x = 1;", false).toDOM();
    expect(element.textContent).toBe("javascript");
    expect(element.querySelector("button")).toBeNull();
  });

  it("muestra el botón de copiar en solo lectura", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const widget = new CodeHeaderWidget("js", "const x = 1;", true);
    const element = widget.toDOM();
    const button = element.querySelector<HTMLButtonElement>("button");
    expect(button).not.toBeNull();

    button?.click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("const x = 1;");
    expect(button?.textContent).toBe("Copiado");
  });
});
