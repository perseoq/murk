// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { syntaxTree } from "@codemirror/language";
import { EditorState, RangeSet, StateField, type Range } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import { MathWidget } from "./widgets/math";
import { MermaidWidget, isDarkTheme } from "./widgets/mermaid";
import { FrontmatterWidget } from "./widgets/frontmatter";
import { TableWidget } from "./widgets/table";
import { tableFromNode } from "./table";
import { findFrontmatter, tableWidthsFromFrontmatter } from "./frontmatter";

interface BlockWidgetResult {
  decorations: DecorationSet;
  atomic: RangeSet<Decoration>;
}

const CODE_NODE_NAMES = new Set(["FencedCode", "CodeBlock", "InlineCode"]);

function insideCode(state: EditorState, position: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1);
  while (node) {
    if (CODE_NODE_NAMES.has(node.name)) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

function isNestedBlock(state: EditorState, position: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1);
  while (node) {
    if (node.name === "Blockquote" || node.name === "ListItem") {
      return true;
    }
    node = node.parent;
  }
  return false;
}

export function buildBlockDecorations(state: EditorState): BlockWidgetResult {
  const doc = state.doc;
  const ranges: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];

  // En solo lectura las tablas, mermaid y las fórmulas se quedan siempre
  // renderizadas, aunque el cursor esté dentro.
  const readOnly = state.facet(EditorState.readOnly);
  const touches = (from: number, to: number): boolean =>
    !readOnly && state.selection.ranges.some((range) => range.from <= to && range.to >= from);

  const frontmatter = findFrontmatter(state);
  if (frontmatter && !touches(frontmatter.from, frontmatter.to)) {
    const key = `fm:${frontmatter.from}:${frontmatter.to}:${doc.sliceString(frontmatter.from, frontmatter.to)}`;
    ranges.push(
      Decoration.replace({
        block: true,
        widget: new FrontmatterWidget(frontmatter, key),
      }).range(frontmatter.from, frontmatter.to),
    );
    atomic.push(Decoration.replace({}).range(frontmatter.from, frontmatter.to));
  }

  const tableWidths = tableWidthsFromFrontmatter(frontmatter);
  let tableIndex = 0;

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "Table") {
        const index = tableIndex;
        tableIndex += 1;
        if (touches(node.from, node.to) || isNestedBlock(state, node.from)) {
          return;
        }

        const table = tableFromNode(state, node.node);
        if (!table) {
          return;
        }

        const key = `${node.from}:${node.to}:${readOnly ? "ro" : "rw"}:${doc.sliceString(node.from, node.to)}`;
        ranges.push(
          Decoration.replace({
            block: true,
            widget: new TableWidget(table, key, index, tableWidths[String(index)] ?? []),
          }).range(node.from, node.to),
        );
        atomic.push(Decoration.replace({}).range(node.from, node.to));
        return;
      }

      if (node.name !== "FencedCode") {
        return;
      }

      const info = node.node.getChild("CodeInfo");
      if (!info) {
        return;
      }
      const language = doc.sliceString(info.from, info.to).trim().split(/\s+/)[0]?.toLowerCase();
      if (language !== "mermaid") {
        return;
      }
      if (touches(node.from, node.to)) {
        return;
      }
      if (isNestedBlock(state, node.from)) {
        return;
      }

      const code = node.node.getChild("CodeText");
      const source = code ? doc.sliceString(code.from, code.to) : "";

      ranges.push(
        Decoration.replace({
          block: true,
          widget: new MermaidWidget(source, isDarkTheme()),
        }).range(node.from, node.to),
      );
      atomic.push(Decoration.replace({}).range(node.from, node.to));
    },
  });

  for (let index = 1; index <= doc.lines; index += 1) {
    const opening = doc.line(index);
    const openingMarker = opening.text.trim();
    const closingMarker = openingMarker === "$$" ? "$$" : openingMarker === "\\[" ? "\\]" : null;
    if (!closingMarker || insideCode(state, opening.from)) {
      continue;
    }
    if (isNestedBlock(state, opening.from)) {
      continue;
    }

    let closingIndex = 0;
    for (let next = index + 1; next <= doc.lines; next += 1) {
      if (doc.line(next).text.trim() === closingMarker) {
        closingIndex = next;
        break;
      }
    }
    if (!closingIndex) {
      continue;
    }

    const closing = doc.line(closingIndex);
    if (!touches(opening.from, closing.to)) {
      const content =
        closingIndex > index + 1
          ? doc.sliceString(doc.line(index + 1).from, doc.line(closingIndex - 1).to)
          : "";

      ranges.push(
        Decoration.replace({
          block: true,
          widget: new MathWidget(content, true),
        }).range(opening.from, closing.to),
      );
      ranges.push(Decoration.line({ class: "cm-md-math-line" }).range(opening.from));
      atomic.push(Decoration.replace({}).range(opening.from, closing.to));
    }

    index = closingIndex;
  }

  return {
    decorations: Decoration.set(ranges, true),
    atomic: RangeSet.of(atomic, true),
  };
}

export const blockWidgetsField = StateField.define<BlockWidgetResult>({
  create(state) {
    return buildBlockDecorations(state);
  },
  update(value, transaction) {
    if (
      transaction.docChanged ||
      transaction.selection ||
      transaction.startState.facet(EditorState.readOnly) !==
        transaction.state.facet(EditorState.readOnly) ||
      transaction.effects.length > 0
    ) {
      return buildBlockDecorations(transaction.state);
    }
    return value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
  ],
});
