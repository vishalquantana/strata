# Changelog

All notable changes to Strata will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.10] - 2026-04-27

### Fixed
- **Scan cancellation actually cancels.** Previously, clicking Cancel only
  flipped frontend state — the background walker thread kept running, and a
  subsequent scan would race with the original scan's delayed
  `scan-complete`, which clobbered the new view (e.g. starting a `/` scan,
  cancelling, then clicking Downloads would briefly show Downloads then
  jump back to `/`). The walker now polls a shared
  `Arc<AtomicBool>` once per directory entry and bails out promptly. The
  scan runner tracks the active scan and drops emits from cancelled scans,
  and starting a new scan cancels any previous in-flight scan automatically.

### Added
- `cancel_scan` Tauri command (no-op when no scan is running).



### Added
- **Cloud-storage detection per file.** The walker now tags every file with
  the cloud provider syncing it (iCloud / Google Drive / OneDrive / Dropbox /
  Box) using path-prefix lookup against the standard sync roots
  (`~/Library/Mobile Documents/com~apple~CloudDocs/`,
  `~/Library/CloudStorage/<Provider>-...`, plus legacy `~/Google Drive`,
  `~/Dropbox`, `~/OneDrive`).
- **Dehydrated-file detection.** Files where `st_blocks * 512` is well below
  `st_size` are flagged as `is_dehydrated` — these are dataless placeholders
  (cloud-only / "Optimize Storage") that take ~0 B of local disk.
- **Cloud badge on biggest-files rows.** Every row now leads with a 22 px
  square badge: filled brand colour for materialised cloud files, dashed
  outline for dehydrated, faint grey dot for local. Tooltip names the
  provider and tells you whether the file is local or cloud-only.

### Changed
- **Cloud files hidden by default during scan.** Files synced from any cloud
  provider are filtered out of the live "Biggest files found" list — trashing
  them is rarely useful for local-disk cleanup. A new chip beside the
  section title ("Show cloud (N)" / "Hide cloud (N)") toggles them back in.
- `Signals` gained `cloud_provider: Option<CloudProvider>` and
  `is_dehydrated: bool`. Both `#[serde(default)]` so older saved snapshots
  still load. `is_in_icloud` is preserved for backwards-compat.
- `BigFile` (during-scan snapshot row) gained the same two fields.

## [0.3.8] - 2026-04-27

### Added
- **Every-file treemap (GrandPerspective-style).** The post-scan treemap now
  shows individual files as leaf tiles, not just directories. Any file ≥ 64 KB
  is promoted to its own `DirNode` leaf during the walk; smaller files lump
  into the parent dir's `size_bytes` (sub-pixel anyway). On a typical Mac `/`
  scan this produces ~100 K visible tiles — every meaningful file is its own
  rectangle, sized proportionally, colored by staleness, and clickable for
  Reveal in Finder / Move to Trash.

### Changed
- `DirNode` gained an `is_file: bool` field (defaults to false on older
  serialized trees, so saved snapshots still load).
- Treemap `visibleThreshold` lowered from 0.5 % of total area to 0 — every
  rect ≥ 1 px² is laid out. Render pass drops sub-pixel tiles so we don't
  pay for invisible `fillRect` calls.

## [0.3.7] - 2026-04-27

### Added
- **Persisted last-scan snapshot.** Every WalkSnapshot tick is now also
  written to `~/Library/Application Support/Strata/last-scan.json` (path
  + UTC timestamp + top dirs + biggest files + completion flag). When a
  scan finishes the flag flips to `is_complete: true`.
- **Resume card on welcome screen.** If a previous snapshot exists, the
  welcome screen now shows a "Resume last view" card at the top with the
  scanned path, counts, and "{N} {unit} ago" timestamp. Click **Open** to
  jump straight back into the scanning view pre-seeded with the saved
  treemap + biggest-files (so the user sees their old data instantly), and
  a fresh scan kicks off underneath to refresh it. Click **×** to dismiss
  and clear the saved snapshot.
- New Tauri commands: `load_last_snapshot`, `clear_last_snapshot`.

## [0.3.6] - 2026-04-27

### Changed
- **Wide 2-column scanning layout.** The scanning view used to be a single
  760 px column with huge empty bands on either side. It now spreads to a
  responsive max 1400 px wide grid: header card + counters span the full
  width, and below them a 2-col layout puts the treemap on the left (≈62 %
  width, 520 px tall) with the biggest-files list on the right (≈38 %
  width, same height, scrollable). Treemap width adapts via `ResizeObserver`
  so resizing the window or toggling the sidebar reflows cleanly.

## [0.3.5] - 2026-04-27

### Changed
- **Scrollable biggest-files list during scan.** Backend now tracks the top
  200 biggest files (was 30) and the frontend renders the full list in a
  scrollable container capped at ~10 rows tall, so you can scroll past the
  first screenful and keep deleting. Section title now shows the live count
  (e.g. "Biggest files found (47)").

## [0.3.4] - 2026-04-27

### Changed
- **Single-pass walker.** Previously the scanner ran two sequential passes —
  Pass 1 enumerated every directory, then Pass 2 walked all files and emitted
  the running snapshots. On large roots like `/`, Pass 1 alone took several
  minutes, so the UI sat at "0 files, 0 B" with no visuals until Pass 2
  finally started. Now a single walk handles both: when an entry is a file,
  it tallies into its parent dir AND updates the running top-dirs/biggest-files
  state immediately, with `depth1_ancestor` built incrementally. First
  snapshot still fires after ~5 s, but it now contains real data from the
  very first directory the walker enters.

### Fixed
- **"Stuck on Walking…" perception bug.** Counters and treemap now begin
  populating from second 1 of the scan rather than waiting for the directory
  enumeration phase to complete.

## [0.3.3] - 2026-04-27

### Added
- **Move to Trash during scan.** Both treemap tiles (top-right corner of
  each tile) and biggest-files rows now have a trash button. Click to
  send the item to system Trash. The view updates immediately
  (optimistically) and any further snapshot for that path is suppressed.
- **Path-prefix deletion filter.** When a parent dir is trashed, any
  biggest file whose path falls under it is hidden too, so the next
  snapshot doesn't briefly resurface stale entries.

### Changed
- **Scanning view alignment redesign.** Single 760 px content column —
  every section (header card, counters, treemap, biggest-files, phase
  timeline) now locks to that column edge so the eye has a clean rail to
  follow. Header is now a card with the ring on the left and title /
  path / phase stacked on the right. Counters strip moved to a
  full-width 4-cell layout with subtle dividers. Phase timeline uses
  short labels (Walk · TM · iCloud · Spotlight · Dupes) and lives in a
  matching card.
- Biggest-files rows switched from flex to a 3-col grid
  (name · size · actions) so the size column is always vertically
  aligned regardless of filename length.

## [0.3.2] - 2026-04-27

### Added
- **Live treemap during scan.** The "Top folders so far" section is now a
  proper 2D squarified D3 treemap (not a horizontal stripe), so each
  top-level folder is a rectangle proportional to its running size. Click
  or right-click a tile to reveal it in Finder.
- **Faster first paint.** First scan snapshot now fires after ~5 s; later
  snapshots every 30 s, so the user sees a treemap quickly without paying
  for frequent recomputation.

### Changed
- Scan snapshot cadence: 5 s → 30 s (after the first one), reducing UI
  reflow during long scans.
- Replaced the colored horizontal proportional bar with the 2D treemap.

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

[Unreleased]: https://github.com/vishalquantana/strata/compare/v0.3.9...HEAD
[0.3.9]: https://github.com/vishalquantana/strata/releases/tag/v0.3.9
[0.3.8]: https://github.com/vishalquantana/strata/releases/tag/v0.3.8
[0.3.7]: https://github.com/vishalquantana/strata/releases/tag/v0.3.7
[0.3.6]: https://github.com/vishalquantana/strata/releases/tag/v0.3.6
[0.3.5]: https://github.com/vishalquantana/strata/releases/tag/v0.3.5
[0.3.4]: https://github.com/vishalquantana/strata/releases/tag/v0.3.4
[0.3.3]: https://github.com/vishalquantana/strata/releases/tag/v0.3.3
[0.3.2]: https://github.com/vishalquantana/strata/releases/tag/v0.3.2
[0.3.1]: https://github.com/vishalquantana/strata/releases/tag/v0.3.1
[0.3.0]: https://github.com/vishalquantana/strata/releases/tag/v0.3.0
[0.2.2]: https://github.com/vishalquantana/strata/releases/tag/v0.2.2
[0.2.1]: https://github.com/vishalquantana/strata/releases/tag/v0.2.1
[0.2.0]: https://github.com/vishalquantana/strata/releases/tag/v0.2.0
[0.1.0]: https://github.com/vishalquantana/strata/releases/tag/v0.1.0
