// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  selectAll,
  undo,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import {
  findNext,
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from "@codemirror/search";
import { Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  placeholder,
  rectangularSelection,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import "katex/dist/katex.min.css";

import { blockWidgetsField } from "./block-widgets";
import { refreshEffect } from "./effects";
import { livePreview, livePreviewAtomicRanges } from "./live-preview";
import {
  handleTablePaste,
  insertTable as insertTableCommand,
  runTableAction,
  tableKeymap,
  type TableAction,
} from "./table";

const markdownHighlight = HighlightStyle.define([
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--murk-accent)" },
  { tag: tags.monospace, fontFamily: "var(--murk-mono)", color: "var(--murk-accent)" },
  { tag: tags.quote, color: "var(--murk-muted)", fontStyle: "italic" },
  { tag: tags.list, color: "var(--murk-accent)" },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: "var(--murk-muted)" },
  { tag: tags.escape, color: "var(--murk-muted)" },
]);

const murkTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "var(--murk-surface)",
      color: "var(--murk-fg)",
      fontSize: "var(--editor-font-size)",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--editor-font-family)",
      lineHeight: "1.7",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "32px max(28px, calc((100vw - 920px) / 2))",
      caretColor: "var(--murk-fg)",
    },
    ".cm-line": { padding: "0" },
    ".cm-cursor": { borderLeftColor: "var(--murk-fg)" },
    ".cm-selectionBackground, ::selection": { backgroundColor: "var(--murk-selection) !important" },
    ".cm-activeLine": { backgroundColor: "transparent" },
    ".cm-placeholder": { color: "var(--murk-muted)" },
    ".cm-panels": {
      backgroundColor: "var(--murk-surface)",
      color: "var(--murk-fg)",
      borderColor: "var(--murk-border)",
    },
    ".cm-panel.cm-search": {
      padding: "8px 12px",
      fontFamily: "var(--murk-font)",
      fontSize: "12px",
    },
    ".cm-panel.cm-search input, .cm-panel.cm-search button": {
      fontFamily: "var(--murk-font)",
      fontSize: "12px",
    },
    ".cm-textfield": {
      border: "1px solid var(--murk-border)",
      borderRadius: "6px",
      backgroundColor: "var(--murk-bg)",
      color: "var(--murk-fg)",
      padding: "4px 7px",
    },
    ".cm-button": {
      border: "1px solid var(--murk-border)",
      borderRadius: "6px",
      backgroundImage: "none",
      backgroundColor: "var(--murk-bg)",
      color: "var(--murk-fg)",
      padding: "3px 9px",
    },
    ".cm-searchMatch": {
      backgroundColor: "var(--murk-accent-soft)",
      outline: "1px solid var(--murk-accent)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "var(--murk-selection)",
    },
  },
  { dark: false },
);

export interface MurkEditorCallbacks {
  onChange: (content: string) => void;
  onCursor: (cursor: number) => void;
}

export interface EditorCapture {
  content: string;
  cursor: number;
  scroll: number;
}

export class MurkEditor {
  readonly view: EditorView;

  private readonly callbacks: MurkEditorCallbacks;
  private readonly states = new Map<string, EditorState>();
  private readonly tabSizeCompartment = new Compartment();
  private readonly indentCompartment = new Compartment();
  private readonly readOnlyCompartment = new Compartment();
  private readonly spellcheckCompartment = new Compartment();
  private readonly baseExtensions: Extension[];
  private currentTabId: string | null = null;
  private tabSize: number;
  private readOnly = false;
  private spellcheckEnabled = true;
  private spellcheckLanguage = "";

  constructor(parent: HTMLElement, options: { tabSize: number } & MurkEditorCallbacks) {
    this.callbacks = { onChange: options.onChange, onCursor: options.onCursor };
    this.tabSize = options.tabSize;

    this.baseExtensions = [
      history(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      highlightSpecialChars(),
      highlightActiveLine(),
      bracketMatching(),
      indentOnInput(),
      EditorView.lineWrapping,
      search({ top: true }),
      highlightSelectionMatches(),
      Prec.high(keymap.of([{ key: "Mod-Shift-t", run: insertTableCommand }, ...tableKeymap])),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        { key: "Mod-h", run: openSearchPanel },
        indentWithTab,
      ]),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      syntaxHighlighting(markdownHighlight),
      livePreview,
      livePreviewAtomicRanges,
      blockWidgetsField,
      placeholder("Empieza a escribir en Markdown…"),
      EditorView.contentAttributes.of({
        "aria-label": "Editor de Markdown",
        autocorrect: "off",
        autocapitalize: "off",
      }),
      this.spellcheckCompartment.of(this.spellcheckAttributes()),
      EditorView.domEventHandlers({
        paste: (event, view) => handleTablePaste(event, view),
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          this.callbacks.onChange(update.state.doc.toString());
        }
        if (update.docChanged || update.selectionSet) {
          this.callbacks.onCursor(update.state.selection.main.head);
        }
      }),
      this.tabSizeCompartment.of(EditorState.tabSize.of(this.tabSize)),
      this.indentCompartment.of(indentUnit.of(" ".repeat(this.tabSize))),
      this.readOnlyCompartment.of([EditorState.readOnly.of(false), EditorView.editable.of(true)]),
      murkTheme,
    ];

    const state = EditorState.create({ doc: "", extensions: this.baseExtensions });
    this.view = new EditorView({ state, parent });
  }

  private createState(content: string, cursor: number): EditorState {
    return EditorState.create({
      doc: content,
      selection: { anchor: Math.min(Math.max(cursor, 0), content.length) },
      extensions: this.baseExtensions,
    });
  }

  activate(tabId: string, content: string, cursor: number, readOnly: boolean): void {
    if (this.currentTabId && this.currentTabId !== tabId) {
      this.states.set(this.currentTabId, this.view.state);
    }

    let state = this.states.get(tabId);
    if (!state) {
      state = this.createState(content, cursor);
      this.states.set(tabId, state);
    }

    this.view.setState(state);
    this.currentTabId = tabId;
    this.applyCompartments(readOnly);
  }

  private applyCompartments(readOnly: boolean): void {
    this.readOnly = readOnly;
    this.view.dispatch({
      effects: [
        this.tabSizeCompartment.reconfigure(EditorState.tabSize.of(this.tabSize)),
        this.indentCompartment.reconfigure(indentUnit.of(" ".repeat(this.tabSize))),
        this.readOnlyCompartment.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        this.spellcheckCompartment.reconfigure(this.spellcheckAttributes()),
      ],
    });
  }

  private spellcheckAttributes(): Extension {
    const attributes: Record<string, string> = {
      spellcheck: this.spellcheckEnabled ? "true" : "false",
    };
    if (this.spellcheckLanguage) {
      attributes.lang = this.spellcheckLanguage;
    }
    return EditorView.contentAttributes.of(attributes);
  }

  capture(): EditorCapture {
    const state = this.view.state;
    if (this.currentTabId) {
      this.states.set(this.currentTabId, state);
    }

    const scroller = this.view.scrollDOM;
    const maximum = Math.max(1, scroller.scrollHeight - scroller.clientHeight);

    return {
      content: state.doc.toString(),
      cursor: state.selection.main.head,
      scroll: maximum > 1 ? scroller.scrollTop / maximum : 0,
    };
  }

  getContent(): string {
    return this.view.state.doc.toString();
  }

  getCursor(): number {
    return this.view.state.selection.main.head;
  }

  setContent(content: string, cursor = 0): void {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: content },
      selection: { anchor: Math.min(Math.max(cursor, 0), content.length) },
      scrollIntoView: true,
    });
  }

  setReadOnly(readOnly: boolean): void {
    this.applyCompartments(readOnly);
  }

  setTabSize(tabSize: number): void {
    this.tabSize = tabSize;
    this.applyCompartments(this.readOnly);
  }

  setSpellcheck(enabled: boolean, language = ""): void {
    this.spellcheckEnabled = enabled;
    this.spellcheckLanguage = language;
    this.view.dispatch({
      effects: this.spellcheckCompartment.reconfigure(this.spellcheckAttributes()),
    });
  }

  scrollToRatio(ratio: number): void {
    requestAnimationFrame(() => {
      const scroller = this.view.scrollDOM;
      const maximum = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = Math.round(Math.min(Math.max(ratio, 0), 1) * maximum);
    });
  }

  invalidate(tabId: string): void {
    this.states.delete(tabId);
  }

  forget(tabId: string): void {
    this.states.delete(tabId);
    if (this.currentTabId === tabId) {
      this.currentTabId = null;
    }
  }

  focus(): void {
    this.view.focus();
  }

  revealOffset(offset: number): void {
    const position = Math.max(0, Math.min(offset, this.view.state.doc.length));
    this.view.dispatch({
      selection: { anchor: position },
      scrollIntoView: true,
    });
    this.view.focus();
  }

  revealLine(line: number, column: number): void {
    const doc = this.view.state.doc;
    const target = doc.line(Math.min(Math.max(line, 1), doc.lines));
    const position = Math.min(target.from + Math.max(column, 0), target.to);
    this.view.dispatch({
      selection: { anchor: position },
      scrollIntoView: true,
    });
    this.view.focus();
  }

  refresh(): void {
    this.view.dispatch({ effects: refreshEffect.of(null) });
  }

  insertTable(): boolean {
    return insertTableCommand(this.view);
  }

  tableAction(action: TableAction): boolean {
    return runTableAction(this.view, action);
  }

  undo(): boolean {
    return undo(this.view);
  }

  redo(): boolean {
    return redo(this.view);
  }

  selectAll(): boolean {
    return selectAll(this.view);
  }

  find(): boolean {
    return openSearchPanel(this.view);
  }

  findNext(): boolean {
    return findNext(this.view);
  }

  replace(): boolean {
    return openSearchPanel(this.view);
  }

  destroy(): void {
    this.states.clear();
    this.view.destroy();
  }
}

export function createEditorState(content: string): EditorState {
  return EditorState.create({
    doc: content,
    extensions: [history(), markdown({ base: markdownLanguage })],
  });
}
