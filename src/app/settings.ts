// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import type { RepositoryConfig, RepositoryStrategy, Settings, ThemeMode } from "../host";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  fontFamily: "",
  fontSize: 16,
  tabSize: 4,
  autosave: "off",
  autosaveIntervalMs: 30_000,
  pandocPath: "",
  chromiumPath: "",
  pdfEngine: "chromium",
  spellcheck: true,
  spellcheckLanguage: "",
  keybindings: {},
};

export const DEFAULT_REPOSITORY: RepositoryConfig = {
  url: "",
  branch: "main",
  path: "",
  strategy: "merge",
  pullBeforePush: true,
  createBranch: false,
  autoPush: false,
};

function normalizeStrategy(value: unknown): RepositoryStrategy {
  return value === "merge" || value === "rebase" || value === "none" ? value : "merge";
}

export interface RepositoryInput {
  url?: unknown;
  branch?: unknown;
  path?: unknown;
  strategy?: unknown;
  pullBeforePush?: unknown;
  createBranch?: unknown;
  autoPush?: unknown;
}

/** Normaliza la configuración del repositorio tal como la valida el backend. */
export function normalizeRepository(input: RepositoryInput | null): RepositoryConfig {
  const path =
    typeof input?.path === "string"
      ? input.path
          .trim()
          .replace(/^\.?\/+/, "")
          .replace(/\/+$/, "")
      : "";
  return {
    url: typeof input?.url === "string" ? input.url.trim() : "",
    branch: (typeof input?.branch === "string" ? input.branch.trim() : "") || "main",
    path,
    strategy: normalizeStrategy(input?.strategy),
    pullBeforePush: input?.pullBeforePush !== false,
    createBranch: input?.createBranch === true,
    autoPush: input?.autoPush === true,
  };
}

export function normalizeTheme(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function normalizeAutosave(value: unknown): Settings["autosave"] {
  return value === "interval" || value === "blur" || value === "save" ? value : "off";
}

export function normalizePdfEngine(value: unknown): Settings["pdfEngine"] {
  return value === "pandoc" ? "pandoc" : "chromium";
}

const FORMAT_KEYS = new Set([
  "format.bold",
  "format.italic",
  "format.strikethrough",
  "format.code",
  "format.link",
]);

export function normalizeKeybindings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, shortcut] of Object.entries(value)) {
    if (FORMAT_KEYS.has(key) && typeof shortcut === "string" && shortcut.trim().length > 0) {
      result[key] = shortcut.trim().slice(0, 40);
    }
  }
  return result;
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
    pandocPath: typeof input?.pandocPath === "string" ? input.pandocPath.slice(0, 500) : "",
    chromiumPath: typeof input?.chromiumPath === "string" ? input.chromiumPath.slice(0, 500) : "",
    pdfEngine: normalizePdfEngine(input?.pdfEngine),
    spellcheck: typeof input?.spellcheck === "boolean" ? input.spellcheck : true,
    spellcheckLanguage:
      typeof input?.spellcheckLanguage === "string" ? input.spellcheckLanguage.slice(0, 20) : "",
    keybindings: normalizeKeybindings(input?.keybindings),
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
