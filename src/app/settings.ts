// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import type { Settings, ThemeMode } from "../host";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  fontFamily: "",
  fontSize: 16,
  tabSize: 4,
  autosave: "off",
  autosaveIntervalMs: 30_000,
};

export function normalizeTheme(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function normalizeAutosave(value: unknown): Settings["autosave"] {
  return value === "interval" || value === "blur" || value === "save" ? value : "off";
}

export function normalizeSettings(input: Partial<Settings> | null | undefined): Settings {
  const fontSize = Number.isFinite(input?.fontSize)
    ? Number(input?.fontSize)
    : DEFAULT_SETTINGS.fontSize;
  const tabSize = Number.isFinite(input?.tabSize)
    ? Number(input?.tabSize)
    : DEFAULT_SETTINGS.tabSize;
  const interval = Number.isFinite(input?.autosaveIntervalMs)
    ? Number(input?.autosaveIntervalMs)
    : DEFAULT_SETTINGS.autosaveIntervalMs;

  return {
    theme: normalizeTheme(input?.theme),
    fontFamily: typeof input?.fontFamily === "string" ? input.fontFamily.slice(0, 200) : "",
    fontSize: Math.min(32, Math.max(10, Math.round(fontSize))),
    tabSize: Math.min(8, Math.max(1, Math.round(tabSize))),
    autosave: normalizeAutosave(input?.autosave),
    autosaveIntervalMs: Math.min(600_000, Math.max(5_000, Math.round(interval))),
  };
}

export function applySettings(
  settings: Settings,
  root: HTMLElement = document.documentElement,
): void {
  if (settings.theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = settings.theme;
  }

  root.style.setProperty("--editor-font-size", `${settings.fontSize}px`);
  root.style.setProperty("--editor-font-family", settings.fontFamily.trim() || "var(--murk-font)");
}
