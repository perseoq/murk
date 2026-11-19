// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

import { StateEffect } from "@codemirror/state";

/** Fuerza a los widgets a recalcularse (tema, contexto del documento). */
export const refreshEffect = StateEffect.define<null>();
