// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fileOpen: vi.fn(),
  fileSave: vi.fn(),
  openFileDialog: vi.fn(),
  saveFileDialog: vi.fn(),
  watchFile: vi.fn(),
  unwatchFile: vi.fn(),
  listenFileChanged: vi.fn(),
  listenOpenFiles: vi.fn(),
  startupFiles: vi.fn(),
  recentList: vi.fn(),
  recentAdd: vi.fn(),
  recentClear: vi.fn(),
  recoveryCheckCrash: vi.fn(),
  recoveryMarkClean: vi.fn(),
  recoveryWrite: vi.fn(),
  recoveryList: vi.fn(),
  recoveryDelete: vi.fn(),
  recoveryClear: vi.fn(),
  historyRecord: vi.fn(),
  historyList: vi.fn(),
  historyRead: vi.fn(),
  historyClear: vi.fn(),
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

vi.mock("../editor/editor", () => {
  class FakeMurkEditor {
    private content = "";
    private cursor = 0;
    private readonly onChange: (content: string) => void;

    constructor(
      _parent: HTMLElement,
      options: {
        onChange: (content: string) => void;
        onCursor: (cursor: number) => void;
      },
    ) {
      this.onChange = options.onChange;
    }

    activate(_tabId: string, content: string, cursor: number): void {
      this.content = content;
      this.cursor = cursor;
    }

    capture(): { content: string; cursor: number; scroll: number } {
      return { content: this.content, cursor: this.cursor, scroll: 0 };
    }

    getContent(): string {
      return this.content;
    }

    getCursor(): number {
      return this.cursor;
    }

    setContent(content: string, cursor = 0): void {
      this.content = content;
      this.cursor = cursor;
      this.onChange(content);
    }

    setReadOnly(): void {}
    setTabSize(): void {}
    setSpellcheck(): void {}
    setKeybindings(): void {}
    refresh(): void {}
    scrollToRatio(): void {}
    invalidate(): void {}
    forget(): void {}
    focus(): void {}
    undo(): boolean {
      return true;
    }
    redo(): boolean {
      return true;
    }
    selectAll(): boolean {
      return true;
    }
    find(): boolean {
      return true;
    }
    findNext(): boolean {
      return true;
    }
    replace(): boolean {
      return true;
    }
    destroy(): void {}
  }

  return { MurkEditor: FakeMurkEditor };
});

vi.mock("../host", () => ({
  host: {
    isDesktop: () => true,
    fileOpen: mocks.fileOpen,
    fileSave: mocks.fileSave,
    openFileDialog: mocks.openFileDialog,
    saveFileDialog: mocks.saveFileDialog,
    watchFile: mocks.watchFile,
    unwatchFile: mocks.unwatchFile,
    listenFileChanged: mocks.listenFileChanged,
    listenOpenFiles: mocks.listenOpenFiles,
    startupFiles: mocks.startupFiles,
    recentList: mocks.recentList,
    recentAdd: mocks.recentAdd,
    recentClear: mocks.recentClear,
    recoveryCheckCrash: mocks.recoveryCheckCrash,
    recoveryMarkClean: mocks.recoveryMarkClean,
    recoveryWrite: mocks.recoveryWrite,
    recoveryList: mocks.recoveryList,
    recoveryDelete: mocks.recoveryDelete,
    recoveryClear: mocks.recoveryClear,
    historyRecord: mocks.historyRecord,
    historyList: mocks.historyList,
    historyRead: mocks.historyRead,
    historyClear: mocks.historyClear,
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

describe("Shell · flujo abrir → editar → guardar", () => {
  let shell: Shell | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    mocks.settingsLoad.mockResolvedValue(null);
    mocks.sessionLoad.mockResolvedValue(null);
    mocks.settingsSave.mockResolvedValue(undefined);
    mocks.sessionSave.mockResolvedValue(undefined);
    mocks.watchFile.mockResolvedValue(undefined);
    mocks.unwatchFile.mockResolvedValue(undefined);
    mocks.listenFileChanged.mockResolvedValue(() => undefined);
    mocks.listenOpenFiles.mockResolvedValue(() => undefined);
    mocks.startupFiles.mockResolvedValue([]);
    mocks.recentList.mockResolvedValue([]);
    mocks.recentAdd.mockResolvedValue([]);
    mocks.recentClear.mockResolvedValue(undefined);
    mocks.recoveryCheckCrash.mockResolvedValue(false);
    mocks.recoveryMarkClean.mockResolvedValue(undefined);
    mocks.recoveryWrite.mockResolvedValue({
      id: "s1",
      docId: "d1",
      path: null,
      name: "x",
      content: "",
      createdAt: 1,
      reason: "interval",
    });
    mocks.recoveryList.mockResolvedValue([]);
    mocks.recoveryDelete.mockResolvedValue(undefined);
    mocks.recoveryClear.mockResolvedValue(undefined);
    mocks.historyRecord.mockResolvedValue(undefined);
    mocks.historyList.mockResolvedValue([]);
    mocks.historyRead.mockResolvedValue("");
    mocks.historyClear.mockResolvedValue(undefined);
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
      encoding: "utf-8",
      eol: "lf",
      bom: false,
      fingerprint: "fp-1",
    });
    mocks.fileSave.mockResolvedValue({
      path: "/tmp/nota.md",
      name: "nota.md",
      size: 12,
      modifiedMs: 2,
      encoding: "utf-8",
      eol: "lf",
      bom: false,
      fingerprint: "fp-2",
    });

    const root = document.querySelector<HTMLElement>("#app");
    if (!root) {
      throw new Error("falta #app");
    }

    shell = new Shell(root);
    await shell.boot();

    const saveState = root.querySelector<HTMLElement>("#save-state");
    if (!saveState) {
      throw new Error("falta el estado de guardado");
    }

    expect(root.querySelectorAll(".tab-label")).toHaveLength(1);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "o", ctrlKey: true }));
    await vi.waitFor(() => expect(root.querySelector(".tab-label")?.textContent).toBe("nota.md"));

    shell.replaceActiveContent("# Hola mundo");
    expect(saveState.textContent).toBe("Sin guardar");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    await vi.waitFor(() =>
      expect(mocks.fileSave).toHaveBeenCalledWith(
        "/tmp/nota.md",
        "# Hola mundo",
        expect.objectContaining({
          encoding: "utf-8",
          eol: "lf",
          bom: false,
          convertEol: false,
          expectedFingerprint: "fp-1",
        }),
      ),
    );
    await vi.waitFor(() => expect(saveState.textContent).toBe("Guardado"));
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
