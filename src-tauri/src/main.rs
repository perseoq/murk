// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Murk contributors

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(code) = murk_lib::cli::run(std::env::args().skip(1).collect()) {
        std::process::exit(code);
    }

    murk_lib::run();
}
