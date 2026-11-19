// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { host } from "../host";
import type { Settings, Session } from "../host";
import { MENUS, type ActionId, type MenuDef } from "./menus";
import { DEFAULT_SETTINGS, applySettings, normalizeSettings } from "./settings";
import { Workspace, countWords, displayPath } from "./state";

type CloseChoice = "save" | "discard" | "cancel";

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

function suggestedFileName(name: string): string {
  return name.toLowerCase() === "sin título" ? "sin-titulo.md" : `${name}.md`;
}

export class Shell {
  private readonly root: HTMLElement;
  private readonly workspace = new Workspace();
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private restoredSession: Session | null = null;

  private editor!: HTMLTextAreaElement;
  private tabsElement!: HTMLElement;
  private statusFile!: HTMLElement;
  private statusCount!: HTMLElement;
  private statusEol!: HTMLElement;
  private saveState!: HTMLElement;
  private menuLayer!: HTMLElement;
  private modalLayer!: HTMLElement;
  private toastLayer!: HTMLElement;

  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalHandle: number | null = null;
  private allowClose = false;
  private openMenuId: string | null = null;
  private lastTitle = "";

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async boot(): Promise<void> {
    await this.loadState();
    this.mount();
    await this.restoreSession();
    this.bindShellEvents();
    this.bindWindowClose();
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
        <main class="editor-area">
          <textarea id="editor" class="editor" spellcheck="false" autocomplete="off" aria-label="Editor de Markdown"></textarea>
        </main>
        <footer class="statusbar">
          <span id="status-file" class="status-file">Sin título</span>
          <span class="status-spacer"></span>
          <span id="status-count">0 palabras</span>
          <span class="status-tag">UTF-8</span>
          <span id="status-eol" class="status-tag">LF</span>
          <span class="status-tag">Texto</span>
        </footer>
        <div id="menu-layer" class="menu-layer"></div>
        <div id="modal-layer" class="modal-layer"></div>
        <div id="toast-layer" class="toast-layer" aria-live="polite"></div>
      </div>
    `;

    this.editor = this.query<HTMLTextAreaElement>("#editor");
    this.tabsElement = this.query<HTMLElement>(".tabs");
    this.statusFile = this.query<HTMLElement>("#status-file");
    this.statusCount = this.query<HTMLElement>("#status-count");
    this.statusEol = this.query<HTMLElement>("#status-eol");
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
      case "view.settings":
        this.showSettings();
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

    this.editor.addEventListener("input", () => {
      this.handleEditorInput();
    });

    this.editor.addEventListener("scroll", () => {
      const tab = this.workspace.active;
      if (tab) {
        this.captureCursor();
      }
    });

    this.editor.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        const spaces = " ".repeat(this.settings.tabSize);
        this.editor.setRangeText(
          spaces,
          this.editor.selectionStart,
          this.editor.selectionEnd,
          "end",
        );
        this.handleEditorInput();
      }
    });

    document.addEventListener("click", () => {
      this.closeMenus();
    });

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

      switch (event.key.toLowerCase()) {
        case "n":
          event.preventDefault();
          this.newTab();
          break;
        case "o":
          event.preventDefault();
          void this.openFile();
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
      this.afterMutation();
      this.editor.focus();
      return true;
    } catch (error) {
      this.toast(errorMessage(error));
      return false;
    }
  }

  private async saveActive(saveAs: boolean): Promise<boolean> {
    const tab = this.workspace.active;
    if (!tab) {
      return false;
    }

    this.captureCursor();
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

    this.saveState.textContent = "Guardando…";

    try {
      const saved = await host.fileSave(path, tab.content);
      this.workspace.markSaved(tab.id, saved);
      this.renderTabs();
      this.updateStatus();
      this.updateTitle();
      this.saveState.textContent = "Guardado";
      this.scheduleSession();
      return true;
    } catch (error) {
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

  private handleEditorInput(): void {
    const tab = this.workspace.active;
    if (!tab) {
      return;
    }

    this.workspace.updateContent(tab.id, this.editor.value);
    tab.cursor = this.editor.selectionStart;
    this.renderTabs();
    this.updateStatus();
    this.updateTitle();
    this.scheduleSession();
  }

  private editCommand(command: "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll"): void {
    this.editor.focus();

    if (command === "selectAll") {
      this.editor.select();
      return;
    }

    try {
      const applied = document.execCommand(command);
      if (!applied && command === "paste") {
        this.toast("Usa Ctrl+V para pegar.");
      }
    } catch {
      this.toast("El comando no está disponible.");
    }

    this.handleEditorInput();
    this.editor.focus();
  }

  private async setTheme(theme: Settings["theme"]): Promise<void> {
    this.settings = { ...this.settings, theme };
    applySettings(this.settings);
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
      this.editor.value = "";
      this.editor.readOnly = true;
      return;
    }

    this.editor.value = tab.content;
    this.editor.readOnly = tab.readOnly;

    const cursor = Math.min(tab.cursor, tab.content.length);
    this.editor.setSelectionRange(cursor, cursor);

    requestAnimationFrame(() => {
      const max = Math.max(1, this.editor.scrollHeight - this.editor.clientHeight);
      this.editor.scrollTop = Math.round(tab.scroll * max);
    });
  }

  private captureCursor(): void {
    const tab = this.workspace.active;
    if (!tab || !this.editor) {
      return;
    }

    tab.cursor = this.editor.selectionStart;
    const max = Math.max(1, this.editor.scrollHeight - this.editor.clientHeight);
    tab.scroll = this.editor.scrollTop / max;
  }

  private updateStatus(): void {
    const tab = this.workspace.active;
    const content = tab?.content ?? "";

    this.statusFile.textContent = tab ? displayPath(tab.path) : "Sin documento";
    this.statusFile.title = tab?.path ?? "";
    this.statusCount.textContent = `${countWords(content)} palabras · ${content.length} caracteres`;
    this.statusEol.textContent = content.includes("\r\n") ? "CRLF" : "LF";

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
      await host.sessionSave(this.workspace.serialize(geometry));
    } catch {
      // La sesión es best-effort; nunca bloquea la edición.
    }
  }

  private afterMutation(): void {
    this.renderAll();
    this.scheduleSession();
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
