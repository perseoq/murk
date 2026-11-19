// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { WidgetType } from "@codemirror/view";

let documentPath: string | null = null;
const cache = new Map<string, Promise<string>>();

export function setImageDocumentPath(path: string | null): void {
  documentPath = path;
}

export function clearImageCache(): void {
  cache.clear();
}

function normalizePath(path: string): string {
  const absolute = path.startsWith("/");
  const segments: string[] = [];

  for (const segment of path.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return `${absolute ? "/" : ""}${segments.join("/")}`;
}

export function resolveImagePath(source: string): string | null {
  if (!source || /^(?:data:|https?:|murk-img:)/i.test(source)) {
    return null;
  }

  let path = source;
  if (path.startsWith("file://")) {
    path = path.slice("file://".length);
  }

  try {
    path = decodeURIComponent(path);
  } catch {
    // Se usa la ruta tal cual si el porcentaje está mal formado.
  }

  if (path.startsWith("/")) {
    return normalizePath(path);
  }

  if (!documentPath) {
    return null;
  }

  const separator = documentPath.lastIndexOf("/");
  const base = separator >= 0 ? documentPath.slice(0, separator) : "";
  return normalizePath(`${base}/${path}`);
}

async function loadImage(path: string): Promise<string> {
  const cached = cache.get(path);
  if (cached) {
    return cached;
  }

  const request = (async () => {
    const { host } = await import("../../host");
    const data = await host.imageLoad(path);
    return data.dataUrl;
  })();

  cache.set(path, request);

  try {
    return await request;
  } catch (error) {
    cache.delete(path);
    throw error;
  }
}

export class ImageWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly alt: string,
    readonly title: string,
    readonly localPath: string | null,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ImageWidget &&
      other.source === this.source &&
      other.alt === this.alt &&
      other.title === this.title &&
      other.localPath === this.localPath
    );
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-md-image";
    if (this.title) {
      wrapper.title = this.title;
    }

    if (/^data:/i.test(this.source)) {
      const image = document.createElement("img");
      image.src = this.source;
      image.alt = this.alt;
      wrapper.append(image);
      return wrapper;
    }

    if (/^https?:/i.test(this.source)) {
      wrapper.classList.add("cm-md-image-missing");
      wrapper.textContent = this.alt ? `${this.alt} (imagen remota)` : "Imagen remota";
      wrapper.title = this.source;
      return wrapper;
    }

    if (!this.localPath) {
      wrapper.classList.add("cm-md-image-missing");
      wrapper.textContent = this.alt || this.source || "Imagen";
      return wrapper;
    }

    const loading = document.createElement("span");
    loading.className = "cm-md-image-loading";
    loading.textContent = this.alt ? `Cargando ${this.alt}…` : "Cargando imagen…";
    wrapper.append(loading);

    void loadImage(this.localPath)
      .then((dataUrl) => {
        if (!wrapper.isConnected) {
          return;
        }
        const image = document.createElement("img");
        image.src = dataUrl;
        image.alt = this.alt;
        image.loading = "lazy";
        wrapper.replaceChildren(image);
      })
      .catch(() => {
        if (!wrapper.isConnected) {
          return;
        }
        wrapper.replaceChildren();
        wrapper.classList.add("cm-md-image-missing");
        wrapper.textContent = this.alt ? `${this.alt} (no encontrada)` : "Imagen no encontrada";
      });

    return wrapper;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
