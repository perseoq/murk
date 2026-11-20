// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { host } from "../host";
import type {
  DirEntry,
  Eol,
  FileChangedEvent,
  HistoryMeta,
  OpenedFile,
  RecentEntry,
  RecoverySnapshot,
  RepositoryConfig,
  SaveOptions,
  SearchHit,
  Settings,
  Session,
  SidebarView,
  ExportFormat,
} from "../host";
import { ENCODING_OPTIONS, convertEol, encodingDisplayName } from "./encoding";
import { MurkEditor } from "../editor/editor";
import type { TableAction } from "../editor/table";
import { setImageDocumentPath, clearImageCache } from "../editor/widgets/image";
import { parseOutline } from "./outline";
import {
  DEFAULT_REPOSITORY,
  DEFAULT_SETTINGS,
  applySettings,
  normalizeKeybindings,
  normalizeRepository,
  normalizeSettings,
} from "./settings";
import { shortcutFor, MENUS, type ActionId, type MenuDef } from "./menus";
import { FORMAT_ACTIONS, type FormatAction } from "../editor/format";
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

function replaceExtension(path: string, extension: string): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const base = dot > slash ? path.slice(0, dot) : path;
  return `${base}.${extension}`;
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
  private sidebarToggle!: HTMLButtonElement;
  private sidebarResizer!: HTMLElement;
  private tabsElement!: HTMLElement;
  private statusFile!: HTMLElement;
  private statusCount!: HTMLElement;
  private statusEncoding!: HTMLButtonElement;
  private statusEol!: HTMLButtonElement;
  private statusModeCode!: HTMLButtonElement;
  private statusModeEditor!: HTMLButtonElement;
  private statusModeReadOnly!: HTMLButtonElement;
  private viewMode: "editor" | "code" = "editor";
  private viewReadOnly = false;
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
  private unlistenOpenFiles: (() => void) | null = null;
  private booted = false;
  private readonly pendingOpenPaths: string[] = [];
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
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private previousFocus: HTMLElement | null = null;
  private autosaveHandle: number | null = null;
  private autoPushHandle: number | null = null;
  private recoveryHandle: number | null = null;
  private autosaveRunning = false;
  private pushRunning = false;
  private repoConfig: RepositoryConfig = { ...DEFAULT_REPOSITORY };
  private readonly snapshotTimers = new Map<string, number>();
  private readonly lastSnapshots = new Map<string, string>();
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
    this.bindShellEvents();
    this.bindWindowClose();

    // El listener de apertura se registra antes de restaurar la sesión: si el
    // usuario abre un archivo mientras la app arranca, la ruta se encola en
    // lugar de perderse.
    this.unlistenOpenFiles = await host
      .listenOpenFiles((paths) => this.queueOpenPaths(paths))
      .catch(() => null);

    try {
      this.unlistenFileChanged = await host.listenFileChanged((event) => {
        this.queueFileEvent(event);
      });
    } catch (error) {
      console.warn("No se pudo escuchar eventos de archivos", error);
    }

    await this.restoreSession();

    const startupFiles = await host.startupFiles().catch(() => []);
    for (const path of startupFiles) {
      await this.openPath(path);
    }

    this.booted = true;
    const pending = this.pendingOpenPaths.splice(0);
    for (const path of pending) {
      await this.openPath(path);
    }

    this.applySidebarLayout();
    this.renderSidebar();
    this.configureAutosave();
    this.configureAutoPush();
    this.recoveryHandle = window.setInterval(() => {
      void this.snapshotDirty("interval");
    }, 30_000);

    if (this.workspaceRoot) {
      void this.ensureDir(this.workspaceRoot);
    }

    void this.handleStartupRecovery();

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
    if (this.statusTimer !== null) {
      clearTimeout(this.statusTimer);
      this.statusTimer = null;
    }
    if (this.autosaveHandle !== null) {
      clearInterval(this.autosaveHandle);
      this.autosaveHandle = null;
    }
    if (this.autoPushHandle !== null) {
      clearInterval(this.autoPushHandle);
      this.autoPushHandle = null;
    }
    if (this.recoveryHandle !== null) {
      clearInterval(this.recoveryHandle);
      this.recoveryHandle = null;
    }
    for (const timer of this.snapshotTimers.values()) {
      clearTimeout(timer);
    }
    this.snapshotTimers.clear();
    for (const timer of this.watchTimers.values()) {
      clearTimeout(timer);
    }
    this.watchTimers.clear();
    this.unlistenFileChanged?.();
    this.unlistenFileChanged = null;
    this.unlistenOpenFiles?.();
    this.unlistenOpenFiles = null;
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

    try {
      this.repoConfig = normalizeRepository(await host.repositoryConfigLoad());
    } catch (error) {
      this.repoConfig = { ...DEFAULT_REPOSITORY };
      console.warn("No se pudo cargar la configuración del repositorio", error);
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
    this.sidebarVisible = session.sidebarVisible !== false;
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
          <button
            class="sidebar-toggle"
            id="sidebar-toggle"
            type="button"
            title="Mostrar u ocultar barra lateral (Ctrl+Shift+1)"
            aria-label="Mostrar u ocultar barra lateral"
            aria-controls="sidebar"
            aria-expanded="true"
          >☰</button>
          <div class="brand" aria-hidden="true">
            <img src="/favicon.svg" alt="" width="24" height="24" />
          </div>
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
          <div class="status-modes" role="group" aria-label="Modo de vista">
            <button
              id="status-mode-code"
              class="status-icon-button"
              type="button"
              title="Ver código fuente (Ctrl+/)"
              aria-label="Ver código fuente"
              aria-pressed="false"
            ><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg></button>
            <button
              id="status-mode-editor"
              class="status-icon-button"
              type="button"
              title="Ver editor con vista previa"
              aria-label="Ver editor con vista previa"
              aria-pressed="true"
            ><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>
            <button
              id="status-mode-readonly"
              class="status-icon-button"
              type="button"
              title="Alternar solo lectura"
              aria-label="Alternar solo lectura"
              aria-pressed="false"
            ><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg></button>
          </div>
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
    this.editor.setSpellcheck(this.settings.spellcheck, this.settings.spellcheckLanguage);
    this.editor.setKeybindings(this.settings.keybindings);

    this.tabsElement = this.query<HTMLElement>(".tabs");
    this.workspaceElement = this.query<HTMLElement>("#workspace");
    this.sidebarElement = this.query<HTMLElement>("#sidebar");
    this.sidebarContent = this.query<HTMLElement>("#sidebar-content");
    this.sidebarToggle = this.query<HTMLButtonElement>("#sidebar-toggle");
    this.sidebarResizer = this.query<HTMLElement>("#sidebar-resizer");
    this.statusFile = this.query<HTMLElement>("#status-file");
    this.statusCount = this.query<HTMLElement>("#status-count");
    this.statusEncoding = this.query<HTMLButtonElement>("#status-encoding");
    this.statusEol = this.query<HTMLButtonElement>("#status-eol");
    this.statusModeCode = this.query<HTMLButtonElement>("#status-mode-code");
    this.statusModeEditor = this.query<HTMLButtonElement>("#status-mode-editor");
    this.statusModeReadOnly = this.query<HTMLButtonElement>("#status-mode-readonly");
    this.saveState = this.query<HTMLElement>("#save-state");
    this.menuLayer = this.query<HTMLElement>("#menu-layer");
    this.modalLayer = this.query<HTMLElement>("#modal-layer");
    this.toastLayer = this.query<HTMLElement>("#toast-layer");

    this.buildMenus();
    this.updateViewModeButtons();
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
      const checkable = item.checkable === true;
      const checked = checkable && this.isActionChecked(item.action);
      entry.setAttribute("role", checkable ? "menuitemcheckbox" : "menuitem");
      if (checkable) {
        entry.setAttribute("aria-checked", String(checked));
      }
      entry.dataset.action = item.action;

      const mark = document.createElement("span");
      mark.className = "menu-check";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = checked ? "✓" : "";
      entry.append(mark);

      const label = document.createElement("span");
      label.className = "menu-label";
      label.textContent = item.label;
      entry.append(label);

      if (item.shortcut) {
        const combo = this.shortcutLabel(item.action);
        if (combo) {
          const shortcut = document.createElement("kbd");
          shortcut.textContent = combo;
          entry.append(shortcut);
        }
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
      const items = Array.from(
        dropdown.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"], [role="menuitemcheckbox"]',
        ),
      );
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
    dropdown
      .querySelector<HTMLButtonElement>('[role="menuitem"], [role="menuitemcheckbox"]')
      ?.focus();
  }

  private closeMenus(): void {
    this.openMenuId = null;
    this.menuLayer.replaceChildren();
    this.root.querySelectorAll<HTMLButtonElement>(".menu-button").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  private shortcutLabel(action: ActionId): string | undefined {
    return this.settings.keybindings[action] ?? shortcutFor(action);
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
      case "file.push":
        await this.pushActive();
        break;
      case "file.history":
        await this.showHistory();
        break;
      case "file.export":
        await this.showExport();
        break;
      case "file.repository":
        this.showRepository();
        break;
      case "file.autosave":
        this.toggleAutosave();
        break;
      case "file.autopush":
        this.toggleAutoPush();
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
      case "format.bold":
        this.editor.format("bold");
        break;
      case "format.italic":
        this.editor.format("italic");
        break;
      case "format.strikethrough":
        this.editor.format("strikethrough");
        break;
      case "format.code":
        this.editor.format("code");
        break;
      case "format.link":
        this.editor.format("link");
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
      case "view.formatShortcuts":
        this.showFormatShortcuts();
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
      case "help.updates":
        await this.showUpdates();
        break;
    }
  }

  private bindShellEvents(): void {
    this.query<HTMLButtonElement>("#tab-new").addEventListener("click", () => {
      this.newTab();
    });

    this.sidebarToggle.addEventListener("click", () => {
      this.toggleSidebar();
      this.sidebarToggle.focus();
    });

    this.statusEncoding.addEventListener("click", () => {
      this.showFileFormat();
    });
    this.statusEol.addEventListener("click", () => {
      this.showFileFormat();
    });

    this.statusModeCode.addEventListener("click", () => {
      this.setViewMode("code");
    });
    this.statusModeEditor.addEventListener("click", () => {
      this.setViewMode("editor");
    });
    this.statusModeReadOnly.addEventListener("click", () => {
      this.toggleReadOnlyView();
    });

    const sidebarTabs = Array.from(
      this.sidebarElement.querySelectorAll<HTMLButtonElement>("[data-view]"),
    );

    sidebarTabs.forEach((button, index) => {
      button.addEventListener("click", () => {
        const view = button.dataset.view as SidebarView | undefined;
        if (view === "files" || view === "outline" || view === "search") {
          this.showSidebar(view);
        }
      });

      button.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
          return;
        }
        event.preventDefault();
        const offset = event.key === "ArrowRight" ? 1 : -1;
        const next = sidebarTabs[(index + offset + sidebarTabs.length) % sidebarTabs.length];
        next.focus();
        next.click();
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
      if (event.isComposing) {
        return;
      }

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
        case "/":
          event.preventDefault();
          this.setViewMode(this.viewMode === "code" ? "editor" : "code");
          break;
      }
    });

    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        void this.persistSession();
      }
    });

    window.addEventListener("blur", () => {
      if (this.settings.autosave === "blur") {
        void this.autoSaveDirty();
      }
    });
  }

  private newTab(): void {
    if (this.settings.autosave === "save") {
      void this.autoSaveDirty();
    }
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

  private queueOpenPaths(paths: string[]): void {
    if (!this.booted) {
      this.pendingOpenPaths.push(...paths);
      return;
    }
    for (const path of paths) {
      void this.openPath(path);
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
      const contentToSave = tab.content;
      const saved = await host.fileSave(path, contentToSave, options);

      this.localWrites.set(saved.path, Date.now());
      if (previousPath && previousPath !== saved.path) {
        void host.unwatchFile(previousPath).catch(() => undefined);
      }
      void this.watchPath(saved.path);
      void this.rememberRecent(saved.path);

      this.workspace.markSaved(tab.id, saved);
      if (tab.content !== contentToSave) {
        tab.dirty = true;
        this.scheduleSnapshot(tab);
      }
      const docId = this.docId(tab);
      this.lastSnapshots.delete(docId);
      void host.recoveryDelete(docId).catch(() => undefined);
      if (previousPath && previousPath !== saved.path) {
        void host.recoveryDelete(previousPath).catch(() => undefined);
      }
      void host.historyRecord(saved.path, contentToSave, "save").catch(() => undefined);
      if (this.workspace.activeId === tab.id) {
        this.editor.setReadOnly(tab.readOnly || this.viewReadOnly);
        setImageDocumentPath(saved.path);
        this.editor.refresh();
      }
      this.renderTabs();
      this.updateStatus();
      this.updateTitle();
      if (!tab.dirty) {
        this.saveState.textContent = "Guardado";
      }
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

    void host.recoveryDelete(this.docId(tab)).catch(() => undefined);
    this.lastSnapshots.delete(this.docId(tab));
    const timer = this.snapshotTimers.get(tab.id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.snapshotTimers.delete(tab.id);
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

      try {
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
        await host.recoveryClear().catch(() => undefined);
        await host.recoveryMarkClean().catch(() => undefined);
        this.allowClose = true;
        await host.window.destroy();
      } catch (error) {
        this.allowClose = false;
        this.toast(`No se pudo cerrar Murk: ${errorMessage(error)}`);
      }
    });
  }

  private activateTab(id: string): void {
    if (this.workspace.activeId === id) {
      return;
    }
    if (this.settings.autosave === "save") {
      void this.autoSaveDirty();
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

    const wasDirty = tab.dirty;
    this.workspace.updateContent(tab.id, content);
    tab.cursor = this.editor.getCursor();
    if (!wasDirty) {
      this.renderTabs();
    }
    this.saveState.textContent = "Sin guardar";
    this.scheduleStatus();
    this.updateTitle();
    this.scheduleSession();
    if (this.sidebarVisible && this.sidebarView === "outline") {
      this.scheduleOutline();
    }
    this.scheduleSnapshot(tab);
  }

  private scheduleStatus(): void {
    if (this.statusTimer !== null) {
      clearTimeout(this.statusTimer);
    }
    this.statusTimer = setTimeout(() => {
      this.statusTimer = null;
      this.updateStatus();
    }, 120);
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
    this.editor.activate(tab.id, tab.content, tab.cursor, tab.readOnly || this.viewReadOnly);
    this.editor.setSourceMode(this.viewMode === "code" && !this.viewReadOnly);
    this.editor.scrollToRatio(tab.scroll);
    this.editor.requestMeasure();
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
        sidebarVisible: this.sidebarVisible,
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

  private configureAutosave(): void {
    if (this.autosaveHandle !== null) {
      clearInterval(this.autosaveHandle);
      this.autosaveHandle = null;
    }

    if (this.settings.autosave === "interval") {
      this.autosaveHandle = window.setInterval(() => {
        void this.autoSaveDirty();
      }, this.settings.autosaveIntervalMs);
    }
  }

  private isActionChecked(action: ActionId): boolean {
    switch (action) {
      case "file.autosave":
        return this.settings.autosave !== "off";
      case "file.autopush":
        return this.repoConfig.autoPush;
      default:
        return false;
    }
  }

  private toggleAutosave(): void {
    const enabled = this.settings.autosave === "off";
    const next: Settings["autosave"] = enabled ? "interval" : "off";
    this.settings = { ...this.settings, autosave: next };
    applySettings(this.settings);
    this.configureAutosave();
    void host.settingsSave(this.settings).catch((error: unknown) => {
      this.toast(`No se pudieron guardar las preferencias: ${errorMessage(error)}`);
    });
    this.toast(
      enabled
        ? `Autoguardado activado (cada ${Math.round(this.settings.autosaveIntervalMs / 1000)} s).`
        : "Autoguardado desactivado.",
    );
  }

  private toggleAutoPush(): void {
    if (!this.repoConfig.url) {
      this.askConfigureRepository();
      return;
    }

    const next = { ...this.repoConfig, autoPush: !this.repoConfig.autoPush };
    this.repoConfig = next;
    this.configureAutoPush();
    void host
      .repositoryConfigSave(next)
      .then((saved) => {
        this.repoConfig = normalizeRepository(saved);
        this.configureAutoPush();
      })
      .catch((error: unknown) => {
        this.toast(`No se pudo guardar el repositorio: ${errorMessage(error)}`);
      });
    this.toast(
      next.autoPush
        ? `Autopush activado (cada ${Math.round(this.settings.autosaveIntervalMs / 1000)} s).`
        : "Autopush desactivado.",
    );
  }

  private configureAutoPush(): void {
    if (this.autoPushHandle !== null) {
      clearInterval(this.autoPushHandle);
      this.autoPushHandle = null;
    }

    if (this.repoConfig.autoPush && this.repoConfig.url) {
      this.autoPushHandle = window.setInterval(() => {
        void this.autoPushTick();
      }, this.settings.autosaveIntervalMs);
    }
  }

  private async autoPushTick(): Promise<void> {
    if (this.pushRunning || !this.repoConfig.autoPush || !this.repoConfig.url) {
      return;
    }

    const pending = this.workspace.tabs
      .filter((tab) => tab.dirty && tab.path && !tab.readOnly && !tab.missing)
      .map((tab) => tab.path as string);
    if (pending.length === 0) {
      return;
    }

    this.pushRunning = true;
    try {
      await this.autoSaveDirty();
      const ready = pending.filter((path) =>
        this.workspace.tabs.some((tab) => tab.path === path && !tab.dirty),
      );
      if (ready.length === 0) {
        return;
      }
      const result = await host.repositoryPush(ready);
      if (result.commit) {
        this.toast(`Autopush: ${result.commit}`);
      }
    } catch (error) {
      this.toast(`Autopush: ${errorMessage(error)}`);
    } finally {
      this.pushRunning = false;
    }
  }

  private async pushActive(): Promise<void> {
    if (!this.repoConfig.url) {
      this.askConfigureRepository();
      return;
    }

    const tab = this.workspace.active;
    if (!tab) {
      return;
    }

    if (!tab.path || tab.dirty) {
      const saved = await this.saveActive(false);
      if (!saved || !tab.path) {
        return;
      }
    }

    if (this.pushRunning) {
      this.toast("Ya hay un push en curso.");
      return;
    }

    this.pushRunning = true;
    let finished = false;

    const body = document.createElement("div");
    body.className = "push-progress";
    const bar = document.createElement("div");
    bar.className = "push-bar";
    const fill = document.createElement("div");
    fill.className = "push-bar-fill running";
    bar.append(fill);
    const status = document.createElement("p");
    status.className = "push-status";
    status.textContent = "Preparando el repositorio y subiendo los cambios…";
    const detail = document.createElement("p");
    detail.className = "push-detail";
    detail.textContent = `${this.repoConfig.branch} · ${this.repoConfig.url}`;
    body.append(bar, status, detail);

    this.openModal({
      title: "Push",
      body,
      onEscape: () => {
        if (finished) {
          this.closeModal();
        }
      },
      actions: [],
    });

    try {
      const result = await host.repositoryPush([tab.path]);
      finished = true;
      fill.classList.remove("running");
      fill.classList.add("done");
      status.textContent = "Push completado correctamente.";
      detail.textContent = [
        result.commit ?? "Sin cambios nuevos que commitear.",
        `Rama: ${result.branch}`,
        ...result.files.map((file) => `• ${file}`),
      ].join("\n");
      this.toast(
        result.commit
          ? `Push completado: ${result.commit}`
          : `Push completado en ${result.branch} (sin cambios).`,
      );
      this.addPushCloseButton();
    } catch (error) {
      finished = true;
      fill.classList.remove("running");
      fill.classList.add("failed");
      status.textContent = "El push no se pudo completar.";
      detail.textContent = errorMessage(error);
      this.addPushCloseButton();
    } finally {
      this.pushRunning = false;
    }
  }

  private addPushCloseButton(): void {
    const actions = this.modalLayer.querySelector<HTMLElement>(".modal-actions");
    if (!actions) {
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-primary";
    button.textContent = "Cerrar";
    button.addEventListener("click", () => this.closeModal());
    actions.append(button);
    button.focus();
  }

  private askConfigureRepository(): void {
    this.openModal({
      title: "Repositorio no configurado",
      message: "Todavía no hay un repositorio configurado. ¿Quieres configurarlo ahora?",
      onEscape: () => this.closeModal(),
      actions: [
        {
          label: "Configurar ahora",
          primary: true,
          onClick: () => {
            this.closeModal();
            this.showRepository();
          },
        },
        { label: "Cancelar", onClick: () => this.closeModal() },
      ],
    });
  }

  private showRepository(): void {
    const config = this.repoConfig;
    const form = document.createElement("form");
    form.className = "settings-form";
    form.innerHTML = `
      <label class="field">
        <span>URL del repositorio</span>
        <input id="repo-url" type="text" placeholder="https://github.com/usuario/repo.git" maxlength="500" />
      </label>
      <label class="field">
        <span>Rama (branch)</span>
        <input id="repo-branch" type="text" list="repo-branches" placeholder="main" maxlength="200" />
        <datalist id="repo-branches">
          <option value="main"></option>
          <option value="master"></option>
          <option value="develop"></option>
        </datalist>
      </label>
      <label class="field">
        <span>Ruta dentro del repositorio</span>
        <input id="repo-path" type="text" placeholder="docs/notas (vacío = raíz)" maxlength="500" />
      </label>
      <fieldset class="field repo-options">
        <legend>Integración antes del push</legend>
        <label class="field-inline">
          <input type="radio" name="repo-strategy" value="merge" />
          <span>Merge (pull --no-rebase)</span>
        </label>
        <label class="field-inline">
          <input type="radio" name="repo-strategy" value="rebase" />
          <span>Rebase (pull --rebase)</span>
        </label>
        <label class="field-inline">
          <input type="radio" name="repo-strategy" value="none" />
          <span>Sin pull</span>
        </label>
      </fieldset>
      <label class="field field-inline">
        <input id="repo-pull" type="checkbox" />
        <span>Hacer pull antes del push</span>
      </label>
      <label class="field field-inline">
        <input id="repo-create" type="checkbox" />
        <span>Crear la rama si no existe</span>
      </label>
      <label class="field field-inline">
        <input id="repo-autopush" type="checkbox" />
        <span>Autopush tras el autoguardado</span>
      </label>
      <p class="field-hint">
        Se guarda en ~/.murk/config.json. El clon local vive en ~/.murk/repos/.
        Requiere git instalado y credenciales configuradas (SSH o token HTTPS).
      </p>
    `;

    const url = form.querySelector<HTMLInputElement>("#repo-url");
    const branch = form.querySelector<HTMLInputElement>("#repo-branch");
    const path = form.querySelector<HTMLInputElement>("#repo-path");
    const pull = form.querySelector<HTMLInputElement>("#repo-pull");
    const create = form.querySelector<HTMLInputElement>("#repo-create");
    const autoPush = form.querySelector<HTMLInputElement>("#repo-autopush");
    const strategies = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[name="repo-strategy"]'),
    );

    if (url) url.value = config.url;
    if (branch) branch.value = config.branch;
    if (path) path.value = config.path;
    if (pull) pull.checked = config.pullBeforePush;
    if (create) create.checked = config.createBranch;
    if (autoPush) autoPush.checked = config.autoPush;
    for (const radio of strategies) {
      radio.checked = radio.value === config.strategy;
    }

    this.openModal({
      title: "Repositorio",
      message: "Publica documentos en un repositorio git remoto.",
      body: form,
      onEscape: () => this.closeModal(),
      actions: [
        {
          label: "Guardar",
          primary: true,
          onClick: () => {
            void (async () => {
              const selected = strategies.find((radio) => radio.checked)?.value ?? "merge";
              const next = normalizeRepository({
                url: url?.value,
                branch: branch?.value,
                path: path?.value,
                strategy: selected as RepositoryConfig["strategy"],
                pullBeforePush: pull?.checked ?? true,
                createBranch: create?.checked ?? false,
                autoPush: autoPush?.checked ?? false,
              });

              try {
                const saved = await host.repositoryConfigSave(next);
                this.repoConfig = normalizeRepository(saved);
                this.configureAutoPush();
                this.closeModal();
                this.toast("Configuración del repositorio guardada.");
              } catch (error) {
                this.toast(errorMessage(error));
              }
            })();
          },
        },
        { label: "Cancelar", onClick: () => this.closeModal() },
      ],
    });
  }

  private setViewMode(mode: "editor" | "code"): void {
    if (mode === "code" && this.viewReadOnly) {
      this.toast("Desactiva el modo lectura para ver el código fuente.");
      return;
    }
    if (this.viewMode === mode) {
      return;
    }
    this.viewMode = mode;
    this.applyViewState();
    this.toast(mode === "code" ? "Modo código." : "Modo editor.");
  }

  private toggleReadOnlyView(): void {
    this.viewReadOnly = !this.viewReadOnly;
    if (this.viewReadOnly) {
      // El modo lectura siempre muestra el Markdown renderizado.
      this.viewMode = "editor";
    }
    this.applyViewState();
    this.toast(this.viewReadOnly ? "Solo lectura activado." : "Edición habilitada.");
  }

  private applyViewState(): void {
    const tab = this.workspace.active;
    this.editor.setSourceMode(this.viewMode === "code" && !this.viewReadOnly);
    this.editor.setReadOnly((tab?.readOnly ?? false) || this.viewReadOnly);
    this.updateViewModeButtons();
  }

  private updateViewModeButtons(): void {
    this.statusModeCode.setAttribute("aria-pressed", String(this.viewMode === "code"));
    this.statusModeEditor.setAttribute("aria-pressed", String(this.viewMode === "editor"));
    this.statusModeReadOnly.setAttribute("aria-pressed", String(this.viewReadOnly));
    this.statusModeCode.classList.toggle("active", this.viewMode === "code");
    this.statusModeEditor.classList.toggle("active", this.viewMode === "editor");
    this.statusModeReadOnly.classList.toggle("active", this.viewReadOnly);
    this.statusModeCode.disabled = this.viewReadOnly;
    this.statusModeCode.title = this.viewReadOnly
      ? "Desactiva el modo lectura para ver el código fuente"
      : "Ver código fuente (Ctrl+/)";
  }

  private docId(tab: Tab): string {
    return tab.path ?? tab.id;
  }

  private scheduleSnapshot(tab: Tab): void {
    if (!host.isDesktop()) {
      return;
    }

    const existing = this.snapshotTimers.get(tab.id);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    const timer = window.setTimeout(() => {
      this.snapshotTimers.delete(tab.id);
      void this.snapshotTab(tab.id, "interval");
    }, 5_000);

    this.snapshotTimers.set(tab.id, timer);
  }

  private async snapshotTab(tabId: string, reason: string): Promise<void> {
    if (this.autosaveRunning) {
      return;
    }

    const tab = this.workspace.tabs.find((item) => item.id === tabId);
    if (!tab || !tab.dirty) {
      return;
    }

    if (this.workspace.activeId === tab.id) {
      this.captureCursor();
    }

    const docId = this.docId(tab);
    if (reason === "interval" && this.lastSnapshots.get(docId) === tab.content) {
      return;
    }

    try {
      await host.recoveryWrite({
        docId,
        path: tab.path,
        name: tab.name,
        content: tab.content,
        reason,
      });
      this.lastSnapshots.set(docId, tab.content);
    } catch {
      // La recuperación es best-effort.
    }
  }

  private async snapshotDirty(reason: string): Promise<void> {
    if (!host.isDesktop()) {
      return;
    }

    this.captureCursor();
    for (const tab of [...this.workspace.tabs]) {
      if (tab.dirty) {
        await this.snapshotTab(tab.id, reason);
      }
    }
  }

  private async autoSaveDirty(): Promise<void> {
    if (this.autosaveRunning || !host.isDesktop()) {
      return;
    }

    this.autosaveRunning = true;
    this.captureCursor();

    try {
      for (const tab of [...this.workspace.tabs]) {
        if (!tab.dirty || !tab.path || tab.readOnly || tab.missing) {
          continue;
        }

        try {
          const contentToSave = tab.content;
          const saved = await host.fileSave(tab.path, contentToSave, {
            encoding: tab.encoding,
            bom: tab.bom,
            eol: tab.eol,
            convertEol: false,
            expectedFingerprint: tab.fingerprint || null,
          });
          const docId = this.docId(tab);
          this.localWrites.set(saved.path, Date.now());
          this.workspace.markSaved(tab.id, saved);
          if (tab.content !== contentToSave) {
            tab.dirty = true;
            this.scheduleSnapshot(tab);
          }
          this.lastSnapshots.delete(docId);
          void host.recoveryDelete(docId).catch(() => undefined);
          void host.historyRecord(saved.path, contentToSave, "autosave").catch(() => undefined);
        } catch {
          // Conflicto o error de escritura: se deja para el guardado manual.
        }
      }
    } finally {
      this.autosaveRunning = false;
    }

    this.renderTabs();
    this.updateStatus();
    this.updateTitle();
    this.scheduleSession();
  }

  private async handleStartupRecovery(): Promise<void> {
    if (!host.isDesktop()) {
      return;
    }

    try {
      const crashed = await host.recoveryCheckCrash();
      if (!crashed) {
        return;
      }

      const snapshots = await host.recoveryList();
      if (snapshots.length > 0) {
        this.showRecovery(snapshots);
      }
    } catch (error) {
      console.warn("No se pudo comprobar la recuperación", error);
    }
  }

  private showRecovery(snapshots: RecoverySnapshot[]): void {
    const body = document.createElement("div");
    body.className = "recovery-list";
    const checks: Array<{ input: HTMLInputElement; snapshot: RecoverySnapshot }> = [];

    for (const snapshot of snapshots) {
      const label = document.createElement("label");
      label.className = "recovery-item";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = true;

      const details = document.createElement("span");
      details.className = "recovery-details";
      const name = document.createElement("strong");
      name.textContent = snapshot.name;
      const meta = document.createElement("span");
      meta.textContent = `${snapshot.path ?? "Sin título"} · ${new Date(
        snapshot.createdAt,
      ).toLocaleString()}`;
      details.append(name, meta);

      label.append(input, details);
      body.append(label);
      checks.push({ input, snapshot });
    }

    this.openModal({
      title: "Recuperar documentos",
      message: "La sesión anterior no se cerró correctamente. Elige qué recuperar.",
      body,
      onEscape: () => this.closeModal(),
      actions: [
        {
          label: "Restaurar seleccionados",
          primary: true,
          onClick: () => {
            const selected = checks
              .filter((entry) => entry.input.checked)
              .map((entry) => entry.snapshot);
            if (selected.length === 0) {
              this.toast("No hay documentos seleccionados.");
              return;
            }

            for (const snapshot of selected) {
              const tab = this.workspace.openSnapshot(snapshot);
              this.editor.invalidate(tab.id);
              void host.recoveryDelete(snapshot.docId).catch(() => undefined);
            }

            this.closeModal();
            this.renderAll();
            this.editor.focus();
            this.toast(`${selected.length} documento(s) restaurado(s).`);
          },
        },
        {
          label: "Descartar todo",
          danger: true,
          onClick: () => {
            void host
              .recoveryClear()
              .then(() => {
                this.closeModal();
                this.toast("Recuperaciones descartadas.");
              })
              .catch((error: unknown) => this.toast(errorMessage(error)));
          },
        },
        { label: "Cancelar", onClick: () => this.closeModal() },
      ],
    });
  }

  private async showHistory(): Promise<void> {
    const tab = this.workspace.active;
    if (!tab?.path) {
      this.toast("Guarda el documento para tener historial.");
      return;
    }

    let entries: HistoryMeta[];
    try {
      entries = await host.historyList(tab.path);
    } catch (error) {
      this.toast(errorMessage(error));
      return;
    }

    if (entries.length === 0) {
      this.toast("Todavía no hay versiones de este documento.");
      return;
    }

    const body = document.createElement("div");
    body.className = "history-list";

    for (const entry of entries.slice(0, 30)) {
      const row = document.createElement("div");
      row.className = "history-row";

      const details = document.createElement("div");
      details.className = "history-details";
      const date = document.createElement("strong");
      date.textContent = new Date(entry.createdAt).toLocaleString();
      const meta = document.createElement("span");
      meta.textContent = `${Math.ceil(entry.size / 1024)} KB · ${entry.trigger}`;
      details.append(date, meta);

      const actions = document.createElement("div");
      actions.className = "history-actions";

      const diff = document.createElement("button");
      diff.type = "button";
      diff.className = "button";
      diff.textContent = "Diferencias";
      diff.addEventListener("click", () => {
        void this.showHistoryDiff(tab.path as string, entry);
      });

      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "button button-primary";
      restore.textContent = "Restaurar";
      restore.addEventListener("click", () => {
        void this.restoreHistory(tab.path as string, entry);
      });

      actions.append(diff, restore);
      row.append(details, actions);
      body.append(row);
    }

    this.openModal({
      title: "Historial del documento",
      message: tab.name,
      body,
      onEscape: () => this.closeModal(),
      actions: [
        {
          label: "Limpiar historial",
          danger: true,
          onClick: () => {
            void host
              .historyClear(tab.path as string)
              .then(() => {
                this.closeModal();
                this.toast("Historial borrado.");
              })
              .catch((error: unknown) => this.toast(errorMessage(error)));
          },
        },
        { label: "Cerrar", primary: true, onClick: () => this.closeModal() },
      ],
    });
  }

  private async showHistoryDiff(path: string, entry: HistoryMeta): Promise<void> {
    try {
      const content = await host.historyRead(path, entry.id);
      const current = this.workspace.active?.content ?? "";
      const body = document.createElement("div");

      const diff = document.createElement("pre");
      diff.className = "diff";
      diff.textContent = renderDiff(current, content);
      body.append(diff);

      this.openModal({
        title: "Diferencias con la versión guardada",
        body,
        onEscape: () => this.closeModal(),
        actions: [
          {
            label: "Restaurar esta versión",
            primary: true,
            onClick: () => {
              void this.restoreHistory(path, entry);
            },
          },
          { label: "Cerrar", onClick: () => this.closeModal() },
        ],
      });
    } catch (error) {
      this.toast(errorMessage(error));
    }
  }

  private async restoreHistory(path: string, entry: HistoryMeta): Promise<void> {
    try {
      const content = await host.historyRead(path, entry.id);
      this.editor.setContent(content, 0);
      this.closeModal();
      this.toast("Versión restaurada; guarda para aplicarla.");
    } catch (error) {
      this.toast(errorMessage(error));
    }
  }

  private async showExport(): Promise<void> {
    const tab = this.workspace.active;
    if (!tab) {
      this.toast("No hay documento activo.");
      return;
    }

    this.captureCursor();

    const form = document.createElement("form");
    form.className = "settings-form";
    form.innerHTML = `
      <label class="field">
        <span>Formato</span>
        <select id="export-format">
          <option value="html">HTML</option>
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
          <option value="epub">EPUB</option>
          <option value="odt">ODT</option>
          <option value="latex">LaTeX</option>
          <option value="md">Markdown limpio</option>
        </select>
      </label>
      <label class="field field-inline">
        <input id="export-embed" type="checkbox" checked />
        <span>Incrustar imágenes (HTML/PDF)</span>
      </label>
      <p class="field-hint">DOCX, EPUB, ODT y LaTeX requieren Pandoc. El PDF usa Chromium o Pandoc según Preferencias.</p>
    `;

    const formatSelect = form.querySelector<HTMLSelectElement>("#export-format");
    const embed = form.querySelector<HTMLInputElement>("#export-embed");

    this.openModal({
      title: "Exportar documento",
      message: tab.name,
      body: form,
      onEscape: () => this.closeModal(),
      actions: [
        {
          label: "Exportar",
          primary: true,
          onClick: () => {
            void (async () => {
              const format = (formatSelect?.value ?? "html") as ExportFormat;
              const extension = format === "latex" ? "tex" : format;
              const defaultPath = tab.path
                ? replaceExtension(tab.path, extension)
                : `${tab.name}.${extension}`;

              let output: string | null;
              try {
                output = await host.saveExportDialog(defaultPath, format);
              } catch (error) {
                this.toast(errorMessage(error));
                return;
              }
              if (!output) {
                return;
              }

              this.closeModal();
              this.toast("Exportando…");

              try {
                const result = await host.exportDocument({
                  sourcePath: tab.path,
                  outputPath: output,
                  format,
                  content: tab.content,
                  title: tab.name,
                  embedImages: embed?.checked ?? true,
                });
                this.toast(`Exportado: ${result.path} (${result.engine})`);
              } catch (error) {
                this.toast(errorMessage(error));
              }
            })();
          },
        },
        { label: "Cancelar", onClick: () => this.closeModal() },
      ],
    });
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
    if (this.sidebarToggle) {
      this.sidebarToggle.setAttribute("aria-expanded", String(this.sidebarVisible));
      this.sidebarToggle.classList.toggle("active", !this.sidebarVisible);
    }
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
    this.previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

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
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  private closeModal(): void {
    const previous = this.previousFocus;
    this.previousFocus = null;
    this.modalLayer.replaceChildren();

    if (previous?.isConnected) {
      previous.focus();
    }
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
      <label class="field">
        <span>Autoguardado</span>
        <select id="setting-autosave">
          <option value="off">Desactivado</option>
          <option value="interval">Cada intervalo</option>
          <option value="blur">Al perder el foco</option>
          <option value="save">Al cambiar de pestaña</option>
        </select>
      </label>
      <label class="field">
        <span>Intervalo de autoguardado (segundos)</span>
        <input id="setting-autosave-interval" type="number" min="5" max="600" step="5" />
      </label>
      <label class="field field-inline">
        <input id="setting-spellcheck" type="checkbox" />
        <span>Corrector ortográfico</span>
      </label>
      <label class="field">
        <span>Idioma del corrector</span>
        <input id="setting-spellcheck-language" type="text" placeholder="es, en-US…" maxlength="20" />
      </label>
      <label class="field">
        <span>Motor PDF</span>
        <select id="setting-pdf-engine">
          <option value="chromium">Chromium (fiel)</option>
          <option value="pandoc">Pandoc + LaTeX</option>
        </select>
      </label>
      <label class="field">
        <span>Ruta de Pandoc</span>
        <input id="setting-pandoc" type="text" placeholder="pandoc (PATH)" maxlength="500" />
      </label>
      <label class="field">
        <span>Ruta de Chromium</span>
        <input id="setting-chromium" type="text" placeholder="Detección automática" maxlength="500" />
      </label>
    `;

    const theme = form.querySelector<HTMLSelectElement>("#setting-theme");
    const font = form.querySelector<HTMLInputElement>("#setting-font");
    const size = form.querySelector<HTMLInputElement>("#setting-size");
    const tabSize = form.querySelector<HTMLInputElement>("#setting-tab");
    const autosave = form.querySelector<HTMLSelectElement>("#setting-autosave");
    const autosaveInterval = form.querySelector<HTMLInputElement>("#setting-autosave-interval");
    const pdfEngine = form.querySelector<HTMLSelectElement>("#setting-pdf-engine");
    const pandocPath = form.querySelector<HTMLInputElement>("#setting-pandoc");
    const chromiumPath = form.querySelector<HTMLInputElement>("#setting-chromium");
    const spellcheck = form.querySelector<HTMLInputElement>("#setting-spellcheck");
    const spellcheckLanguage = form.querySelector<HTMLInputElement>("#setting-spellcheck-language");

    if (theme) theme.value = this.settings.theme;
    if (font) font.value = this.settings.fontFamily;
    if (size) size.value = String(this.settings.fontSize);
    if (tabSize) tabSize.value = String(this.settings.tabSize);
    if (autosave) autosave.value = this.settings.autosave;
    if (autosaveInterval) {
      autosaveInterval.value = String(Math.round(this.settings.autosaveIntervalMs / 1000));
    }
    if (pdfEngine) pdfEngine.value = this.settings.pdfEngine;
    if (pandocPath) pandocPath.value = this.settings.pandocPath;
    if (chromiumPath) chromiumPath.value = this.settings.chromiumPath;
    if (spellcheck) spellcheck.checked = this.settings.spellcheck;
    if (spellcheckLanguage) spellcheckLanguage.value = this.settings.spellcheckLanguage;

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
              autosave: autosave?.value as Settings["autosave"],
              autosaveIntervalMs: autosaveInterval?.value
                ? Number(autosaveInterval.value) * 1000
                : this.settings.autosaveIntervalMs,
              pandocPath: pandocPath?.value ?? "",
              chromiumPath: chromiumPath?.value ?? "",
              pdfEngine: (pdfEngine?.value as Settings["pdfEngine"]) ?? "chromium",
              spellcheck: spellcheck?.checked ?? true,
              spellcheckLanguage: spellcheckLanguage?.value ?? "",
              keybindings: this.settings.keybindings,
            });
            this.settings = next;
            applySettings(next);
            this.editor.setTabSize(next.tabSize);
            this.editor.setSpellcheck(next.spellcheck, next.spellcheckLanguage);
            this.editor.setKeybindings(next.keybindings);
            this.editor.refresh();
            this.configureAutosave();
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

  private showFormatShortcuts(): void {
    const form = document.createElement("form");
    form.className = "settings-form";

    for (const entry of FORMAT_ACTIONS) {
      const label = document.createElement("label");
      label.className = "field";
      const name = document.createElement("span");
      name.textContent = entry.label;
      const input = document.createElement("input");
      input.type = "text";
      input.value = this.settings.keybindings[`format.${entry.action}`] ?? entry.shortcut;
      input.dataset.format = entry.action;
      input.maxLength = 40;
      label.append(name, input);
      form.append(label);
    }

    this.openModal({
      title: "Atajos de formato",
      message: "Usa el formato Ctrl+Alt+Tecla, Ctrl+Shift+Tecla o Alt+Shift+Tecla.",
      body: form,
      onEscape: () => this.closeModal(),
      actions: [
        {
          label: "Guardar",
          primary: true,
          onClick: () => {
            const inputs = Array.from(
              form.querySelectorAll<HTMLInputElement>("input[data-format]"),
            );
            const effective = inputs.map((input) => ({
              action: input.dataset.format as FormatAction,
              combo:
                input.value.trim() ||
                FORMAT_ACTIONS.find((entry) => entry.action === input.dataset.format)?.shortcut ||
                "",
            }));

            const seen = new Set<string>();
            for (const item of effective) {
              const key = item.combo.toLowerCase();
              if (seen.has(key)) {
                this.toast(`Atajo duplicado: ${item.combo}`);
                return;
              }
              seen.add(key);
            }

            const overrides: Record<string, string> = {};
            for (const item of effective) {
              const fallback = FORMAT_ACTIONS.find(
                (entry) => entry.action === item.action,
              )?.shortcut;
              if (item.combo && item.combo !== fallback) {
                overrides[`format.${item.action}`] = item.combo;
              }
            }

            const next = {
              ...this.settings,
              keybindings: normalizeKeybindings(overrides),
            };
            this.settings = next;
            this.editor.setKeybindings(next.keybindings);
            void host.settingsSave(next).catch((error: unknown) => {
              this.toast(`No se pudieron guardar los atajos: ${errorMessage(error)}`);
            });
            this.closeModal();
            this.toast("Atajos de formato actualizados.");
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
        const combo = this.shortcutLabel(item.action);
        if (!combo) {
          continue;
        }
        const row = document.createElement("div");
        row.className = "shortcut-row";
        const label = document.createElement("span");
        label.textContent = item.label;
        const keys = document.createElement("kbd");
        keys.textContent = combo;
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

  private async showUpdates(): Promise<void> {
    try {
      const info = await host.checkForUpdates();
      if (!info) {
        this.toast("Murk está actualizado.");
        return;
      }

      const body = document.createElement("div");
      const notes = document.createElement("pre");
      notes.className = "update-notes";
      notes.textContent = info.body?.trim() || "Sin notas de la versión.";
      body.append(notes);

      this.openModal({
        title: "Actualización disponible",
        message: `Versión ${info.currentVersion} → ${info.version}`,
        body,
        onEscape: () => this.closeModal(),
        actions: [
          {
            label: "Instalar",
            primary: true,
            onClick: () => {
              void (async () => {
                this.toast("Descargando actualización…");
                try {
                  await host.installUpdate();
                  this.closeModal();
                  this.toast("Actualización instalada. Reinicia Murk para aplicarla.");
                } catch (error) {
                  this.toast(errorMessage(error));
                }
              })();
            },
          },
          { label: "Cancelar", onClick: () => this.closeModal() },
        ],
      });
    } catch (error) {
      this.toast(errorMessage(error));
    }
  }

  private async showAbout(): Promise<void> {
    const version = await host.version();
    const body = document.createElement("div");
    body.className = "about";
    body.textContent = `Murk ${version}
Editor de Markdown con preview en vivo.

Creador y mantenedor: Rodrigo Quintanar
Contacto: djperseo@outlook.es
Licencia GPL-3.0-or-later.`;

    this.openModal({
      title: "Acerca de Murk",
      body,
      onEscape: () => this.closeModal(),
      actions: [{ label: "Cerrar", primary: true, onClick: () => this.closeModal() }],
    });
  }
}
