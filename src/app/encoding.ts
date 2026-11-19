// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import type { Eol } from "../host";

export interface EncodingOption {
  label: string;
  name: string;
}

export const ENCODING_OPTIONS: EncodingOption[] = [
  { label: "utf-8", name: "UTF-8" },
  { label: "utf-16le", name: "UTF-16 LE" },
  { label: "utf-16be", name: "UTF-16 BE" },
  { label: "windows-1252", name: "Windows-1252" },
  { label: "iso-8859-15", name: "ISO-8859-15" },
  { label: "windows-1251", name: "Windows-1251" },
  { label: "gb18030", name: "GB18030" },
  { label: "shift_jis", name: "Shift_JIS" },
  { label: "euc-kr", name: "EUC-KR" },
  { label: "big5", name: "Big5" },
];

export function encodingDisplayName(label: string): string {
  return ENCODING_OPTIONS.find((option) => option.label === label.toLowerCase())?.name ?? label;
}

export function normalizeEol(value: unknown): Eol {
  return value === "crlf" || value === "cr" ? value : "lf";
}

export function detectEol(text: string): Eol {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const cr = (text.match(/\r/g) ?? []).length - crlf;
  const lf = (text.match(/\n/g) ?? []).length - crlf;

  if (crlf === 0 && cr === 0) {
    return "lf";
  }
  if (crlf >= lf && crlf >= cr) {
    return "crlf";
  }
  return cr >= lf ? "cr" : "lf";
}

export function convertEol(text: string, eol: Eol): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return eol === "crlf"
    ? normalized.replace(/\n/g, "\r\n")
    : eol === "cr"
      ? normalized.replace(/\n/g, "\r")
      : normalized;
}
