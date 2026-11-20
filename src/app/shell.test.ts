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
  repositoryConfigLoad: vi.fn(),
  repositoryConfigSave: vi.fn(),
  repositoryPush: vi.fn(),
  sessionLoad: vi.fn(),
  sessionSave: vi.fn(),
  version: vi.fn(),
  geometry: vi.fn(),
  restore: vi.fn(),
  setTitle: vi.fn(),
  close: vi.fn(),
  destroy: vi.fn(),
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
    setSourceMode(): void {}
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
    repositoryConfigLoad: mocks.repositoryConfigLoad,
    repositoryConfigSave: mocks.repositoryConfigSave,
    repositoryPush: mocks.repositoryPush,
    sessionLoad: mocks.sessionLoad,
    sessionSave: mocks.sessionSave,
    version: mocks.version,
    window: {
      geometry: mocks.geometry,
      restore: mocks.restore,
      setTitle: mocks.setTitle,
      close: mocks.close,
      destroy: mocks.destroy,
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
    mocks.repositoryConfigLoad.mockResolvedValue(null);
    mocks.repositoryConfigSave.mockImplementation((config: unknown) => Promise.resolve(config));
    mocks.repositoryPush.mockResolvedValue({
      branch: "main",
      remoteUrl: "https://example.com/repo.git",
      commit: "update: 2026-11-19T00:00:00Z",
      files: ["nota.md"],
    });
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
    mocks.destroy.mockResolvedValue(undefined);
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

  it("oculta y muestra la barra lateral con el botón hamburguesa", async () => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) {
      throw new Error("falta #app");
    }

    shell = new Shell(root);
    await shell.boot();

    const toggle = root.querySelector<HTMLButtonElement>("#sidebar-toggle");
    const workspace = root.querySelector<HTMLElement>("#workspace");
    const sidebar = root.querySelector<HTMLElement>("#sidebar");
    if (!toggle || !workspace || !sidebar) {
      throw new Error("faltan elementos de la barra lateral");
    }

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(sidebar.getAttribute("aria-hidden")).toBe("false");

    toggle.click();
    expect(workspace.classList.contains("sidebar-hidden")).toBe(true);
    expect(sidebar.getAttribute("aria-hidden")).toBe("true");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.click();
    expect(workspace.classList.contains("sidebar-hidden")).toBe(false);
    expect(sidebar.getAttribute("aria-hidden")).toBe("false");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("marca y desmarca el autoguardado desde el menú Archivo", async () => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) {
      throw new Error("falta #app");
    }

    shell = new Shell(root);
    await shell.boot();

    const fileButton = Array.from(root.querySelectorAll<HTMLButtonElement>(".menu-button")).find(
      (button) => button.textContent === "Archivo",
    );
    if (!fileButton) {
      throw new Error("falta el menú Archivo");
    }

    fileButton.click();
    const first = root.querySelector<HTMLButtonElement>('[data-action="file.autosave"]');
    expect(first?.getAttribute("aria-checked")).toBe("false");

    first?.click();
    await vi.waitFor(() =>
      expect(mocks.settingsSave).toHaveBeenCalledWith(
        expect.objectContaining({ autosave: "interval" }),
      ),
    );

    fileButton.click();
    const second = root.querySelector<HTMLButtonElement>('[data-action="file.autosave"]');
    expect(second?.getAttribute("aria-checked")).toBe("true");

    second?.click();
    await vi.waitFor(() =>
      expect(mocks.settingsSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ autosave: "off" }),
      ),
    );

    fileButton.click();
    expect(
      root
        .querySelector<HTMLButtonElement>('[data-action="file.autosave"]')
        ?.getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("cambia entre modo código, editor y solo lectura desde la barra de estado", async () => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) {
      throw new Error("falta #app");
    }

    shell = new Shell(root);
    await shell.boot();

    const code = root.querySelector<HTMLButtonElement>("#status-mode-code");
    const editor = root.querySelector<HTMLButtonElement>("#status-mode-editor");
    const readOnly = root.querySelector<HTMLButtonElement>("#status-mode-readonly");
    if (!code || !editor || !readOnly) {
      throw new Error("faltan los botones de modo");
    }

    expect(editor.getAttribute("aria-pressed")).toBe("true");
    expect(code.getAttribute("aria-pressed")).toBe("false");

    code.click();
    expect(code.getAttribute("aria-pressed")).toBe("true");
    expect(code.classList.contains("active")).toBe(true);
    expect(editor.getAttribute("aria-pressed")).toBe("false");

    editor.click();
    expect(editor.getAttribute("aria-pressed")).toBe("true");
    expect(code.getAttribute("aria-pressed")).toBe("false");

    readOnly.click();
    expect(readOnly.getAttribute("aria-pressed")).toBe("true");
    expect(readOnly.classList.contains("active")).toBe(true);

    readOnly.click();
    expect(readOnly.getAttribute("aria-pressed")).toBe("false");
  });

  it("abre el modal de repositorio y guarda la configuración", async () => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) {
      throw new Error("falta #app");
    }

    shell = new Shell(root);
    await shell.boot();

    const fileButton = Array.from(root.querySelectorAll<HTMLButtonElement>(".menu-button")).find(
      (button) => button.textContent === "Archivo",
    );
    fileButton?.click();
    root.querySelector<HTMLButtonElement>('[data-action="file.repository"]')?.click();

    await vi.waitFor(() =>
      expect(root.querySelector(".modal-title")?.textContent).toBe("Repositorio"),
    );

    const url = root.querySelector<HTMLInputElement>("#repo-url");
    const branch = root.querySelector<HTMLInputElement>("#repo-branch");
    const path = root.querySelector<HTMLInputElement>("#repo-path");
    const rebase = root.querySelector<HTMLInputElement>(
      'input[name="repo-strategy"][value="rebase"]',
    );
    if (!url || !branch || !path || !rebase) {
      throw new Error("faltan campos del formulario de repositorio");
    }

    url.value = "https://example.com/notas.git";
    branch.value = "main";
    path.value = "docs";
    rebase.checked = true;

    const save = Array.from(
      root.querySelectorAll<HTMLButtonElement>(".modal-actions .button"),
    ).find((button) => button.textContent === "Guardar");
    save?.click();

    await vi.waitFor(() =>
      expect(mocks.repositoryConfigSave).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://example.com/notas.git",
          branch: "main",
          path: "docs",
          strategy: "rebase",
        }),
      ),
    );
  });

  it("muestra y alterna Autopush en el menú Archivo", async () => {
    mocks.repositoryConfigLoad.mockResolvedValue({
      url: "https://example.com/notas.git",
      branch: "main",
      path: "",
      strategy: "merge",
      pullBeforePush: true,
      createBranch: false,
      autoPush: false,
    });

    const root = document.querySelector<HTMLElement>("#app");
    if (!root) {
      throw new Error("falta #app");
    }

    shell = new Shell(root);
    await shell.boot();

    const fileButton = Array.from(root.querySelectorAll<HTMLButtonElement>(".menu-button")).find(
      (button) => button.textContent === "Archivo",
    );
    fileButton?.click();
    const first = root.querySelector<HTMLButtonElement>('[data-action="file.autopush"]');
    expect(first?.getAttribute("aria-checked")).toBe("false");

    first?.click();
    await vi.waitFor(() =>
      expect(mocks.repositoryConfigSave).toHaveBeenCalledWith(
        expect.objectContaining({ autoPush: true }),
      ),
    );

    fileButton?.click();
    const second = root.querySelector<HTMLButtonElement>('[data-action="file.autopush"]');
    expect(second?.getAttribute("aria-checked")).toBe("true");
  });

  it("guarda el documento y hace push con el menú Push", async () => {
    mocks.repositoryConfigLoad.mockResolvedValue({
      url: "https://example.com/notas.git",
      branch: "main",
      path: "docs",
      strategy: "merge",
      pullBeforePush: true,
      createBranch: false,
      autoPush: false,
    });
    mocks.saveFileDialog.mockResolvedValue("/tmp/nota.md");
    mocks.fileSave.mockResolvedValue({
      path: "/tmp/nota.md",
      name: "nota.md",
      size: 5,
      modifiedMs: 1,
      encoding: "utf-8",
      eol: "lf",
      bom: false,
      fingerprint: "fp-3",
    });

    const root = document.querySelector<HTMLElement>("#app");
    if (!root) {
      throw new Error("falta #app");
    }

    shell = new Shell(root);
    await shell.boot();
    shell.replaceActiveContent("hola");

    const fileButton = Array.from(root.querySelectorAll<HTMLButtonElement>(".menu-button")).find(
      (button) => button.textContent === "Archivo",
    );
    fileButton?.click();
    root.querySelector<HTMLButtonElement>('[data-action="file.push"]')?.click();

    await vi.waitFor(() => expect(mocks.repositoryPush).toHaveBeenCalledWith(["/tmp/nota.md"]));

    await vi.waitFor(() =>
      expect(root.querySelector(".push-status")?.textContent).toBe(
        "Push completado correctamente.",
      ),
    );
    expect(root.querySelector(".push-bar-fill")?.classList.contains("done")).toBe(true);
  });

  it("pregunta si configurar el repositorio cuando Push no está configurado", async () => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) {
      throw new Error("falta #app");
    }

    shell = new Shell(root);
    await shell.boot();

    const fileButton = Array.from(root.querySelectorAll<HTMLButtonElement>(".menu-button")).find(
      (button) => button.textContent === "Archivo",
    );
    fileButton?.click();
    root.querySelector<HTMLButtonElement>('[data-action="file.push"]')?.click();

    await vi.waitFor(() =>
      expect(root.querySelector(".modal-title")?.textContent).toBe("Repositorio no configurado"),
    );

    const configure = Array.from(
      root.querySelectorAll<HTMLButtonElement>(".modal-actions .button"),
    ).find((button) => button.textContent === "Configurar ahora");
    configure?.click();

    await vi.waitFor(() =>
      expect(root.querySelector(".modal-title")?.textContent).toBe("Repositorio"),
    );
  });

  it("pide guardar al cerrar con cambios y destruye la ventana", async () => {
    const root = document.querySelector<HTMLElement>("#app");
    if (!root) {
      throw new Error("falta #app");
    }

    type CloseHandler = (event: { preventDefault: () => void }) => Promise<void>;
    let handler: CloseHandler | null = null;
    mocks.onCloseRequested.mockImplementation((callback: CloseHandler) => {
      handler = callback;
      return Promise.resolve(() => undefined);
    });

    shell = new Shell(root);
    await shell.boot();
    shell.replaceActiveContent("contenido sin guardar");

    if (!handler) {
      throw new Error("no se registró el manejador de cierre");
    }

    const closeHandler = handler as CloseHandler;
    const preventDefault = vi.fn();
    const closing = closeHandler({ preventDefault });

    await vi.waitFor(() =>
      expect(root.querySelector(".modal-title")?.textContent).toBe("Cambios sin guardar"),
    );
    expect(preventDefault).toHaveBeenCalled();

    const discard = Array.from(
      root.querySelectorAll<HTMLButtonElement>(".modal-actions .button"),
    ).find((button) => button.textContent === "Salir sin guardar");
    discard?.click();

    await closing;
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });
});
