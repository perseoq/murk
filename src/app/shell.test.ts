// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fileOpen: vi.fn(),
  fileSave: vi.fn(),
  openFileDialog: vi.fn(),
  saveFileDialog: vi.fn(),
  settingsLoad: vi.fn(),
  settingsSave: vi.fn(),
  sessionLoad: vi.fn(),
  sessionSave: vi.fn(),
  version: vi.fn(),
  geometry: vi.fn(),
  restore: vi.fn(),
  setTitle: vi.fn(),
  close: vi.fn(),
  onCloseRequested: vi.fn(),
}));

vi.mock("../host", () => ({
  host: {
    isDesktop: () => true,
    fileOpen: mocks.fileOpen,
    fileSave: mocks.fileSave,
    openFileDialog: mocks.openFileDialog,
    saveFileDialog: mocks.saveFileDialog,
    settingsLoad: mocks.settingsLoad,
    settingsSave: mocks.settingsSave,
    sessionLoad: mocks.sessionLoad,
    sessionSave: mocks.sessionSave,
    version: mocks.version,
    window: {
      geometry: mocks.geometry,
      restore: mocks.restore,
      setTitle: mocks.setTitle,
      close: mocks.close,
      onCloseRequested: mocks.onCloseRequested,
    },
  },
}));

import { Shell } from "./shell";

function setEditorValue(editor: HTMLTextAreaElement, value: string): void {
  editor.value = value;
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Shell · flujo abrir → editar → guardar", () => {
  let shell: Shell | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    mocks.settingsLoad.mockResolvedValue(null);
    mocks.sessionLoad.mockResolvedValue(null);
    mocks.settingsSave.mockResolvedValue(undefined);
    mocks.sessionSave.mockResolvedValue(undefined);
    mocks.version.mockResolvedValue("0.0.0");
    mocks.geometry.mockResolvedValue({ width: 1200, height: 800, maximized: false });
    mocks.restore.mockResolvedValue(undefined);
    mocks.setTitle.mockResolvedValue(undefined);
    mocks.close.mockResolvedValue(undefined);
    mocks.onCloseRequested.mockResolvedValue(() => undefined);

    if (typeof window.requestAnimationFrame !== "function") {
      window.requestAnimationFrame = (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(0), 0);
    }
  });

  afterEach(() => {
    shell?.dispose();
    shell = null;
    vi.clearAllMocks();
  });

  it("abre un archivo, lo edita y lo guarda con el contenido actualizado", async () => {
    mocks.openFileDialog.mockResolvedValue("/tmp/nota.md");
    mocks.fileOpen.mockResolvedValue({
      path: "/tmp/nota.md",
      name: "nota.md",
      content: "# Hola",
      size: 6,
      modifiedMs: 1,
      readOnly: false,
    });
    mocks.fileSave.mockResolvedValue({
      path: "/tmp/nota.md",
      name: "nota.md",
      size: 12,
      modifiedMs: 2,
    });

    const root = document.querySelector<HTMLElement>("#app");
    if (!root) {
      throw new Error("falta #app");
    }

    shell = new Shell(root);
    await shell.boot();

    const editor = root.querySelector<HTMLTextAreaElement>("#editor");
    const saveState = root.querySelector<HTMLElement>("#save-state");
    if (!editor || !saveState) {
      throw new Error("faltan elementos del editor");
    }

    expect(editor.value).toBe("");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "o", ctrlKey: true }));
    await vi.waitFor(() => expect(editor.value).toBe("# Hola"));

    setEditorValue(editor, "# Hola mundo");
    expect(saveState.textContent).toBe("Sin guardar");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    await vi.waitFor(() =>
      expect(mocks.fileSave).toHaveBeenCalledWith("/tmp/nota.md", "# Hola mundo"),
    );
    await vi.waitFor(() => expect(saveState.textContent).toBe("Guardado"));

    expect(editor.value).toBe("# Hola mundo");
  });

  it("crea un documento sin título al arrancar sin sesión", async () => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) {
      throw new Error("falta #app");
    }

    shell = new Shell(root);
    await shell.boot();

    const tabs = root.querySelectorAll(".tab-label");
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.textContent).toBe("Sin título");
    expect(root.querySelector<HTMLElement>("#status-file")?.textContent).toBe("Sin título");
  });
});
