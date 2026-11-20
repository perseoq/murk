// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { syntaxTree } from "@codemirror/language";
import { EditorState, RangeSet, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import { refreshEffect } from "./effects";
import { CheckboxWidget } from "./widgets/checkbox";
import { ImageWidget, resolveImagePath } from "./widgets/image";
import { MathWidget } from "./widgets/math";

class ListMarkWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly ordered: boolean,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ListMarkWidget && other.text === this.text && other.ordered === this.ordered
    );
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = this.ordered ? "cm-md-list-number" : "cm-md-list-bullet";
    span.textContent = this.ordered ? this.text : "•";
    return span;
  }
}

class HorizontalRuleWidget extends WidgetType {
  eq(other: WidgetType): boolean {
    return other instanceof HorizontalRuleWidget;
  }

  toDOM(): HTMLElement {
    const rule = document.createElement("span");
    rule.className = "cm-md-hr";
    rule.setAttribute("role", "separator");
    return rule;
  }
}

interface LivePreviewResult {
  decorations: DecorationSet;
  atomic: RangeSet<Decoration>;
}

class LivePreviewPlugin {
  decorations: DecorationSet;
  atomic: RangeSet<Decoration>;

  constructor(view: EditorView) {
    const result = buildPreviewDecorations(view.state, view.viewport);
    this.decorations = result.decorations;
    this.atomic = result.atomic;
  }

  update(update: ViewUpdate): void {
    if (update.view.composing) {
      return;
    }

    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.startState.facet(EditorState.readOnly) !== update.state.facet(EditorState.readOnly) ||
      update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(refreshEffect)),
      )
    ) {
      const result = buildPreviewDecorations(update.view.state, update.view.viewport);
      this.decorations = result.decorations;
      this.atomic = result.atomic;
    }
  }
}

export const livePreview = ViewPlugin.fromClass(LivePreviewPlugin, {
  decorations: (plugin) => plugin.decorations,
});

export const livePreviewAtomicRanges = EditorView.atomicRanges.of(
  (view) => view.plugin(livePreview)?.atomic ?? RangeSet.empty,
);

function insideCode(state: EditorState, position: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1);
  while (node) {
    if (
      node.name === "FencedCode" ||
      node.name === "CodeBlock" ||
      node.name === "InlineCode" ||
      node.name === "URL"
    ) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

function insideBlockMath(state: EditorState, position: number): boolean {
  const line = state.doc.lineAt(position);
  let markers = 0;

  for (let number = 1; number <= line.number; number += 1) {
    const current = state.doc.line(number);
    if (current.text.trim() === "$$" && !insideCode(state, current.from)) {
      markers += 1;
    }
  }

  return markers % 2 === 1;
}

export function buildPreviewDecorations(
  state: EditorState,
  viewport: { from: number; to: number },
): LivePreviewResult {
  const doc = state.doc;
  const ranges: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];

  // En solo lectura nada debe revelar el Markdown fuente: se renderiza todo
  // aunque el cursor esté encima.
  const readOnly = state.facet(EditorState.readOnly);
  const touches = (from: number, to: number): boolean =>
    !readOnly && state.selection.ranges.some((range) => range.from <= to && range.to >= from);

  const hide = (from: number, to: number): void => {
    if (to <= from) {
      return;
    }
    ranges.push(Decoration.replace({}).range(from, to));
    atomicRanges.push(Decoration.replace({}).range(from, to));
  };

  const line = (from: number, className: string): void => {
    const start = doc.lineAt(Math.min(from, doc.length)).from;
    ranges.push(Decoration.line({ class: className }).range(start));
  };

  const from = Math.max(0, viewport.from - 4000);
  const to = Math.min(doc.length, Math.max(viewport.to + 4000, 6000));

  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      const name = node.name;

      if (name.startsWith("ATXHeading")) {
        const level = Number(name.slice(-1));
        line(node.from, `cm-md-h${level}`);

        if (!touches(node.from, node.to)) {
          const mark = node.node.getChild("HeaderMark");
          if (mark) {
            let end = mark.to;
            if (doc.sliceString(end, end + 1) === " ") {
              end += 1;
            }
            hide(mark.from, end);
          }
        }
        return;
      }

      if (name.startsWith("SetextHeading")) {
        const level = Number(name.slice(-1));
        const mark = node.node.getChild("HeaderMark");
        const contentEnd = mark ? mark.from : node.to;

        for (let position = node.from; position < contentEnd;) {
          const current = doc.lineAt(Math.min(position, doc.length));
          if (current.from >= from && current.from <= to) {
            ranges.push(Decoration.line({ class: `cm-md-h${level}` }).range(current.from));
          }
          if (current.to + 1 >= contentEnd) {
            break;
          }
          position = current.to + 1;
        }

        if (mark && !touches(node.from, node.to)) {
          const underline = doc.lineAt(mark.from);
          hide(underline.from, underline.to);
          ranges.push(Decoration.line({ class: "cm-md-collapsed-line" }).range(underline.from));
        }
        return;
      }

      if (name === "Emphasis" || name === "StrongEmphasis") {
        if (!touches(node.from, node.to)) {
          for (const mark of node.node.getChildren("EmphasisMark")) {
            hide(mark.from, mark.to);
          }
        }
        return;
      }

      if (name === "Strikethrough") {
        if (!touches(node.from, node.to)) {
          for (const mark of node.node.getChildren("StrikethroughMark")) {
            hide(mark.from, mark.to);
          }
        }
        return;
      }

      if (name === "InlineCode") {
        const marks = node.node.getChildren("CodeMark");
        if (marks.length >= 2) {
          const contentFrom = marks[0].to;
          const contentTo = marks[1].from;
          if (contentTo > contentFrom) {
            ranges.push(
              Decoration.mark({ class: "cm-md-inline-code" }).range(contentFrom, contentTo),
            );
          }
          if (!touches(node.from, node.to)) {
            hide(marks[0].from, marks[0].to);
            hide(marks[1].from, marks[1].to);
          }
        }
        return;
      }

      if (name === "Link" || name === "Autolink") {
        if (touches(node.from, node.to)) {
          return;
        }

        const marks = node.node.getChildren("LinkMark");
        const url = node.node.getChild("URL");
        const title = node.node.getChild("LinkTitle");

        for (const mark of marks) {
          hide(mark.from, mark.to);
        }
        if (url) {
          hide(url.from, url.to);
        }
        if (title) {
          hide(title.from, title.to);
        }

        let textFrom = node.from + 1;
        let textTo = node.to - 1;
        if (name === "Link" && marks.length >= 2) {
          textFrom = marks[0].to;
          textTo = marks[1].from;
        } else if (url) {
          textFrom = url.from;
          textTo = url.to;
        }

        if (textTo > textFrom) {
          ranges.push(
            Decoration.mark({
              class: "cm-md-link",
              attributes: url ? { title: doc.sliceString(url.from, url.to) } : {},
            }).range(textFrom, textTo),
          );
        }
        return;
      }

      if (name === "FencedCode") {
        const info = node.node.getChild("CodeInfo");
        const language = info
          ? doc.sliceString(info.from, info.to).trim().split(/\s+/)[0]?.toLowerCase()
          : "";
        if (language === "mermaid") {
          return;
        }

        const marks = node.node.getChildren("CodeMark");
        const codeText = node.node.getChild("CodeText");

        if (codeText) {
          for (let position = codeText.from; position <= codeText.to;) {
            const current = doc.lineAt(Math.min(position, doc.length));
            if (current.to >= from && current.from <= to) {
              ranges.push(Decoration.line({ class: "cm-md-code-line" }).range(current.from));
            }
            if (current.to + 1 > codeText.to) {
              break;
            }
            position = current.to + 1;
          }
        }

        if (!touches(node.from, node.to)) {
          const opening = doc.lineAt(node.from);
          hide(opening.from, opening.to);
          ranges.push(Decoration.line({ class: "cm-md-collapsed-line" }).range(opening.from));

          const closing = marks.length > 0 ? marks[marks.length - 1] : null;
          if (closing && closing.from > opening.to) {
            const closingLine = doc.lineAt(closing.from);
            hide(closingLine.from, closingLine.to);
            ranges.push(Decoration.line({ class: "cm-md-collapsed-line" }).range(closingLine.from));
          }
        }
        return;
      }

      if (name === "CodeBlock") {
        const codeText = node.node.getChild("CodeText");
        if (codeText) {
          for (let position = codeText.from; position <= codeText.to;) {
            const current = doc.lineAt(Math.min(position, doc.length));
            if (current.to >= from && current.from <= to) {
              ranges.push(Decoration.line({ class: "cm-md-code-line" }).range(current.from));
            }
            if (current.to + 1 > codeText.to) {
              break;
            }
            position = current.to + 1;
          }
        }
        return;
      }

      if (name === "Blockquote") {
        for (let position = node.from; position <= node.to;) {
          const current = doc.lineAt(Math.min(position, doc.length));
          if (current.to >= from && current.from <= to) {
            ranges.push(Decoration.line({ class: "cm-md-quote" }).range(current.from));
          }
          if (current.to + 1 > node.to) {
            break;
          }
          position = current.to + 1;
        }

        for (const mark of node.node.getChildren("QuoteMark")) {
          let end = mark.to;
          if (doc.sliceString(end, end + 1) === " ") {
            end += 1;
          }
          hide(mark.from, end);
        }
        return;
      }

      if (name === "Image") {
        if (touches(node.from, node.to)) {
          return;
        }

        const marks = node.node.getChildren("LinkMark");
        const url = node.node.getChild("URL");
        const title = node.node.getChild("LinkTitle");
        if (!url) {
          return;
        }

        const source = doc.sliceString(url.from, url.to);
        const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : "";
        const titleText = title
          ? doc.sliceString(title.from, title.to).replace(/^["']|["']$/g, "")
          : "";

        ranges.push(
          Decoration.replace({
            widget: new ImageWidget(source, alt, titleText, resolveImagePath(source)),
          }).range(node.from, node.to),
        );
        atomicRanges.push(Decoration.replace({}).range(node.from, node.to));
        return;
      }

      if (name === "TaskMarker") {
        const checked = /x/i.test(doc.sliceString(node.from, node.to));
        const readOnly = state.facet(EditorState.readOnly);

        ranges.push(
          Decoration.replace({
            widget: new CheckboxWidget(node.from, node.to, checked, readOnly),
          }).range(node.from, node.to),
        );
        atomicRanges.push(Decoration.replace({}).range(node.from, node.to));
        return;
      }

      if (name === "ListMark") {
        const marker = doc.sliceString(node.from, node.to);
        if (touches(node.from, node.to)) {
          return;
        }
        const parentName = node.node.parent?.parent?.name ?? "";
        const ordered = parentName === "OrderedList";
        ranges.push(
          Decoration.replace({
            widget: new ListMarkWidget(marker, ordered),
          }).range(node.from, node.to),
        );
        atomicRanges.push(Decoration.replace({}).range(node.from, node.to));
        return;
      }

      if (name === "HorizontalRule" && !touches(node.from, node.to)) {
        ranges.push(
          Decoration.replace({ widget: new HorizontalRuleWidget() }).range(node.from, node.to),
        );
        atomicRanges.push(Decoration.replace({}).range(node.from, node.to));
      }
    },
  });

  const visible = doc.sliceString(from, to);

  const blockMath = /\$\$([^$\n]+?)\$\$/g;
  let match: RegExpExecArray | null;
  while ((match = blockMath.exec(visible)) !== null) {
    const start = from + match.index;
    const end = start + match[0].length;
    if (touches(start, end) || insideCode(state, start) || insideBlockMath(state, start)) {
      continue;
    }
    ranges.push(Decoration.replace({ widget: new MathWidget(match[1], true) }).range(start, end));
    atomicRanges.push(Decoration.replace({}).range(start, end));
  }

  const inlineMath = /(?<!\\)\$(?!\$)([^$\n]+?)(?<![\s\\])\$(?!\$)/g;
  while ((match = inlineMath.exec(visible)) !== null) {
    const start = from + match.index;
    const end = start + match[0].length;
    if (touches(start, end) || insideCode(state, start) || insideBlockMath(state, start)) {
      continue;
    }
    ranges.push(Decoration.replace({ widget: new MathWidget(match[1], false) }).range(start, end));
    atomicRanges.push(Decoration.replace({}).range(start, end));
  }

  return {
    decorations: Decoration.set(ranges, true),
    atomic: RangeSet.of(atomicRanges, true),
  };
}
