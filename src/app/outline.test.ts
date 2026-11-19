// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { describe, expect, it } from "vitest";

import { parseOutline } from "./outline";

describe("outline", () => {
  it("extrae encabezados ATX con nivel y offset", () => {
    const content = "# Uno\n\n## Dos\ntexto\n### Tres ###\n";
    const items = parseOutline(content);

    expect(items).toEqual([
      { level: 1, text: "Uno", offset: 0 },
      { level: 2, text: "Dos", offset: 7 },
      { level: 3, text: "Tres", offset: 20 },
    ]);
  });

  it("extrae encabezados Setext", () => {
    const content = "Título\n======\n\nSubtítulo\n---\n";
    const items = parseOutline(content);

    expect(items).toEqual([
      { level: 1, text: "Título", offset: 0 },
      { level: 2, text: "Subtítulo", offset: 15 },
    ]);
  });

  it("ignora encabezados dentro de bloques de código", () => {
    const content = "# Real\n\n```\n# Falso\n```\n\n## Otra\n";
    const items = parseOutline(content);

    expect(items.map((item) => item.text)).toEqual(["Real", "Otra"]);
  });

  it("devuelve vacío sin encabezados", () => {
    expect(parseOutline("solo texto\n")).toEqual([]);
  });
});
