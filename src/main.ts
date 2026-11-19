// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { Shell } from "./app/shell";
import "./styles.css";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("No se encontró el contenedor #app");
}

const shell = new Shell(root);

void shell.boot().catch((error: unknown) => {
  console.error(error);
  root.textContent = `No se pudo iniciar Murk: ${String(error)}`;
});
