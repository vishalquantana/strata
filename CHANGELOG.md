# Changelog

All notable changes to Strata will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-04-27

### Added
- **Reveal in Finder from biggest-files list during scan.** Each row in the
  live "Biggest files found" list now has a small folder-icon button between
  the file name and size that opens the containing folder in Finder.
- **Right-click context menu** on biggest-files rows also reveals the file
  in Finder, so the entire row is a target.

### Changed
- Biggest-files row layout: name (flex) · folder-icon button · size, with
  the size column right-aligned at a fixed minimum width for tidy columns.

## [0.3.0] - 2026-04-27

### Added
- **Live "biggest finds" preview during scan.** The scanner now emits a
  `walk_snapshot` event every 5 s during Pass 2 carrying:
  - `top_dirs`: running size totals for each depth-1 directory under the
    scanned root, sorted by size (capped at 12)
  - `biggest_files`: the largest 30 files (≥ 1 MB) discovered so far
- **Top-folders bar** on the scanning screen — horizontal proportional bar
  with stable color palette, each cell labelled with directory name and
  current running size; cells smoothly resize as the scan progresses
- **Biggest files list** on the scanning screen — top 10 files with name
  and size in monospace, hover for full path

### Changed
- Scanning view layout: ring + path + counters now inline at the top, with
  Top folders / Biggest files / phase timeline stacked below in scrollable
  area so the live preview has room
- Phase timeline switched from vertical to horizontal wrap layout to free
  vertical space for the live preview

## [0.2.2] - 2026-04-27

### Added
- Live scan dashboard while scanning: large counters for Folders, Files,
  Size, and Elapsed time, plus a phase timeline showing Walk →
  Time Machine → iCloud → Spotlight → Duplicate detection with
  pending / active / done states
- Elapsed-time tick (250 ms) so the user sees the scan is alive even when
  no walk_progress event has arrived in the last second

## [0.2.1] - 2026-04-27

### Fixed
- **Critical:** Frontend never received `scan-progress`, `scan-complete`,
  `scan-error`, or `fs-changed` events because no Tauri capability file
  existed — events require explicit `core:event` permissions in Tauri 2.
  Backend was scanning successfully but the UI stayed at "Starting…"
  forever. Added `capabilities/default.json` granting `core:event` and
  related defaults to the `main` window.

## [0.2.0] - 2026-04-27

### Added
- Quick-pick welcome screen with preset folder cards (Macintosh HD, Home,
  Documents, Downloads, Desktop, Library) plus Custom tile
- Live `ScanningState` view with animated scan rings and live counters
  (folders / files / bytes) sourced from `walk_progress` events
- Sidebar with volumes list and per-volume usage bars
- Details panel for selected node: path, size, child count, Reveal in
  Finder, Move to Trash
- Right-click context menu on canvas: Reveal, Trash, Copy Path
- Keyboard navigation: Esc (dismiss menu / close details / zoom out),
  ⌘1 (toggle sidebar), ⌘O (open folder), ⌘R (rescan)
- Filter and selection Solid stores with reactive canvas dimming
- Hover-peek tooltip with name + size while hovering canvas tiles
- Full Disk Access onboarding flow with `check_full_disk_access` and
  `open_fda_settings` Tauri commands
- FSEvents-backed file-system watcher (`notify` crate) with 1.5 s
  debounced auto-rescan when the scanned root changes
- Backend commands: `reveal_in_finder`, `move_to_trash`, `home_dir`,
  `start_watching`, `stop_watching`
- Diagnostic logging: `stderr`/`stdout` redirected via `dup2(2)` to
  `~/Library/Logs/strata.log` so Finder-launched builds capture output
- Version badge in lower-left of the main window
- `CHANGELOG.md` (this file) and adoption of SemVer

### Changed
- Welcome screen: replaced bare "Choose folder" button with the
  preset-folder grid
- Scan listener registration now runs **before** the FDA gate so
  cold-start scans cannot lose early `scan-progress` events

### Fixed
- Solid `onCleanup` calls registered after an `await` inside
  `onMount` were silently dropped; lifted listener registration to the
  synchronous owner phase
- Context menu now dismisses on any outside click (not only canvas
  clicks)
- `handlePick` and `handleRescan` short-circuit while a scan is in
  progress so keyboard shortcuts cannot trigger overlapping scans

## [0.1.0] - 2026-04

### Added
- Initial walkthrough scan engine (`strata-scan`) with parallel
  directory walk via `jwalk`, cross-device guard, and
  `walk_started` / `walk_progress` / `walk_completed` events
- Tauri 2 + Solid.js shell with treemap visualization on `<canvas>`
- Drill-down / zoom-out via click and breadcrumb
- Volume listing via `sysinfo`

[Unreleased]: https://github.com/vishalquantana/strata/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/vishalquantana/strata/releases/tag/v0.3.1
[0.3.0]: https://github.com/vishalquantana/strata/releases/tag/v0.3.0
[0.2.2]: https://github.com/vishalquantana/strata/releases/tag/v0.2.2
[0.2.1]: https://github.com/vishalquantana/strata/releases/tag/v0.2.1
[0.2.0]: https://github.com/vishalquantana/strata/releases/tag/v0.2.0
[0.1.0]: https://github.com/vishalquantana/strata/releases/tag/v0.1.0
