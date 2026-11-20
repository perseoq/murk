// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

export type ActionId =
  | "file.new"
  | "file.open"
  | "file.openFolder"
  | "file.recent"
  | "file.save"
  | "file.saveAs"
  | "file.push"
  | "file.history"
  | "file.export"
  | "file.repository"
  | "file.autosave"
  | "file.autopush"
  | "file.close"
  | "file.quit"
  | "edit.undo"
  | "edit.redo"
  | "edit.cut"
  | "edit.copy"
  | "edit.paste"
  | "edit.selectAll"
  | "edit.find"
  | "edit.findNext"
  | "edit.replace"
  | "insert.bulletList"
  | "insert.orderedList"
  | "insert.taskList"
  | "insert.blockquote"
  | "insert.codeBlock"
  | "insert.math"
  | "insert.mathBlock"
  | "insert.hr"
  | "format.font"
  | "format.list"
  | "format.bold"
  | "format.italic"
  | "format.strikethrough"
  | "format.code"
  | "format.link"
  | "view.settings"
  | "view.formatShortcuts"
  | "view.sidebar"
  | "view.files"
  | "view.outline"
  | "view.search"
  | "view.theme.light"
  | "view.theme.dark"
  | "view.theme.system"
  | "help.shortcuts"
  | "help.about"
  | "help.updates"
  | "table.insert"
  | "table.rowAbove"
  | "table.rowBelow"
  | "table.deleteRow"
  | "table.colLeft"
  | "table.colRight"
  | "table.deleteCol"
  | "table.alignLeft"
  | "table.alignCenter"
  | "table.alignRight"
  | "table.format";

export interface MenuItemDef {
  label: string;
  action: ActionId;
  shortcut?: string;
  separatorBefore?: boolean;
  /** Elemento marcable: muestra una marca según el estado de la aplicación. */
  checkable?: boolean;
}

export interface MenuDef {
  id: string;
  label: string;
  items: MenuItemDef[];
}

export const MENUS: MenuDef[] = [
  {
    id: "file",
    label: "Archivo",
    items: [
      { label: "Nuevo", action: "file.new", shortcut: "Ctrl+N" },
      { label: "Abrir…", action: "file.open", shortcut: "Ctrl+O" },
      { label: "Abrir carpeta…", action: "file.openFolder", shortcut: "Ctrl+Shift+O" },
      { label: "Abrir reciente…", action: "file.recent" },
      { label: "Guardar", action: "file.save", shortcut: "Ctrl+S" },
      { label: "Guardar como…", action: "file.saveAs", shortcut: "Ctrl+Shift+S" },
      { label: "Push", action: "file.push" },
      { label: "Historial del documento…", action: "file.history" },
      { label: "Exportar…", action: "file.export" },
      { label: "Repositorio…", action: "file.repository" },
      {
        label: "Autoguardado",
        action: "file.autosave",
        separatorBefore: true,
        checkable: true,
      },
      {
        label: "Autopush",
        action: "file.autopush",
        checkable: true,
      },
      { label: "Cerrar pestaña", action: "file.close", shortcut: "Ctrl+W", separatorBefore: true },
      { label: "Salir", action: "file.quit", shortcut: "Ctrl+Q", separatorBefore: true },
    ],
  },
  {
    id: "edit",
    label: "Editar",
    items: [
      { label: "Deshacer", action: "edit.undo", shortcut: "Ctrl+Z" },
      { label: "Rehacer", action: "edit.redo", shortcut: "Ctrl+Shift+Z" },
      { label: "Cortar", action: "edit.cut", shortcut: "Ctrl+X", separatorBefore: true },
      { label: "Copiar", action: "edit.copy", shortcut: "Ctrl+C" },
      { label: "Pegar", action: "edit.paste", shortcut: "Ctrl+V" },
      { label: "Seleccionar todo", action: "edit.selectAll", shortcut: "Ctrl+A" },
      { label: "Buscar…", action: "edit.find", shortcut: "Ctrl+F", separatorBefore: true },
      { label: "Buscar siguiente", action: "edit.findNext", shortcut: "F3" },
      { label: "Buscar y reemplazar…", action: "edit.replace", shortcut: "Ctrl+H" },
    ],
  },
  {
    id: "format",
    label: "Formato",
    items: [
      { label: "Fuente…", action: "format.font" },
      { label: "Lista…", action: "format.list" },
      { label: "Negrita", action: "format.bold", shortcut: "Ctrl+B", separatorBefore: true },
      { label: "Cursiva", action: "format.italic", shortcut: "Ctrl+I" },
      { label: "Tachado", action: "format.strikethrough", shortcut: "Alt+Shift+5" },
      { label: "Código en línea", action: "format.code", shortcut: "Ctrl+Shift+`" },
      { label: "Enlace", action: "format.link", shortcut: "Ctrl+K" },
    ],
  },
  {
    id: "insert",
    label: "Insertar",
    items: [
      { label: "Lista con viñetas", action: "insert.bulletList" },
      { label: "Lista numerada", action: "insert.orderedList" },
      { label: "Lista de tareas", action: "insert.taskList" },
      { label: "Cita", action: "insert.blockquote", separatorBefore: true },
      { label: "Bloque de código", action: "insert.codeBlock" },
      { label: "Tabla", action: "table.insert", separatorBefore: true },
      { label: "Fórmula en línea", action: "insert.math" },
      { label: "Fórmula en bloque", action: "insert.mathBlock" },
      { label: "Regla horizontal", action: "insert.hr", separatorBefore: true },
    ],
  },
  {
    id: "view",
    label: "Ver",
    items: [
      { label: "Preferencias…", action: "view.settings", shortcut: "Ctrl+," },
      { label: "Atajos de formato…", action: "view.formatShortcuts" },
      {
        label: "Barra lateral",
        action: "view.sidebar",
        shortcut: "Ctrl+Shift+1",
        separatorBefore: true,
      },
      { label: "Archivos", action: "view.files", shortcut: "Ctrl+Shift+E" },
      { label: "Esquema", action: "view.outline" },
      { label: "Buscar en archivos", action: "view.search", shortcut: "Ctrl+Shift+F" },
      { label: "Tema claro", action: "view.theme.light", separatorBefore: true },
      { label: "Tema oscuro", action: "view.theme.dark" },
      { label: "Tema del sistema", action: "view.theme.system" },
    ],
  },
  {
    id: "table",
    label: "Tabla",
    items: [
      { label: "Insertar tabla", action: "table.insert", shortcut: "Ctrl+Shift+T" },
      {
        label: "Insertar fila arriba",
        action: "table.rowAbove",
        separatorBefore: true,
      },
      { label: "Insertar fila abajo", action: "table.rowBelow" },
      { label: "Eliminar fila", action: "table.deleteRow" },
      { label: "Insertar columna a la izquierda", action: "table.colLeft", separatorBefore: true },
      { label: "Insertar columna a la derecha", action: "table.colRight" },
      { label: "Eliminar columna", action: "table.deleteCol" },
      { label: "Alinear a la izquierda", action: "table.alignLeft", separatorBefore: true },
      { label: "Centrar", action: "table.alignCenter" },
      { label: "Alinear a la derecha", action: "table.alignRight" },
      { label: "Formatear tabla", action: "table.format", separatorBefore: true },
    ],
  },
  {
    id: "help",
    label: "Ayuda",
    items: [
      { label: "Atajos de teclado", action: "help.shortcuts", shortcut: "F1" },
      { label: "Buscar actualizaciones…", action: "help.updates", separatorBefore: true },
      { label: "Acerca de Murk", action: "help.about", separatorBefore: true },
    ],
  },
];

export function shortcutFor(action: ActionId): string | undefined {
  for (const menu of MENUS) {
    const item = menu.items.find((entry) => entry.action === action);
    if (item) {
      return item.shortcut;
    }
  }
  return undefined;
}
