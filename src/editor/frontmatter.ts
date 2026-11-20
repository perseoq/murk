// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface FrontmatterBlock {
  from: number;
  to: number;
  data: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Localiza un bloque YAML delimitado por `---` al inicio del documento. */
export function findFrontmatter(state: EditorState): FrontmatterBlock | null {
  const doc = state.doc;
  if (doc.lines < 2 || doc.line(1).text.trim() !== "---") {
    return null;
  }

  for (let number = 2; number <= doc.lines; number += 1) {
    if (doc.line(number).text.trim() !== "---") {
      continue;
    }
    const text = doc.sliceString(doc.line(1).to, doc.line(number).from);
    let data: unknown;
    try {
      data = parseYaml(text) ?? {};
    } catch {
      return null;
    }
    if (!isRecord(data)) {
      return null;
    }
    return { from: doc.line(1).from, to: doc.line(number).to, data };
  }

  return null;
}

/** Devuelve las anchuras guardadas en `murk.tableWidths` (clave = índice). */
export function tableWidthsFromFrontmatter(
  block: FrontmatterBlock | null,
): Record<string, number[]> {
  if (!block || !isRecord(block.data.murk) || !isRecord(block.data.murk.tableWidths)) {
    return {};
  }

  const widths: Record<string, number[]> = {};
  for (const [key, value] of Object.entries(block.data.murk.tableWidths)) {
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry >= 24)
    ) {
      widths[key] = value.map((entry) => Math.round(entry as number));
    }
  }
  return widths;
}

export function tableWidthsFromState(state: EditorState): Record<string, number[]> {
  return tableWidthsFromFrontmatter(findFrontmatter(state));
}

/** Devuelve el objeto `murk` del frontmatter (o vacío). */
export function murkFromFrontmatter(block: FrontmatterBlock | null): Record<string, unknown> {
  return block && isRecord(block.data.murk) ? block.data.murk : {};
}

/** Devuelve el objeto `murk` del documento actual. */
export function murkFromState(state: EditorState): Record<string, unknown> {
  return murkFromFrontmatter(findFrontmatter(state));
}

/** Reescribe el bloque YAML con los datos indicados. */
function writeFrontmatter(
  view: EditorView,
  block: FrontmatterBlock | null,
  data: Record<string, unknown>,
): void {
  const state = view.state;
  const text = stringifyYaml(data, { lineWidth: 0 }).trimEnd();
  const blockText = `---\n${text}\n---`;
  const changes = block
    ? { changes: { from: block.from, to: block.to, insert: blockText } }
    : {
        changes: {
          from: 0,
          insert: state.doc.length > 0 ? `${blockText}\n\n` : `${blockText}\n`,
        },
      };

  view.dispatch(changes);
}

/**
 * Modifica `murk` en el frontmatter conservando el resto de claves. Si la
 * función deja `murk` sin propiedades, se mantiene el bloque por sencillez.
 */
export function updateMurk(
  view: EditorView,
  mutate: (murk: Record<string, unknown>) => void,
): void {
  const block = findFrontmatter(view.state);
  const data: Record<string, unknown> = block ? { ...block.data } : {};
  const murk = { ...murkFromFrontmatter(block) };
  mutate(murk);
  data.murk = murk;
  writeFrontmatter(view, block, data);
}

export function frontmatterSummary(block: FrontmatterBlock): string {
  const keys = Object.keys(block.data).length;
  return keys === 1 ? "1 campo" : `${keys} campos`;
}

/**
 * Guarda las anchuras de una tabla en el frontmatter, creándolo si no existe.
 * El resto de claves YAML se conserva.
 */
export function setTableWidths(view: EditorView, index: number, widths: number[]): void {
  updateMurk(view, (murk) => {
    const tableWidths = isRecord(murk.tableWidths) ? { ...murk.tableWidths } : {};
    tableWidths[String(index)] = widths.map((width) => Math.max(24, Math.round(width)));
    murk.tableWidths = tableWidths;
  });
}
