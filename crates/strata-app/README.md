# strata-app

Tauri shell + WebView UI for Strata. Wraps the `strata-scan` crate and renders
the result as a morphing treemap ↔ sunburst.

## Dev

    cargo tauri dev --config crates/strata-app/tauri.conf.json

## Build

    cargo tauri build --config crates/strata-app/tauri.conf.json

Produces an unsigned `.app` bundle and `.dmg` installer. Codesigning + notarization are out of scope for the v1 implementation plans and will be set up as part of release engineering.

## Architecture

- Rust backend (`src/`) registers two Tauri commands:
  `pick_directory()` and `start_scan(path)`. The latter spawns a thread that
  drives `strata-scan::run`, emitting `scan-progress` events and a final
  `scan-complete` event with the JSON-serialized `ScanTree`.
- Frontend (`ui/`) is a Vite + Solid + TypeScript app. D3 hierarchies feed
  Canvas-2D treemap and sunburst renderers. The morph between layouts is
  a 600ms crossfade.
