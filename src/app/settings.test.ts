// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  applySettings,
  normalizeAutosave,
  normalizeSettings,
  normalizeTheme,
} from "./settings";

describe("settings", () => {
  it("usa valores por defecto con entrada vacía", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("normaliza temas desconocidos", () => {
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("neón")).toBe("system");
    expect(normalizeTheme(undefined)).toBe("system");
  });

  it("limita tamaño de fuente y tabulación", () => {
    const settings = normalizeSettings({ fontSize: 200, tabSize: 0 });
    expect(settings.fontSize).toBe(32);
    expect(settings.tabSize).toBe(1);
  });

  it("redondea tamaños y trunca la tipografía", () => {
    const settings = normalizeSettings({ fontSize: 15.6, fontFamily: "x".repeat(300) });
    expect(settings.fontSize).toBe(16);
    expect(settings.fontFamily).toHaveLength(200);
  });

  it("normaliza el autoguardado y su intervalo", () => {
    expect(normalizeSettings({ autosave: "blur", autosaveIntervalMs: 1000 })).toMatchObject({
      autosave: "blur",
      autosaveIntervalMs: 5000,
    });

    expect(normalizeAutosave("otro")).toBe("off");
    expect(normalizeSettings({ autosaveIntervalMs: 9_999_999 })).toMatchObject({
      autosave: "off",
      autosaveIntervalMs: 600_000,
    });
  });

  it("normaliza atajos de formato y descarta claves desconocidas", () => {
    const settings = normalizeSettings({
      keybindings: {
        "format.bold": " Ctrl+Alt+B ",
        "format.italic": "",
        "otra.clave": "Ctrl+X",
      },
    });

    expect(settings.keybindings).toEqual({ "format.bold": "Ctrl+Alt+B" });
  });

  it("aplica tema y variables CSS", () => {
    const properties = new Map<string, string>();
    const root = {
      dataset: {} as DOMStringMap,
      style: {
        setProperty: (name: string, value: string) => properties.set(name, value),
      },
    } as unknown as HTMLElement;

    applySettings(
      { ...DEFAULT_SETTINGS, theme: "dark", fontFamily: "Noto Serif", fontSize: 18 },
      root,
    );

    expect(root.dataset.theme).toBe("dark");
    expect(properties.get("--editor-font-size")).toBe("18px");
    expect(properties.get("--editor-font-family")).toBe("Noto Serif");
  });

  it("quita el tema explícito en modo sistema", () => {
    const root = {
      dataset: { theme: "dark" } as DOMStringMap,
      style: { setProperty: () => undefined },
    } as unknown as HTMLElement;

    applySettings(DEFAULT_SETTINGS, root);

    expect(root.dataset.theme).toBeUndefined();
  });
});
