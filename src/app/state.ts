// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import type { OpenedFile, SavedFile, Session } from "../host";

export interface Tab {
  id: string;
  path: string | null;
  name: string;
  content: string;
  dirty: boolean;
  cursor: number;
  scroll: number;
  readOnly: boolean;
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

export function displayPath(path: string | null): string {
  if (!path) {
    return "Sin título";
  }
  const parts = path.split("/");
  const name = parts[parts.length - 1] ?? path;
  const directory = parts.slice(0, -1).join("/");
  return directory ? `${directory}/${name}` : name;
}

export class Workspace {
  tabs: Tab[] = [];
  activeId: string | null = null;

  private sequence = 0;
  private untitled = 0;

  private nextId(): string {
    this.sequence += 1;
    return `tab-${this.sequence}`;
  }

  private nextUntitledName(): string {
    this.untitled += 1;
    return this.untitled === 1 ? "Sin título" : `Sin título-${this.untitled}`;
  }

  get active(): Tab | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null;
  }

  createUntitled(): Tab {
    const tab: Tab = {
      id: this.nextId(),
      path: null,
      name: this.nextUntitledName(),
      content: "",
      dirty: false,
      cursor: 0,
      scroll: 0,
      readOnly: false,
    };
    this.tabs.push(tab);
    this.activeId = tab.id;
    return tab;
  }

  openDocument(file: OpenedFile): Tab {
    const existing = this.tabs.find((tab) => tab.path === file.path);
    if (existing) {
      this.activeId = existing.id;
      return existing;
    }

    const current = this.active;
    const reusable =
      current !== null && current.path === null && !current.dirty && current.content.length === 0;

    const tab: Tab = reusable
      ? (current as Tab)
      : {
          id: this.nextId(),
          path: null,
          name: file.name,
          content: "",
          dirty: false,
          cursor: 0,
          scroll: 0,
          readOnly: false,
        };

    tab.path = file.path;
    tab.name = file.name;
    tab.content = file.content;
    tab.dirty = false;
    tab.readOnly = file.readOnly;
    tab.cursor = 0;
    tab.scroll = 0;

    if (!reusable) {
      this.tabs.push(tab);
    }
    this.activeId = tab.id;
    return tab;
  }

  setActive(id: string): void {
    if (this.tabs.some((tab) => tab.id === id)) {
      this.activeId = id;
    }
  }

  setActiveIndex(index: number): void {
    const tab = this.tabs[index];
    if (tab) {
      this.activeId = tab.id;
    }
  }

  updateContent(id: string, content: string): void {
    const tab = this.tabs.find((item) => item.id === id);
    if (!tab) {
      return;
    }
    if (tab.content !== content) {
      tab.content = content;
      tab.dirty = true;
    }
  }

  markSaved(id: string, saved: SavedFile): void {
    const tab = this.tabs.find((item) => item.id === id);
    if (!tab) {
      return;
    }
    tab.path = saved.path;
    tab.name = saved.name;
    tab.dirty = false;
    tab.readOnly = false;
  }

  closeTab(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index === -1) {
      return;
    }

    this.tabs.splice(index, 1);
    if (this.activeId !== id) {
      return;
    }

    if (this.tabs.length === 0) {
      this.activeId = null;
      return;
    }

    const next = this.tabs[Math.min(index, this.tabs.length - 1)];
    this.activeId = next.id;
  }

  hasDirty(): boolean {
    return this.tabs.some((tab) => tab.dirty);
  }

  serialize(geometry: { width: number; height: number; maximized: boolean }): Session {
    const openFiles = this.tabs
      .filter((tab) => tab.path !== null)
      .map((tab) => ({
        path: tab.path as string,
        cursor: tab.cursor,
        scroll: tab.scroll,
      }));

    const active = this.active;
    const activeIndex = active?.path
      ? Math.max(
          0,
          openFiles.findIndex((file) => file.path === active.path),
        )
      : 0;

    return {
      version: 1,
      openFiles,
      activeIndex,
      windowWidth: geometry.width,
      windowHeight: geometry.height,
      maximized: geometry.maximized,
    };
  }
}
