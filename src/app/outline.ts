// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

export interface OutlineItem {
  level: number;
  text: string;
  offset: number;
}

export function parseOutline(content: string): OutlineItem[] {
  const lines = content.split("\n");
  const items: OutlineItem[] = [];
  let offset = 0;
  let index = 0;
  let inFence = false;

  while (index < lines.length) {
    const line = lines[index];
    const start = offset;
    offset += line.length + 1;

    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      index += 1;
      continue;
    }
    if (inFence) {
      index += 1;
      continue;
    }

    const atx = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (atx) {
      const text = atx[2].replace(/\s+#+\s*$/, "").trim();
      if (text) {
        items.push({ level: atx[1].length, text, offset: start });
      }
      index += 1;
      continue;
    }

    const next = lines[index + 1];
    if (next && /^(=+|-+)\s*$/.test(next) && line.trim()) {
      items.push({
        level: next.trim().startsWith("=") ? 1 : 2,
        text: line.trim(),
        offset: start,
      });
      offset += next.length + 1;
      index += 2;
      continue;
    }

    index += 1;
  }

  return items;
}
