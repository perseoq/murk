// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { describe, expect, it } from "vitest";

import { colorizeDiagram } from "./mermaid";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg">
  <g class="node"><rect/><text>Uno</text></g>
  <g class="node"><rect/><text>Dos</text></g>
  <g class="node"><rect/><text>Tres</text></g>
</svg>`;

describe("colores de los diagramas Mermaid", () => {
  it("asigna un color distinto a cada figura", () => {
    const output = colorizeDiagram(SVG, true);
    const document = new DOMParser().parseFromString(output, "image/svg+xml");
    const shapes = Array.from(document.querySelectorAll("g.node rect"));
    const styles = shapes.map((shape) => shape.getAttribute("style") ?? "");

    expect(styles).toHaveLength(3);
    expect(styles[0]).toContain("#12324a");
    expect(styles[1]).toContain("#2d2440");
    expect(styles[2]).toContain("#1f3b2a");
    expect(new Set(styles).size).toBe(3);
  });

  it("usa la paleta clara cuando el tema es claro", () => {
    const output = colorizeDiagram(SVG, false);
    expect(output).toContain("#dbeafe");
    expect(output).not.toContain("#12324a");
  });

  it("colorea también el texto de cada figura", () => {
    const output = colorizeDiagram(SVG, true);
    const document = new DOMParser().parseFromString(output, "image/svg+xml");
    const labels = Array.from(document.querySelectorAll("g.node text"));
    expect(labels[0].getAttribute("style")).toContain("fill:#e6edf3");
  });
});
