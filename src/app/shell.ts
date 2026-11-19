// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { host } from "../host";
import type {
  DirEntry,
  Eol,
  FileChangedEvent,
  OpenedFile,
  RecentEntry,
  SaveOptions,
  SearchHit,
  Settings,
  Session,
  SidebarView,
} from "../host";
import { ENCODING_OPTIONS, convertEol, encodingDisplayName } from "./encoding";
import { MurkEditor } from "../editor/editor";
import type { TableAction } from "../editor/table";
import { setImageDocumentPath, clearImageCache } from "../editor/widgets/image";
import { parseOutline } from "./outline";
import { MENUS, type ActionId, type MenuDef } from "./menus";
import { DEFAULT_SETTINGS, applySettings, normalizeSettings } from "./settings";
import { Workspace, countWords, displayPath, type Tab } from "./state";

type CloseChoice = "save" | "discard" | "cancel";
type ConflictChoice = "reload" | "keep" | "cancel";

interface ModalAction {
  label: string;
  primary?: boolean;
  danger?: boolean;
  onClick: () => void;
}

interface ModalOptions {
  title: string;
  message?: string;
  body?: HTMLElement;
  actions: ModalAction[];
  onEscape?: () => void;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    return String(error.code);
  }
  return undefined;
}

function renderDiff(local: string, external: string): string {
  const localLines = local.split("\n");
  const externalLines = external.split("\n");
  const max = Math.min(localLines.length, externalLines.length);

  let prefix = 0;
  while (prefix < max && localLines[prefix] === externalLines[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < max - prefix &&
    localLines[localLines.length - 1 - suffix] === externalLines[externalLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const localBlock = localLines.slice(prefix, localLines.length - suffix).slice(0, 60);
  const externalBlock = externalLines.slice(prefix, externalLines.length - suffix).slice(0, 60);
  const lines = [
    ...localBlock.map((line) => `- ${line}`),
    ...externalBlock.map((line) => `+ ${line}`),
  ];

  return lines.length > 0 ? lines.join("\n") : "(sin diferencias visibles)";
}

function suggestedFileName(name: string): string {
  return name.toLowerCase() === "sin título" ? "sin-titulo.md" : `${name}.md`;
}

function pathBase(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function relativePath(path: string, root: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export class Shell {
  private readonly root: HTMLElement;
  private readonly workspace = new Workspace();
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private restoredSession: Session | null = null;

  private editor!: MurkEditor;
  private workspaceElement!: HTMLElement;
  private sidebarElement!: HTMLElement;
  private sidebarContent!: HTMLElement;
  private sidebarResizer!: HTMLElement;
  private tabsElement!: HTMLElement;
  private statusFile!: HTMLElement;
  private statusCount!: HTMLElement;
  private statusEncoding!: HTMLButtonElement;
  private statusEol!: HTMLButtonElement;
  private saveState!: HTMLElement;
  private menuLayer!: HTMLElement;
  private modalLayer!: HTMLElement;
  private toastLayer!: HTMLElement;

  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalHandle: number | null = null;
  private allowClose = false;
  private openMenuId: string | null = null;
  private lastTitle = "";
  private unlistenFileChanged: (() => void) | null = null;
  private readonly localWrites = new Map<string, number>();
  private readonly watchTimers = new Map<string, number>();
  private conflictBusy = false;
  private themeMedia: MediaQueryList | null = null;
  private workspaceRoot: string | null = null;
  private sidebarView: SidebarView = "files";
  private sidebarWidth = 260;
  private sidebarVisible = true;
  private showHidden = false;
  private readonly treeCache = new Map<string, DirEntry[]>();
  private readonly pendingDirs = new Set<string>();
  private readonly expandedDirs = new Set<string>();
  private outlineTimer: ReturnType<typeof setTimeout> | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchQuery = "";
  private searchCaseSensitive = false;
  private searchToken = 0;
  private searchResultsElement: HTMLElement | null = null;
  private readonly handleSystemTheme = (): void => {
    if (this.settings.theme === "system") {
      this.editor.refresh();
    }
  };

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async boot(): Promise<void> {
    await this.loadState();
    this.applyRestoredWorkspaceContext();
    this.mount();
    await this.restoreSession();
    this.bindShellEvents();
    this.bindWindowClose();

    try {
      this.unlistenFileChanged = await host.listenFileChanged((event) => {
        this.queueFileEvent(event);
      });
    } catch (error) {
      console.warn("No se pudo escuchar cambios de archivos", error);
    }

    this.applySidebarLayout();
    this.renderSidebar();

    if (this.workspaceRoot) {
      void this.ensureDir(this.workspaceRoot);
    }

    this.intervalHandle = window.setInterval(() => {
      void this.persistSession();
    }, 30_000);
  }

  dispose(): void {
    if (this.sessionTimer !== null) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.outlineTimer !== null) {
      clearTimeout(this.outlineTimer);
      this.outlineTimer = null;
    }
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    for (const timer of this.watchTimers.values()) {
      clearTimeout(timer);
    }
    this.watchTimers.clear();
    this.unlistenFileChanged?.();
    this.unlistenFileChanged = null;
    this.themeMedia?.removeEventListener("change", this.handleSystemTheme);
    this.themeMedia = null;
    for (const tab of this.workspace.tabs) {
      if (tab.path) {
        void host.unwatchFile(tab.path).catch(() => undefined);
      }
    }
    this.editor?.destroy();
  }

  private async loadState(): Promise<void> {
    try {
      const settings = await host.settingsLoad();
      this.settings = normalizeSettings(settings ?? DEFAULT_SETTINGS);
    } catch (error) {
      this.settings = { ...DEFAULT_SETTINGS };
      console.warn("No se pudieron cargar las preferencias", error);
    }

    try {
      this.restoredSession = await host.sessionLoad();
    } catch (error) {
      this.restoredSession = null;
      console.warn("No se pudo cargar la sesión", error);
    }

    applySettings(this.settings);
  }

  private applyRestoredWorkspaceContext(): void {
    const session = this.restoredSession;
    if (!session) {
      return;
    }

    this.workspaceRoot = session.workspaceRoot || null;
    this.sidebarView =
      session.sidebarView === "outline" || session.sidebarView === "search"
        ? session.sidebarView
        : "files";
    this.sidebarWidth = Math.min(480, Math.max(180, session.sidebarWidth || 260));
  }

  private async restoreSession(): Promise<void> {
    const session = this.restoredSession;
    this.restoredSession = null;

    if (session) {
      for (const file of session.openFiles) {
        try {
          const document = await host.fileOpen(file.path);
          const tab = this.workspace.openDocument(document);
          tab.cursor = file.cursor;
          tab.scroll = file.scroll;
          void this.watchPath(file.path);
        } catch {
          this.toast(`No se pudo reabrir ${file.path}`);
        }
      }

      if (this.workspace.tabs.length > 0) {
        this.workspace.setActiveIndex(session.activeIndex);
      }

      try {
        await host.window.restore(session);
      } catch {
        // La geometría es opcional; no impide editar.
      }
    }

    if (this.workspace.tabs.length === 0) {
      this.workspace.createUntitled();
    }

    this.renderAll();
    this.editor.focus();
  }

  private mount(): void {
    this.root.innerHTML = `
      <div class="shell">
        <header class="menubar">
          <div class="brand" aria-hidden="true">M</div>
          <nav class="menus" role="menubar" aria-label="Menú principal"></nav>
          <div class="menubar-spacer"></div>
          <span class="save-state" id="save-state" role="status">Guardado</span>
        </header>
        <div class="tabbar">
          <div class="tabs" role="tablist" aria-label="Documentos abiertos"></div>
          <button class="tab-new" id="tab-new" type="button" title="Nueva pestaña (Ctrl+N)" aria-label="Nueva pestaña">+</button>
        </div>
        <div class="workspace" id="workspace">
          <aside class="sidebar" id="sidebar" aria-label="Barra lateral">
            <div class="sidebar-tabs" role="tablist" aria-label="Vistas laterales">
              <button type="button" class="sidebar-tab" data-view="files" role="tab">Archivos</button>
              <button type="button" class="sidebar-tab" data-view="outline" role="tab">Esquema</button>
              <button type="button" class="sidebar-tab" data-view="search" role="tab">Búsqueda</button>
            </div>
            <div class="sidebar-content" id="sidebar-content"></div>
            <div class="sidebar-resizer" id="sidebar-resizer" role="separator" aria-orientation="vertical" title="Redimensionar barra lateral"></div>
          </aside>
          <main class="editor-area">
            <div id="editor" class="editor-host"></div>
          </main>
        </div>
        <footer class="statusbar">
          <span id="status-file" class="status-file">Sin título</span>
          <span class="status-spacer"></span>
          <span id="status-count">0 palabras</span>
          <button id="status-encoding" class="status-tag status-button" type="button" title="Cambiar codificación">UTF-8</button>
          <button id="status-eol" class="status-tag status-button" type="button" title="Cambiar fin de línea">LF</button>
          <span class="status-tag">Texto</span>
        </footer>
        <div id="menu-layer" class="menu-layer"></div>
        <div id="modal-layer" class="modal-layer"></div>
        <div id="toast-layer" class="toast-layer" aria-live="polite"></div>
      </div>
    `;

    this.editor = new MurkEditor(this.query<HTMLElement>("#editor"), {
      tabSize: this.settings.tabSize,
      onChange: (content) => this.handleContentChange(content),
      onCursor: (cursor) => {
        const tab = this.workspace.active;
        if (tab) {
          tab.cursor = cursor;
        }
      },
    });

    this.tabsElement = this.query<HTMLElement>(".tabs");
    this.workspaceElement = this.query<HTMLElement>("#workspace");
    this.sidebarElement = this.query<HTMLElement>("#sidebar");
    this.sidebarContent = this.query<HTMLElement>("#sidebar-content");
    this.sidebarResizer = this.query<HTMLElement>("#sidebar-resizer");
    this.statusFile = this.query<HTMLElement>("#status-file");
    this.statusCount = this.query<HTMLElement>("#status-count");
    this.statusEncoding = this.query<HTMLButtonElement>("#status-encoding");
    this.statusEol = this.query<HTMLButtonElement>("#status-eol");
    this.saveState = this.query<HTMLElement>("#save-state");
    this.menuLayer = this.query<HTMLElement>("#menu-layer");
    this.modalLayer = this.query<HTMLElement>("#modal-layer");
    this.toastLayer = this.query<HTMLElement>("#toast-layer");

    this.buildMenus();
  }

  private query<T extends Element>(selector: string): T {
    const node = this.root.querySelector<T>(selector);
    if (!node) {
      throw new Error(`No se encontró ${selector}`);
    }
    return node;
  }

  private buildMenus(): void {
    const nav = this.query<HTMLElement>(".menus");

    for (const menu of MENUS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "menu-button";
      button.textContent = menu.label;
      button.dataset.menu = menu.id;
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");

      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggleMenu(menu, button);
      });

      button.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.openMenu(menu, button);
        }
      });

      nav.append(button);
    }
  }

  private toggleMenu(menu: MenuDef, button: HTMLButtonElement): void {
    if (this.openMenuId === menu.id) {
      this.closeMenus();
      return;
    }
    this.openMenu(menu, button);
  }

  private openMenu(menu: MenuDef, button: HTMLButtonElement): void {
    this.closeMenus();
    this.openMenuId = menu.id;
    button.setAttribute("aria-expanded", "true");

    const dropdown = document.createElement("div");
    dropdown.className = "menu-dropdown";
    dropdown.setAttribute("role", "menu");
    dropdown.setAttribute("aria-label", menu.label);

    menu.items.forEach((item) => {
      if (item.separatorBefore) {
        const separator = document.createElement("div");
        separator.className = "menu-separator";
        separator.setAttribute("role", "separator");
        dropdown.append(separator);
      }

      const entry = document.createElement("button");
      entry.type = "button";
      entry.className = "menu-item";
      entry.setAttribute("role", "menuitem");
      entry.dataset.action = item.action;

      const label = document.createElement("span");
      label.textContent = item.label;
      entry.append(label);

      if (item.shortcut) {
        const shortcut = document.createElement("kbd");
        shortcut.textContent = item.shortcut;
        entry.append(shortcut);
      }

      entry.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.runAction(item.action);
      });

      dropdown.append(entry);
    });

    const rect = button.getBoundingClientRect();
    dropdown.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 248))}px`;
    dropdown.style.top = `${rect.bottom + 6}px`;

    dropdown.addEventListener("keydown", (event) => {
      const items = Array.from(dropdown.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);

      if (event.key === "ArrowDown") {
        event.preventDefault();
        items[(index + 1) % items.length]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.closeMenus();
        button.focus();
      }
    });

    this.menuLayer.replaceChildren(dropdown);
    dropdown.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }

  private closeMenus(): void {
    this.openMenuId = null;
    this.menuLayer.replaceChildren();
    this.root.querySelectorAll<HTMLButtonElement>(".menu-button").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  private async runAction(action: ActionId): Promise<void> {
    this.closeMenus();

    switch (action) {
      case "file.new":
        this.newTab();
        break;
      case "file.open":
        await this.openFile();
        break;
      case "file.openFolder":
        await this.openFolder();
        break;
      case "file.recent":
        await this.showRecent();
        break;
      case "file.save":
        await this.saveActive(false);
        break;
      case "file.saveAs":
        await this.saveActive(true);
        break;
      case "file.close":
        await this.closeActiveTab();
        break;
      case "file.quit":
        await this.requestQuit();
        break;
      case "edit.undo":
        this.editCommand("undo");
        break;
      case "edit.redo":
        this.editCommand("redo");
        break;
      case "edit.cut":
        this.editCommand("cut");
        break;
      case "edit.copy":
        this.editCommand("copy");
        break;
      case "edit.paste":
        this.editCommand("paste");
        break;
      case "edit.selectAll":
        this.editCommand("selectAll");
        break;
      case "edit.find":
        this.editCommand("find");
        break;
      case "edit.findNext":
        this.editCommand("findNext");
        break;
      case "edit.replace":
        this.editCommand("replace");
        break;
      case "table.insert":
        this.editor.insertTable();
        this.editor.focus();
        break;
      case "table.rowAbove":
        this.runTable("rowAbove");
        break;
      case "table.rowBelow":
        this.runTable("rowBelow");
        break;
      case "table.deleteRow":
        this.runTable("deleteRow");
        break;
      case "table.colLeft":
        this.runTable("colLeft");
        break;
      case "table.colRight":
        this.runTable("colRight");
        break;
      case "table.deleteCol":
        this.runTable("deleteCol");
        break;
      case "table.alignLeft":
        this.runTable("alignLeft");
        break;
      case "table.alignCenter":
        this.runTable("alignCenter");
        break;
      case "table.alignRight":
        this.runTable("alignRight");
        break;
      case "table.format":
        this.runTable("format");
        break;
      case "view.settings":
        this.showSettings();
        break;
      case "view.sidebar":
        this.toggleSidebar();
        break;
      case "view.files":
        this.showSidebar("files");
        break;
      case "view.outline":
        this.showSidebar("outline");
        break;
      case "view.search":
        this.showSidebar("search");
        break;
      case "view.theme.light":
        await this.setTheme("light");
        break;
      case "view.theme.dark":
        await this.setTheme("dark");
        break;
      case "view.theme.system":
        await this.setTheme("system");
        break;
      case "help.shortcuts":
        this.showShortcuts();
        break;
      case "help.about":
        await this.showAbout();
        break;
    }
  }

  private bindShellEvents(): void {
    this.query<HTMLButtonElement>("#tab-new").addEventListener("click", () => {
      this.newTab();
    });

    this.statusEncoding.addEventListener("click", () => {
      this.showFileFormat();
    });
    this.statusEol.addEventListener("click", () => {
      this.showFileFormat();
    });

    this.sidebarElement.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        const view = button.dataset.view as SidebarView | undefined;
        if (view === "files" || view === "outline" || view === "search") {
          this.showSidebar(view);
        }
      });
    });

    this.sidebarResizer.addEventListener("mousedown", (event) => {
      if (!this.sidebarVisible) {
        return;
      }
      event.preventDefault();
      const workspaceRect = this.workspaceElement.getBoundingClientRect();

      const move = (moveEvent: MouseEvent): void => {
        this.sidebarWidth = Math.min(480, Math.max(180, moveEvent.clientX - workspaceRect.left));
        this.applySidebarLayout();
      };

      const up = (): void => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        document.body.classList.remove("resizing");
        this.scheduleSession();
      };

      document.body.classList.add("resizing");
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });

    this.tabsElement.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;

      const close = target.closest<HTMLButtonElement>("[data-close]");
      if (close?.dataset.close) {
        event.stopPropagation();
        void this.closeTab(close.dataset.close);
        return;
      }

      const tab = target.closest<HTMLButtonElement>("[data-tab]");
      if (tab?.dataset.tab) {
        this.activateTab(tab.dataset.tab);
      }
    });

    document.addEventListener("click", () => {
      this.closeMenus();
    });

    if (typeof window.matchMedia === "function") {
      this.themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
      this.themeMedia.addEventListener("change", this.handleSystemTheme);
    }

    window.addEventListener("keydown", (event) => {
      if (this.modalLayer.childElementCount > 0) {
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;

      if (event.key === "Escape") {
        this.closeMenus();
        return;
      }

      if (event.key === "F1") {
        event.preventDefault();
        this.showShortcuts();
        return;
      }

      if (!modifier || event.altKey) {
        return;
      }

      if (event.shiftKey) {
        if (event.code === "Digit1") {
          event.preventDefault();
          this.toggleSidebar();
          return;
        }
        if (event.code === "KeyE") {
          event.preventDefault();
          this.showSidebar("files");
          return;
        }
        if (event.code === "KeyF") {
          event.preventDefault();
          this.showSidebar("search");
          return;
        }
      }

      switch (event.key.toLowerCase()) {
        case "n":
          event.preventDefault();
          this.newTab();
          break;
        case "o":
          event.preventDefault();
          if (event.shiftKey) {
            void this.openFolder();
          } else {
            void this.openFile();
          }
          break;
        case "s":
          event.preventDefault();
          void this.saveActive(event.shiftKey);
          break;
        case "w":
          event.preventDefault();
          void this.closeActiveTab();
          break;
        case "q":
          event.preventDefault();
          void this.requestQuit();
          break;
        case ",":
          event.preventDefault();
          this.showSettings();
          break;
      }
    });

    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        void this.persistSession();
      }
    });
  }

  private newTab(): void {
    this.captureCursor();
    this.workspace.createUntitled();
    this.afterMutation();
    this.editor.focus();
  }

  private async openFile(): Promise<void> {
    try {
      const path = await host.openFileDialog();
      if (path) {
        await this.openPath(path);
      }
    } catch (error) {
      this.toast(errorMessage(error));
    }
  }

  private async openPath(path: string): Promise<boolean> {
    try {
      const document = await host.fileOpen(path);
      this.workspace.openDocument(document);
      void this.watchPath(path);
      void this.rememberRecent(path);
      this.afterMutation();
      this.editor.focus();
      return true;
    } catch (error) {
      this.toast(errorMessage(error));
      return false;
    }
  }

  private async saveActive(saveAs: boolean, attempt = 0): Promise<boolean> {
    const tab = this.workspace.active;
    if (!tab) {
      return false;
    }

    this.captureCursor();
    const previousPath = tab.path;
    let path = tab.path;

    if (!path || saveAs) {
      try {
        path = await host.saveFileDialog(path ?? suggestedFileName(tab.name));
      } catch (error) {
        this.toast(errorMessage(error));
        return false;
      }
      if (!path) {
        return false;
      }
    }

    const targetIsOriginal = previousPath === path;
    const options: SaveOptions = {
      encoding: tab.encoding,
      bom: tab.bom,
      eol: tab.eol,
      convertEol: false,
      expectedFingerprint: targetIsOriginal && !tab.missing ? tab.fingerprint || null : null,
    };

    this.saveState.textContent = "Guardando…";

    try {
      const saved = await host.fileSave(path, tab.content, options);

      this.localWrites.set(saved.path, Date.now());
      if (previousPath && previousPath !== saved.path) {
        void host.unwatchFile(previousPath).catch(() => undefined);
      }
      void this.watchPath(saved.path);
      void this.rememberRecent(saved.path);

      this.workspace.markSaved(tab.id, saved);
      if (this.workspace.activeId === tab.id) {
        this.editor.setReadOnly(tab.readOnly);
        setImageDocumentPath(saved.path);
        this.editor.refresh();
      }
      this.renderTabs();
      this.updateStatus();
      this.updateTitle();
      this.saveState.textContent = "Guardado";
      this.scheduleSession();
      return true;
    } catch (error) {
      if (errorCode(error) === "conflict" && tab.path && attempt < 1) {
        this.saveState.textContent = "Conflicto";
        let external: OpenedFile;
        try {
          external = await host.fileOpen(tab.path);
        } catch (readError) {
          this.toast(errorMessage(readError));
          return false;
        }

        const choice = await this.resolveConflict(tab, external);
        if (choice === "keep") {
          tab.fingerprint = external.fingerprint;
          tab.missing = false;
          return this.saveActive(false, attempt + 1);
        }
        if (choice === "reload") {
          this.applyExternal(tab, external);
          this.saveState.textContent = "Recargado";
        }
        return false;
      }

      this.saveState.textContent = "Error al guardar";
      this.toast(errorMessage(error));
      return false;
    }
  }

  private async saveAll(): Promise<boolean> {
    for (const tab of [...this.workspace.tabs]) {
      if (!tab.dirty) {
        continue;
      }
      this.workspace.setActive(tab.id);
      this.renderAll();
      if (!(await this.saveActive(false))) {
        return false;
      }
    }
    return true;
  }

  private async closeActiveTab(): Promise<void> {
    const active = this.workspace.active;
    if (active) {
      await this.closeTab(active.id);
    }
  }

  private async closeTab(id: string): Promise<void> {
    const tab = this.workspace.tabs.find((item) => item.id === id);
    if (!tab) {
      return;
    }

    if (tab.dirty) {
      this.workspace.setActive(id);
      this.renderAll();
      const choice = await this.askClose(tab.name);
      if (choice === "cancel") {
        return;
      }
      if (choice === "save" && !(await this.saveActive(false))) {
        return;
      }
    }

    this.workspace.closeTab(id);
    this.editor.forget(id);

    if (tab.path) {
      void host.unwatchFile(tab.path).catch(() => undefined);
    }

    if (this.workspace.tabs.length === 0) {
      this.workspace.createUntitled();
    }

    this.afterMutation();
    this.editor.focus();
  }

  private async requestQuit(): Promise<void> {
    if (!host.isDesktop()) {
      this.toast("Salir solo está disponible en la aplicación de escritorio.");
      return;
    }

    try {
      await host.window.close();
    } catch (error) {
      this.toast(errorMessage(error));
    }
  }

  private bindWindowClose(): void {
    if (!host.isDesktop()) {
      return;
    }

    void host.window.onCloseRequested(async (event) => {
      if (this.allowClose) {
        return;
      }

      event.preventDefault();
      this.captureCursor();

      if (this.workspace.hasDirty()) {
        const choice = await this.askCloseAll();
        if (choice === "cancel") {
          return;
        }
        if (choice === "save" && !(await this.saveAll())) {
          return;
        }
      }

      await this.persistSession();
      this.allowClose = true;

      try {
        await host.window.close();
      } catch {
        this.allowClose = false;
      }
    });
  }

  private activateTab(id: string): void {
    if (this.workspace.activeId === id) {
      return;
    }
    this.captureCursor();
    this.workspace.setActive(id);
    this.renderAll();
    this.scheduleSession();
    this.editor.focus();
  }

  private handleContentChange(content: string): void {
    const tab = this.workspace.active;
    if (!tab) {
      return;
    }

    this.workspace.updateContent(tab.id, content);
    tab.cursor = this.editor.getCursor();
    this.renderTabs();
    this.updateStatus();
    this.updateTitle();
    this.scheduleSession();
    if (this.sidebarVisible && this.sidebarView === "outline") {
      this.scheduleOutline();
    }
  }

  private editCommand(
    command:
      "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll" | "find" | "findNext" | "replace",
  ): void {
    if (command === "find") {
      this.editor.find();
      return;
    }
    if (command === "replace") {
      this.editor.replace();
      return;
    }
    if (command === "findNext") {
      this.editor.findNext();
      return;
    }

    this.editor.focus();

    switch (command) {
      case "undo":
        this.editor.undo();
        return;
      case "redo":
        this.editor.redo();
        return;
      case "selectAll":
        this.editor.selectAll();
        return;
      case "cut":
      case "copy":
      case "paste":
        try {
          const applied = document.execCommand(command);
          if (!applied && command === "paste") {
            this.toast("Usa Ctrl+V para pegar.");
          }
        } catch {
          this.toast("El comando no está disponible.");
        }
        this.handleContentChange(this.editor.getContent());
        this.editor.focus();
        return;
    }
  }

  private async setTheme(theme: Settings["theme"]): Promise<void> {
    this.settings = { ...this.settings, theme };
    applySettings(this.settings);
    this.editor.refresh();
    try {
      await host.settingsSave(this.settings);
    } catch (error) {
      this.toast(errorMessage(error));
    }
  }

  private renderAll(): void {
    this.renderTabs();
    this.renderEditor();
    this.updateStatus();
    this.updateTitle();
    this.refreshSidebarForDocument();
  }

  private refreshSidebarForDocument(): void {
    if (!this.sidebarVisible) {
      return;
    }
    if (this.sidebarView === "outline") {
      this.scheduleOutline();
      return;
    }
    if (this.sidebarView === "files") {
      this.renderSidebar();
    }
  }

  private scheduleOutline(): void {
    if (this.outlineTimer !== null) {
      clearTimeout(this.outlineTimer);
    }
    this.outlineTimer = setTimeout(() => {
      this.outlineTimer = null;
      if (this.sidebarVisible && this.sidebarView === "outline") {
        this.renderSidebar();
      }
    }, 250);
  }

  private renderTabs(): void {
    this.tabsElement.replaceChildren();

    for (const tab of this.workspace.tabs) {
      const wrapper = document.createElement("div");
      wrapper.className = "tab";
      if (tab.id === this.workspace.activeId) {
        wrapper.classList.add("tab-active");
      }

      const main = document.createElement("button");
      main.type = "button";
      main.className = "tab-main";
      main.dataset.tab = tab.id;
      main.setAttribute("role", "tab");
      main.setAttribute("aria-selected", String(tab.id === this.workspace.activeId));
      main.title = tab.path ?? tab.name;

      if (tab.dirty) {
        const dot = document.createElement("span");
        dot.className = "tab-dot";
        dot.setAttribute("aria-label", "Sin guardar");
        dot.textContent = "●";
        main.append(dot);
      }

      const label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = tab.name;
      main.append(label);

      const close = document.createElement("button");
      close.type = "button";
      close.className = "tab-close";
      close.dataset.close = tab.id;
      close.setAttribute("aria-label", `Cerrar ${tab.name}`);
      close.textContent = "×";

      wrapper.append(main, close);
      this.tabsElement.append(wrapper);
    }
  }

  private renderEditor(): void {
    const tab = this.workspace.active;
    if (!tab) {
      return;
    }

    setImageDocumentPath(tab.path);
    this.editor.activate(tab.id, tab.content, tab.cursor, tab.readOnly);
    this.editor.scrollToRatio(tab.scroll);
  }

  /** Reemplaza el texto del documento activo mediante una transacción del editor. */
  replaceActiveContent(content: string): void {
    const tab = this.workspace.active;
    if (!tab) {
      return;
    }
    this.editor.setContent(content, tab.cursor);
  }

  private captureCursor(): void {
    const tab = this.workspace.active;
    if (!tab || !this.editor) {
      return;
    }

    const capture = this.editor.capture();
    tab.content = capture.content;
    tab.cursor = capture.cursor;
    tab.scroll = capture.scroll;
  }

  private updateStatus(): void {
    const tab = this.workspace.active;
    const content = tab?.content ?? "";

    this.statusFile.textContent = tab ? displayPath(tab.path) : "Sin documento";
    this.statusFile.title = tab?.path ?? "";
    this.statusCount.textContent = `${countWords(content)} palabras · ${content.length} caracteres`;
    this.statusEncoding.textContent = tab
      ? `${encodingDisplayName(tab.encoding)}${tab.bom ? " · BOM" : ""}`
      : "UTF-8";
    this.statusEol.textContent = tab ? tab.eol.toUpperCase() : "LF";
    this.statusEncoding.disabled = !tab;
    this.statusEol.disabled = !tab;

    if (!tab) {
      this.saveState.textContent = "—";
    } else if (tab.dirty) {
      this.saveState.textContent = "Sin guardar";
    } else {
      this.saveState.textContent = "Guardado";
    }
  }

  private updateTitle(): void {
    const tab = this.workspace.active;
    const title = tab ? `${tab.dirty ? "● " : ""}${tab.name} — Murk` : "Murk";
    document.title = title;

    if (title !== this.lastTitle) {
      this.lastTitle = title;
      if (host.isDesktop()) {
        void host.window.setTitle(title).catch(() => undefined);
      }
    }
  }

  private scheduleSession(): void {
    if (this.sessionTimer !== null) {
      clearTimeout(this.sessionTimer);
    }
    this.sessionTimer = setTimeout(() => {
      this.sessionTimer = null;
      void this.persistSession();
    }, 800);
  }

  private async persistSession(): Promise<void> {
    if (!host.isDesktop() || !this.editor) {
      return;
    }

    this.captureCursor();

    try {
      const geometry = await host.window.geometry();
      const session = this.workspace.serialize(geometry, {
        workspaceRoot: this.workspaceRoot,
        sidebarView: this.sidebarView,
        sidebarWidth: this.sidebarWidth,
      });
      await host.sessionSave(session);
    } catch {
      // La sesión es best-effort; nunca bloquea la edición.
    }
  }

  private afterMutation(): void {
    this.renderAll();
    this.scheduleSession();
  }

  private runTable(action: TableAction): void {
    if (!this.editor.tableAction(action)) {
      this.toast("Coloca el cursor dentro de una tabla.");
    }
    this.editor.focus();
  }

  private applySidebarLayout(): void {
    if (!this.workspaceElement || !this.sidebarElement) {
      return;
    }

    this.workspaceElement.classList.toggle("sidebar-hidden", !this.sidebarVisible);
    this.workspaceElement.style.gridTemplateColumns = this.sidebarVisible
      ? `${this.sidebarWidth}px minmax(0, 1fr)`
      : "minmax(0, 1fr)";
    this.sidebarElement.setAttribute("aria-hidden", String(!this.sidebarVisible));
  }

  private toggleSidebar(): void {
    this.sidebarVisible = !this.sidebarVisible;
    this.applySidebarLayout();
    if (this.sidebarVisible) {
      this.renderSidebar();
    }
    this.scheduleSession();
  }

  private showSidebar(view: SidebarView): void {
    this.sidebarView = view;
    this.sidebarVisible = true;
    this.applySidebarLayout();
    this.renderSidebar();
    this.scheduleSession();

    if (view === "search") {
      this.sidebarContent.querySelector<HTMLInputElement>("input[type='search']")?.focus();
    }
  }

  private renderSidebar(): void {
    if (!this.sidebarContent) {
      return;
    }

    this.sidebarElement.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
      const active = button.dataset.view === this.sidebarView;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });

    this.sidebarContent.replaceChildren();

    if (!this.sidebarVisible) {
      return;
    }

    if (this.sidebarView === "files") {
      this.renderFiles();
    } else if (this.sidebarView === "outline") {
      this.renderOutline();
    } else {
      this.renderSearch();
    }
  }

  private renderFiles(): void {
    const content = this.sidebarContent;
    const header = document.createElement("div");
    header.className = "sidebar-header";

    const title = document.createElement("span");
    title.className = "sidebar-title";
    title.textContent = this.workspaceRoot ? pathBase(this.workspaceRoot) : "Archivos";
    title.title = this.workspaceRoot ?? "";
    header.append(title);

    const actions = document.createElement("div");
    actions.className = "sidebar-actions";

    if (this.workspaceRoot) {
      const hidden = document.createElement("button");
      hidden.type = "button";
      hidden.className = "sidebar-icon";
      hidden.classList.toggle("active", this.showHidden);
      hidden.title = "Mostrar archivos ocultos";
      hidden.setAttribute("aria-pressed", String(this.showHidden));
      hidden.textContent = "◌";
      hidden.addEventListener("click", () => {
        this.showHidden = !this.showHidden;
        this.renderSidebar();
      });
      actions.append(hidden);

      const refresh = document.createElement("button");
      refresh.type = "button";
      refresh.className = "sidebar-icon";
      refresh.title = "Actualizar árbol";
      refresh.textContent = "↻";
      refresh.addEventListener("click", () => {
        this.treeCache.delete(this.workspaceRoot as string);
        void this.ensureDir(this.workspaceRoot as string);
      });
      actions.append(refresh);
    }

    const open = document.createElement("button");
    open.type = "button";
    open.className = "sidebar-icon";
    open.title = "Abrir carpeta";
    open.textContent = "📂";
    open.addEventListener("click", () => {
      void this.openFolder();
    });
    actions.append(open);
    header.append(actions);
    content.append(header);

    if (!this.workspaceRoot) {
      const empty = document.createElement("div");
      empty.className = "sidebar-empty";
      empty.textContent = "Abre una carpeta para navegar por sus archivos.";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-primary";
      button.textContent = "Abrir carpeta";
      button.addEventListener("click", () => {
        void this.openFolder();
      });
      empty.append(button);
      content.append(empty);
      return;
    }

    if (!this.treeCache.has(this.workspaceRoot)) {
      const loading = document.createElement("p");
      loading.className = "sidebar-empty";
      loading.textContent = "Cargando carpeta…";
      content.append(loading);
      void this.ensureDir(this.workspaceRoot);
      return;
    }

    const tree = document.createElement("div");
    tree.className = "tree";
    tree.setAttribute("role", "tree");
    this.renderTree(tree, this.workspaceRoot, 0);
    content.append(tree);

    if (tree.childElementCount === 0) {
      const empty = document.createElement("p");
      empty.className = "sidebar-empty";
      empty.textContent = "Carpeta vacía.";
      content.append(empty);
    }
  }

  private async ensureDir(path: string): Promise<void> {
    if (this.treeCache.has(path) || this.pendingDirs.has(path)) {
      return;
    }

    this.pendingDirs.add(path);
    try {
      const entries = await host.dirList(path);
      this.treeCache.set(path, entries);
    } catch (error) {
      this.treeCache.set(path, []);
      this.toast(`No se pudo leer ${path}: ${errorMessage(error)}`);
    } finally {
      this.pendingDirs.delete(path);
      if (this.sidebarVisible && this.sidebarView === "files") {
        this.renderSidebar();
      }
    }
  }

  private renderTree(container: HTMLElement, directory: string, depth: number): void {
    const entries = this.treeCache.get(directory) ?? [];
    const activePath = this.workspace.active?.path ?? null;

    for (const entry of entries) {
      if (entry.hidden && !this.showHidden) {
        continue;
      }

      const row = document.createElement("button");
      row.type = "button";
      row.className = "tree-row";
      row.setAttribute("role", "treeitem");
      row.style.paddingLeft = `${6 + depth * 14}px`;
      row.title = entry.path;

      const marker = document.createElement("span");
      marker.className = "tree-marker";
      marker.textContent = entry.isDir ? (this.expandedDirs.has(entry.path) ? "▾" : "▸") : "•";
      row.append(marker);

      const name = document.createElement("span");
      name.className = "tree-name";
      name.textContent = entry.name;
      row.append(name);

      if (!entry.isDir && entry.path === activePath) {
        row.classList.add("active");
      }
      if (entry.isDir) {
        row.setAttribute("aria-expanded", String(this.expandedDirs.has(entry.path)));
      }

      row.addEventListener("click", () => {
        if (entry.isDir) {
          this.toggleDir(entry.path);
        } else {
          void this.openPath(entry.path);
        }
      });

      container.append(row);

      if (entry.isDir && this.expandedDirs.has(entry.path)) {
        if (!this.treeCache.has(entry.path)) {
          const loading = document.createElement("p");
          loading.className = "tree-loading";
          loading.style.paddingLeft = `${20 + depth * 14}px`;
          loading.textContent = "Cargando…";
          container.append(loading);
          void this.ensureDir(entry.path);
        } else {
          this.renderTree(container, entry.path, depth + 1);
        }
      }
    }
  }

  private toggleDir(path: string): void {
    if (this.expandedDirs.has(path)) {
      this.expandedDirs.delete(path);
    } else {
      this.expandedDirs.add(path);
      if (!this.treeCache.has(path)) {
        void this.ensureDir(path);
      }
    }
    this.renderSidebar();
  }

  private renderOutline(): void {
    const content = this.sidebarContent;
    const tab = this.workspace.active;

    const header = document.createElement("div");
    header.className = "sidebar-header";
    const title = document.createElement("span");
    title.className = "sidebar-title";
    title.textContent = "Esquema";
    header.append(title);
    content.append(header);

    if (!tab) {
      const empty = document.createElement("p");
      empty.className = "sidebar-empty";
      empty.textContent = "Sin documento activo.";
      content.append(empty);
      return;
    }

    const items = parseOutline(tab.content);
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "sidebar-empty";
      empty.textContent = "Este documento no tiene encabezados.";
      content.append(empty);
      return;
    }

    let activeIndex = -1;
    items.forEach((item, index) => {
      if (item.offset <= tab.cursor) {
        activeIndex = index;
      }
    });

    const list = document.createElement("div");
    list.className = "outline-list";
    list.setAttribute("role", "tree");

    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "outline-item";
      button.classList.toggle("active", index === activeIndex);
      button.style.paddingLeft = `${8 + (item.level - 1) * 14}px`;
      button.textContent = item.text;
      button.title = item.text;
      button.addEventListener("click", () => {
        this.editor.revealOffset(item.offset);
      });
      list.append(button);
    });

    content.append(list);
  }

  private renderSearch(): void {
    const content = this.sidebarContent;
    const header = document.createElement("div");
    header.className = "sidebar-header";
    const title = document.createElement("span");
    title.className = "sidebar-title";
    title.textContent = "Buscar en archivos";
    header.append(title);
    content.append(header);

    const pane = document.createElement("div");
    pane.className = "search-pane";

    const input = document.createElement("input");
    input.type = "search";
    input.className = "search-input";
    input.placeholder = "Buscar en la carpeta…";
    input.value = this.searchQuery;
    input.setAttribute("aria-label", "Buscar en archivos");
    input.addEventListener("input", () => {
      this.searchQuery = input.value;
      this.scheduleSearch();
    });
    pane.append(input);

    const toolbar = document.createElement("label");
    toolbar.className = "search-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.searchCaseSensitive;
    checkbox.addEventListener("change", () => {
      this.searchCaseSensitive = checkbox.checked;
      this.scheduleSearch();
    });
    const label = document.createElement("span");
    label.textContent = "Distinguir mayúsculas";
    toolbar.append(checkbox, label);
    pane.append(toolbar);

    const results = document.createElement("div");
    results.className = "search-results";
    pane.append(results);
    content.append(pane);

    this.searchResultsElement = results;

    if (!this.workspaceRoot) {
      results.textContent = "Abre una carpeta para buscar en sus archivos.";
      return;
    }
    if (this.searchQuery.trim().length < 2) {
      results.textContent = "Escribe al menos 2 caracteres.";
      return;
    }

    this.scheduleSearch();
  }

  private scheduleSearch(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      void this.runSearch();
    }, 300);
  }

  private async runSearch(): Promise<void> {
    const results = this.searchResultsElement;
    const root = this.workspaceRoot;
    const query = this.searchQuery.trim();

    if (!results || !root) {
      return;
    }
    if (query.length < 2) {
      results.textContent = "Escribe al menos 2 caracteres.";
      return;
    }

    const token = ++this.searchToken;
    results.textContent = "Buscando…";

    try {
      const hits = await host.searchWorkspace(root, query, {
        caseSensitive: this.searchCaseSensitive,
        maxResults: 200,
      });

      if (token !== this.searchToken || !results.isConnected) {
        return;
      }

      results.replaceChildren();
      if (hits.length === 0) {
        results.textContent = "Sin resultados.";
        return;
      }

      const summary = document.createElement("p");
      summary.className = "search-summary";
      summary.textContent = `${hits.length} coincidencia(s)`;
      results.append(summary);

      let currentPath = "";
      let group: HTMLElement | null = null;

      for (const hit of hits) {
        if (hit.path !== currentPath) {
          currentPath = hit.path;
          group = document.createElement("div");
          group.className = "search-group";
          const file = document.createElement("div");
          file.className = "search-file";
          file.textContent = relativePath(hit.path, root);
          file.title = hit.path;
          group.append(file);
          results.append(group);
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "search-hit";
        const line = document.createElement("span");
        line.className = "search-line";
        line.textContent = `${hit.line}:${hit.column + 1}`;
        const preview = document.createElement("span");
        preview.className = "search-preview";
        preview.textContent = hit.preview;
        button.append(line, preview);
        button.addEventListener("click", () => {
          void this.openSearchHit(hit);
        });
        group?.append(button);
      }
    } catch (error) {
      if (token === this.searchToken) {
        results.textContent = `Error al buscar: ${errorMessage(error)}`;
      }
    }
  }

  private async openSearchHit(hit: SearchHit): Promise<void> {
    const opened = await this.openPath(hit.path);
    if (opened) {
      this.editor.revealLine(hit.line, hit.column);
    }
  }

  private async openFolder(): Promise<void> {
    try {
      const folder = await host.openFolderDialog();
      if (folder) {
        this.setWorkspaceRoot(folder);
      }
    } catch (error) {
      this.toast(errorMessage(error));
    }
  }

  private setWorkspaceRoot(path: string): void {
    this.workspaceRoot = path;
    this.treeCache.clear();
    this.pendingDirs.clear();
    this.expandedDirs.clear();
    this.sidebarView = "files";
    this.sidebarVisible = true;
    this.applySidebarLayout();
    this.renderSidebar();
    void this.ensureDir(path);
    this.scheduleSession();
  }

  private async watchPath(path: string): Promise<void> {
    try {
      await host.watchFile(path);
    } catch {
      // El watcher es best-effort; el archivo sigue editable.
    }
  }

  private async rememberRecent(path: string): Promise<void> {
    try {
      await host.recentAdd(path);
    } catch {
      // La lista de recientes es best-effort.
    }
  }

  private queueFileEvent(event: FileChangedEvent): void {
    if (!this.workspace.tabs.some((tab) => tab.path === event.path)) {
      return;
    }

    const existing = this.watchTimers.get(event.path);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    const timer = window.setTimeout(() => {
      this.watchTimers.delete(event.path);
      void this.handleFileEvent(event);
    }, 250);

    this.watchTimers.set(event.path, timer);
  }

  private async handleFileEvent(event: FileChangedEvent): Promise<void> {
    const tab = this.workspace.tabs.find((item) => item.path === event.path);
    if (!tab || this.conflictBusy || this.modalLayer.childElementCount > 0) {
      return;
    }

    const localSave = this.localWrites.get(event.path);
    if (localSave !== undefined && Date.now() - localSave < 1500) {
      return;
    }

    if (event.kind === "removed") {
      tab.missing = true;
      tab.readOnly = true;
      this.renderTabs();
      this.updateStatus();
      this.toast(`«${tab.name}» se eliminó en disco. Guardar lo recreará.`);
      return;
    }

    let external: OpenedFile;
    try {
      external = await host.fileOpen(event.path);
    } catch {
      return;
    }

    if (external.fingerprint === tab.fingerprint) {
      return;
    }

    if (!tab.dirty) {
      this.applyExternal(tab, external);
      this.toast("Archivo recargado por un cambio externo.");
      return;
    }

    this.conflictBusy = true;
    try {
      const choice = await this.resolveConflict(tab, external);
      if (choice === "reload") {
        this.applyExternal(tab, external);
      } else if (choice === "keep") {
        tab.fingerprint = external.fingerprint;
        tab.missing = false;
      }
    } finally {
      this.conflictBusy = false;
    }
  }

  private applyExternal(tab: Tab, external: OpenedFile): void {
    const cursor = Math.min(tab.cursor, external.content.length);
    this.workspace.replaceDocument(tab.id, external);
    tab.cursor = cursor;
    this.editor.invalidate(tab.id);
    clearImageCache();

    if (this.workspace.activeId === tab.id) {
      this.renderEditor();
    }
    this.renderTabs();
    this.updateStatus();
    this.updateTitle();
    this.scheduleSession();
  }

  private resolveConflict(tab: Tab, external: OpenedFile): Promise<ConflictChoice> {
    return new Promise((resolve) => {
      const finish = (choice: ConflictChoice): void => {
        this.closeModal();
        resolve(choice);
      };

      const body = document.createElement("div");
      body.className = "conflict";

      const note = document.createElement("p");
      note.className = "modal-message";
      note.textContent =
        "El archivo cambió en disco. Elige qué versión conservar; «Mantener» sobrescribirá al guardar.";

      const diff = document.createElement("pre");
      diff.className = "diff";
      diff.textContent = renderDiff(tab.content, external.content);

      body.append(note, diff);

      this.openModal({
        title: `«${tab.name}» cambió en disco`,
        body,
        onEscape: () => finish("cancel"),
        actions: [
          { label: "Recargar del disco", primary: true, onClick: () => finish("reload") },
          { label: "Mantener mi versión", onClick: () => finish("keep") },
          { label: "Cancelar", onClick: () => finish("cancel") },
        ],
      });
    });
  }

  private showFileFormat(): void {
    const tab = this.workspace.active;
    if (!tab) {
      return;
    }

    const form = document.createElement("form");
    form.className = "settings-form";
    const options = ENCODING_OPTIONS.map(
      (option) => `<option value="${option.label}">${option.name}</option>`,
    ).join("");

    form.innerHTML = `
      <label class="field">
        <span>Codificación</span>
        <select id="format-encoding">${options}</select>
      </label>
      <label class="field field-inline">
        <input id="format-bom" type="checkbox" />
        <span>Añadir BOM (solo UTF-8)</span>
      </label>
      <label class="field">
        <span>Fin de línea</span>
        <select id="format-eol">
          <option value="lf">LF (Unix)</option>
          <option value="crlf">CRLF (Windows)</option>
          <option value="cr">CR (clásico)</option>
        </select>
      </label>
      <p class="field-hint">La codificación y el BOM se aplican al guardar. El fin de línea se convierte ahora en el editor.</p>
    `;

    const encoding = form.querySelector<HTMLSelectElement>("#format-encoding");
    const bom = form.querySelector<HTMLInputElement>("#format-bom");
    const eol = form.querySelector<HTMLSelectElement>("#format-eol");

    if (encoding) {
      if (!ENCODING_OPTIONS.some((option) => option.label === tab.encoding)) {
        const extra = document.createElement("option");
        extra.value = tab.encoding;
        extra.textContent = encodingDisplayName(tab.encoding);
        encoding.append(extra);
      }
      encoding.value = tab.encoding;
    }
    if (bom) {
      bom.checked = tab.bom;
      bom.disabled = !tab.encoding.startsWith("utf-8");
    }
    if (eol) {
      eol.value = tab.eol;
    }

    encoding?.addEventListener("change", () => {
      if (!encoding || !bom) {
        return;
      }
      const isUtf8 = encoding.value.startsWith("utf-8");
      bom.disabled = !isUtf8;
      if (!isUtf8) {
        bom.checked = false;
      }
    });

    this.openModal({
      title: "Codificación y fin de línea",
      body: form,
      onEscape: () => this.closeModal(),
      actions: [
        {
          label: "Aplicar",
          primary: true,
          onClick: () => {
            const nextEncoding = encoding?.value ?? tab.encoding;
            const nextBom = nextEncoding.startsWith("utf-8") ? (bom?.checked ?? false) : false;
            const nextEol = (eol?.value as Eol | undefined) ?? tab.eol;

            if (nextEol !== tab.eol) {
              tab.content = convertEol(tab.content, nextEol);
              tab.cursor = Math.min(tab.cursor, tab.content.length);
              if (this.workspace.activeId === tab.id) {
                this.editor.setContent(tab.content, tab.cursor);
              }
            }

            tab.encoding = nextEncoding;
            tab.bom = nextBom;
            tab.eol = nextEol;
            tab.dirty = true;

            this.closeModal();
            this.renderTabs();
            this.updateStatus();
            this.updateTitle();
            this.scheduleSession();
            this.toast("Formato actualizado. Guarda para aplicar la codificación.");
          },
        },
        { label: "Cancelar", onClick: () => this.closeModal() },
      ],
    });
  }

  private async showRecent(): Promise<void> {
    let entries: RecentEntry[];
    try {
      entries = await host.recentList();
    } catch (error) {
      this.toast(errorMessage(error));
      return;
    }

    const body = document.createElement("div");
    body.className = "recent-list";

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "modal-message";
      empty.textContent = "Todavía no hay archivos recientes.";
      body.append(empty);
    }

    for (const entry of entries) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "recent-item";
      item.disabled = !entry.exists;

      const name = document.createElement("span");
      name.className = "recent-name";
      name.textContent = entry.name;

      const path = document.createElement("span");
      path.className = "recent-path";
      path.textContent = entry.path;

      item.append(name, path);
      item.addEventListener("click", () => {
        this.closeModal();
        void this.openPath(entry.path);
      });
      body.append(item);
    }

    const actions: ModalAction[] = [];
    if (entries.length > 0) {
      actions.push({
        label: "Limpiar lista",
        danger: true,
        onClick: () => {
          void host
            .recentClear()
            .then(() => {
              this.closeModal();
              this.toast("Lista de recientes borrada.");
            })
            .catch((error: unknown) => this.toast(errorMessage(error)));
        },
      });
    }
    actions.push({ label: "Cerrar", primary: true, onClick: () => this.closeModal() });

    this.openModal({
      title: "Abrir reciente",
      body,
      onEscape: () => this.closeModal(),
      actions,
    });
  }

  private toast(message: string): void {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    this.toastLayer.append(toast);

    setTimeout(() => {
      toast.classList.add("toast-out");
      setTimeout(() => toast.remove(), 200);
    }, 4200);
  }

  private openModal(options: ModalOptions): void {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const dialog = document.createElement("section");
    dialog.className = "modal";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const title = document.createElement("h2");
    title.className = "modal-title";
    title.textContent = options.title;
    dialog.append(title);

    if (options.message) {
      const message = document.createElement("p");
      message.className = "modal-message";
      message.textContent = options.message;
      dialog.append(message);
    }

    if (options.body) {
      dialog.append(options.body);
    }

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    for (const action of options.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button";
      if (action.primary) {
        button.classList.add("button-primary");
      }
      if (action.danger) {
        button.classList.add("button-danger");
      }
      button.textContent = action.label;
      button.addEventListener("click", () => {
        action.onClick();
      });
      actions.append(button);
    }

    dialog.append(actions);
    overlay.append(dialog);
    this.modalLayer.replaceChildren(overlay);

    const primary = dialog.querySelector<HTMLButtonElement>(".button-primary");
    (primary ?? dialog.querySelector<HTMLButtonElement>(".button"))?.focus();

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        options.onEscape?.();
      }
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        options.onEscape?.();
      }
    });
  }

  private closeModal(): void {
    this.modalLayer.replaceChildren();
  }

  private askClose(name: string): Promise<CloseChoice> {
    return new Promise((resolve) => {
      const finish = (choice: CloseChoice): void => {
        this.closeModal();
        resolve(choice);
      };

      this.openModal({
        title: "Cambios sin guardar",
        message: `«${name}» tiene cambios sin guardar.`,
        onEscape: () => finish("cancel"),
        actions: [
          { label: "Guardar", primary: true, onClick: () => finish("save") },
          { label: "Descartar", danger: true, onClick: () => finish("discard") },
          { label: "Cancelar", onClick: () => finish("cancel") },
        ],
      });
    });
  }

  private askCloseAll(): Promise<CloseChoice> {
    return new Promise((resolve) => {
      const finish = (choice: CloseChoice): void => {
        this.closeModal();
        resolve(choice);
      };

      const dirty = this.workspace.tabs.filter((tab) => tab.dirty).length;

      this.openModal({
        title: "Cambios sin guardar",
        message: `${dirty} documento(s) con cambios sin guardar.`,
        onEscape: () => finish("cancel"),
        actions: [
          { label: "Guardar todo", primary: true, onClick: () => finish("save") },
          { label: "Salir sin guardar", danger: true, onClick: () => finish("discard") },
          { label: "Cancelar", onClick: () => finish("cancel") },
        ],
      });
    });
  }

  private showSettings(): void {
    const form = document.createElement("form");
    form.className = "settings-form";
    form.innerHTML = `
      <label class="field">
        <span>Tema</span>
        <select id="setting-theme">
          <option value="system">Sistema</option>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
        </select>
      </label>
      <label class="field">
        <span>Tipografía</span>
        <input id="setting-font" type="text" placeholder="Tipografía del sistema" maxlength="200" />
      </label>
      <label class="field">
        <span>Tamaño de letra</span>
        <input id="setting-size" type="number" min="10" max="32" step="1" />
      </label>
      <label class="field">
        <span>Tabulación (espacios)</span>
        <input id="setting-tab" type="number" min="1" max="8" step="1" />
      </label>
    `;

    const theme = form.querySelector<HTMLSelectElement>("#setting-theme");
    const font = form.querySelector<HTMLInputElement>("#setting-font");
    const size = form.querySelector<HTMLInputElement>("#setting-size");
    const tabSize = form.querySelector<HTMLInputElement>("#setting-tab");

    if (theme) theme.value = this.settings.theme;
    if (font) font.value = this.settings.fontFamily;
    if (size) size.value = String(this.settings.fontSize);
    if (tabSize) tabSize.value = String(this.settings.tabSize);

    this.openModal({
      title: "Preferencias",
      body: form,
      onEscape: () => this.closeModal(),
      actions: [
        {
          label: "Guardar",
          primary: true,
          onClick: () => {
            const next = normalizeSettings({
              theme: theme?.value as Settings["theme"],
              fontFamily: font?.value,
              fontSize: size?.value ? Number(size.value) : this.settings.fontSize,
              tabSize: tabSize?.value ? Number(tabSize.value) : this.settings.tabSize,
            });
            this.settings = next;
            applySettings(next);
            this.editor.setTabSize(next.tabSize);
            this.editor.refresh();
            this.closeModal();
            this.toast("Preferencias guardadas");
            void host.settingsSave(next).catch((error: unknown) => {
              this.toast(`No se pudieron guardar las preferencias: ${errorMessage(error)}`);
            });
          },
        },
        { label: "Cancelar", onClick: () => this.closeModal() },
      ],
    });
  }

  private showShortcuts(): void {
    const table = document.createElement("div");
    table.className = "shortcut-list";

    for (const menu of MENUS) {
      const group = document.createElement("section");
      const heading = document.createElement("h3");
      heading.textContent = menu.label;
      group.append(heading);

      for (const item of menu.items) {
        if (!item.shortcut) {
          continue;
        }
        const row = document.createElement("div");
        row.className = "shortcut-row";
        const label = document.createElement("span");
        label.textContent = item.label;
        const keys = document.createElement("kbd");
        keys.textContent = item.shortcut;
        row.append(label, keys);
        group.append(row);
      }

      table.append(group);
    }

    this.openModal({
      title: "Atajos de teclado",
      body: table,
      onEscape: () => this.closeModal(),
      actions: [{ label: "Cerrar", primary: true, onClick: () => this.closeModal() }],
    });
  }

  private async showAbout(): Promise<void> {
    const version = await host.version();
    const body = document.createElement("div");
    body.className = "about";
    body.textContent = `Murk ${version}\nEditor de Markdown con preview en vivo.\nLicencia GPL-3.0-or-later.`;

    this.openModal({
      title: "Acerca de Murk",
      body,
      onEscape: () => this.closeModal(),
      actions: [{ label: "Cerrar", primary: true, onClick: () => this.closeModal() }],
    });
  }
}
