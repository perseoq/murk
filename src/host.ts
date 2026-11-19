// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { PhysicalSize, getCurrentWindow, type CloseRequestedEvent } from "@tauri-apps/api/window";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

export type ThemeMode = "light" | "dark" | "system";
export type Eol = "lf" | "crlf" | "cr";
export type FileChangeKind = "created" | "modified" | "removed";

export interface OpenedFile {
  path: string;
  name: string;
  content: string;
  size: number;
  modifiedMs: number;
  readOnly: boolean;
  encoding: string;
  eol: Eol;
  bom: boolean;
  fingerprint: string;
}

export interface SavedFile {
  path: string;
  name: string;
  size: number;
  modifiedMs: number;
  encoding: string;
  eol: Eol;
  bom: boolean;
  fingerprint: string;
}

export interface SaveOptions {
  encoding: string;
  bom: boolean;
  eol: Eol;
  convertEol: boolean;
  expectedFingerprint: string | null;
}

export interface RecentEntry {
  path: string;
  name: string;
  modifiedMs: number;
  exists: boolean;
}

export interface FileChangedEvent {
  path: string;
  kind: FileChangeKind;
  modifiedMs: number;
  size: number;
}

export interface ImageData {
  mime: string;
  dataUrl: string;
}

export interface Settings {
  theme: ThemeMode;
  fontFamily: string;
  fontSize: number;
  tabSize: number;
}

export interface SessionFile {
  path: string;
  cursor: number;
  scroll: number;
}

export interface Session {
  version: number;
  openFiles: SessionFile[];
  activeIndex: number;
  windowWidth: number;
  windowHeight: number;
  maximized: boolean;
}

export interface WindowGeometry {
  width: number;
  height: number;
  maximized: boolean;
}

export class HostError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HostError";
    this.code = code;
  }
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function requireDesktop(): void {
  if (!isDesktop()) {
    throw new HostError(
      "desktop_only",
      "Esta acción requiere la aplicación de escritorio (npm run tauri dev).",
    );
  }
}

function normalizeError(error: unknown): HostError {
  if (error instanceof HostError) {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : "unknown";
    return new HostError(code, String(error.message));
  }

  return new HostError("unknown", String(error));
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  requireDesktop();
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw normalizeError(error);
  }
}

const FILE_FILTERS = [
  {
    name: "Markdown",
    extensions: ["md", "markdown", "mdown", "mkd", "mdwn", "txt"],
  },
  {
    name: "Todos los archivos",
    extensions: ["*"],
  },
];

export const host = {
  isDesktop,

  async openFileDialog(): Promise<string | null> {
    requireDesktop();
    const result = await openDialog({
      title: "Abrir documento",
      multiple: false,
      directory: false,
      filters: FILE_FILTERS,
    });
    return typeof result === "string" ? result : null;
  },

  async saveFileDialog(defaultPath?: string | null): Promise<string | null> {
    requireDesktop();
    const result = await saveDialog({
      title: "Guardar documento",
      defaultPath: defaultPath ?? undefined,
      filters: FILE_FILTERS,
    });
    return result ?? null;
  },

  fileOpen(path: string): Promise<OpenedFile> {
    return call<OpenedFile>("file_open", { path });
  },

  fileSave(path: string, content: string, options: SaveOptions): Promise<SavedFile> {
    return call<SavedFile>("file_save", { path, content, options });
  },

  imageLoad(path: string): Promise<ImageData> {
    return call<ImageData>("image_load", { path });
  },

  async watchFile(path: string): Promise<void> {
    await call<void>("watch_file", { path });
  },

  async unwatchFile(path: string): Promise<void> {
    if (!isDesktop()) {
      return;
    }
    await call<void>("unwatch_file", { path });
  },

  async listenFileChanged(handler: (event: FileChangedEvent) => void): Promise<UnlistenFn> {
    if (!isDesktop()) {
      return () => undefined;
    }
    return listen<FileChangedEvent>("file:changed", (event) => handler(event.payload));
  },

  async recentList(): Promise<RecentEntry[]> {
    if (!isDesktop()) {
      return [];
    }
    return call<RecentEntry[]>("recent_list");
  },

  async recentAdd(path: string): Promise<RecentEntry[]> {
    if (!isDesktop()) {
      return [];
    }
    return call<RecentEntry[]>("recent_add", { path });
  },

  async recentClear(): Promise<void> {
    if (!isDesktop()) {
      return;
    }
    await call<void>("recent_clear");
  },

  async settingsLoad(): Promise<Settings | null> {
    if (!isDesktop()) {
      return null;
    }
    return call<Settings | null>("settings_load");
  },

  async settingsSave(settings: Settings): Promise<void> {
    await call<void>("settings_save", { settings });
  },

  async sessionLoad(): Promise<Session | null> {
    if (!isDesktop()) {
      return null;
    }
    return call<Session | null>("session_load");
  },

  async sessionSave(session: Session): Promise<void> {
    if (!isDesktop()) {
      return;
    }
    await call<void>("session_save", { session });
  },

  async version(): Promise<string> {
    if (!isDesktop()) {
      return "0.0.0";
    }
    try {
      return await getVersion();
    } catch {
      return "0.0.0";
    }
  },

  window: {
    async geometry(): Promise<WindowGeometry> {
      requireDesktop();
      const window = getCurrentWindow();
      const [size, maximized] = await Promise.all([window.innerSize(), window.isMaximized()]);
      return { width: size.width, height: size.height, maximized };
    },

    async restore(session: Session): Promise<void> {
      requireDesktop();
      const window = getCurrentWindow();
      if (session.windowWidth > 0 && session.windowHeight > 0) {
        await window.setSize(new PhysicalSize(session.windowWidth, session.windowHeight));
      }
      if (session.maximized) {
        await window.maximize();
      }
    },

    async setTitle(title: string): Promise<void> {
      if (!isDesktop()) {
        return;
      }
      await getCurrentWindow().setTitle(title);
    },

    async close(): Promise<void> {
      requireDesktop();
      await getCurrentWindow().close();
    },

    async onCloseRequested(
      handler: (event: CloseRequestedEvent) => void | Promise<void>,
    ): Promise<() => void> {
      if (!isDesktop()) {
        return () => undefined;
      }
      return getCurrentWindow().onCloseRequested(handler);
    },
  },
};
