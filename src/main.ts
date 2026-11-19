// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { getVersion } from "@tauri-apps/api/app";

import "./styles.css";

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("No se encontró el contenedor #app");
}

app.innerHTML = `
  <section class="card" aria-labelledby="murk-title">
    <div class="mark" aria-hidden="true">M</div>
    <p class="eyebrow">Fase A0 · Bootstrap</p>
    <h1 id="murk-title">Murk</h1>
    <p class="lead">Editor de Markdown con preview en vivo.</p>
    <ul class="badges" aria-label="Estado del proyecto">
      <li>Tauri 2</li>
      <li>CodeMirror 6</li>
      <li>GPL-3.0-or-later</li>
    </ul>
    <dl class="meta">
      <div>
        <dt>Versión</dt>
        <dd id="app-version">0.0.0</dd>
      </div>
      <div>
        <dt>Estado</dt>
        <dd>Fundación lista</dd>
      </div>
    </dl>
    <p class="hint">La ventana base funciona. El editor llega en la fase A3.</p>
  </section>
`;

const versionNode = document.querySelector<HTMLElement>("#app-version");

if (versionNode) {
  try {
    versionNode.textContent = await getVersion();
  } catch {
    // Ejecución en navegador (vite dev sin Tauri): se mantiene el valor estático.
  }
}
