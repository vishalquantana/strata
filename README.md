# Strata

> Beautiful macOS disk-space viewer that surfaces forgotten folders, not just big files.

Strata is a fast, native macOS app that scans a disk or folder and shows you
where the space *actually* lives — as a treemap, as a "biggest things" list,
and with a live preview while it's still scanning so you don't stare at a
spinner.

![Strata main view](docs/images/01-main.png)

## Why another disk viewer?

The classics (DaisyDisk, GrandPerspective, OmniDiskSweeper) are great, but:

- They mostly highlight **big files**. A lot of the time the win is a
  **forgotten folder** — `~/Downloads/old-thing/`, a stale `node_modules`,
  a Time Machine local snapshot — that no single file makes obvious.
- They make you wait for the entire scan before you see anything.

Strata streams a live "biggest finds so far" view while the scan is still
running, and treats Time Machine local snapshots, iCloud-evicted blobs and
the Spotlight database as first-class citizens.

## Features

- **Live scan dashboard** — Folders / Files / Size / Elapsed counters update
  as the scan runs. Phase timeline shows Walk → Time Machine → iCloud →
  Spotlight → Duplicate detection.
- **Live "biggest finds"** — During scanning, a colored top-folders bar and
  a top-10 biggest-files list update every 5 s so you can already act on
  the early results.
- **Treemap visualization** — Click to drill in, click breadcrumbs or hit
  Esc to drill out. Hover-peek tooltip with size.
- **Reveal in Finder / Move to Trash** — From the details panel, the
  treemap right-click menu, and the live biggest-files list (folder icon
  button, or right-click).
- **Filters & selection** — Reactive Solid stores; non-matching tiles dim
  on canvas instead of being removed.
- **Volumes sidebar** — All mounted volumes with per-volume usage bars.
- **FSEvents auto-rescan** — When the scanned root changes, a 1.5 s
  debounced rescan kicks in.
- **Keyboard shortcuts** — ⌘O open, ⌘R rescan, ⌘1 toggle sidebar,
  Esc close menu / details / drill out.
- **Full Disk Access onboarding** — Detects whether FDA is granted, opens
  the right System Settings pane with one click.
- **Version badge** — Bottom-left corner so you always know which build
  you're looking at.

## Screenshots

### Welcome / quick-pick

![Welcome screen with preset folders](docs/images/02-welcome.png)

### Live scan with snapshot

![Scanning state with top folders bar and biggest files list](docs/images/03-scanning.png)

### Treemap

![Treemap visualization](docs/images/04-treemap.png)

### Details panel

![Details panel with reveal/trash actions](docs/images/05-details.png)

## Install

### Download the latest DMG

Grab `Strata_<version>_aarch64.dmg` from the [Releases page](https://github.com/vishalquantana/strata/releases),
mount it, drag **Strata.app** into `/Applications`.

> Apple-Silicon only for now (`aarch64`). Intel build not yet published.

The bundle is **not** signed or notarized yet, so the first time you launch
it macOS will say "Strata can't be opened because Apple cannot check it
for malicious software." Right-click → **Open** to bypass.

### Grant Full Disk Access

Strata will detect this and walk you through it on first launch:

System Settings → Privacy & Security → Full Disk Access → toggle on
**Strata.app**.

## Build from source

Requirements:

- Rust (stable, with the `aarch64-apple-darwin` target)
- Node 18+
- macOS 11+

```bash
git clone https://github.com/vishalquantana/strata.git
cd strata/crates/strata-app
npm --prefix ui install
cargo tauri build
```

The DMG lands at `target/release/bundle/dmg/Strata_<version>_aarch64.dmg`.

For development:

```bash
cd crates/strata-app
cargo tauri dev
```

## Architecture

- **`crates/strata-scan`** — pure-Rust scan engine. Parallel directory walk
  via `jwalk`, cross-device guard, top-K min-heap for biggest files,
  emits `walk_started` / `walk_progress` / `walk_snapshot` /
  `walk_completed` events at fixed intervals.
- **`crates/strata-app`** — Tauri 2 shell. Wires scan events to the
  frontend via `Emitter::emit`, owns the FSEvents watcher, exposes
  Tauri commands for `reveal_in_finder`, `move_to_trash`, `home_dir`,
  `start_watching`, `stop_watching`, `check_full_disk_access`,
  `open_fda_settings`.
- **`crates/strata-app/ui`** — Solid.js + Vite + TypeScript + D3 frontend.
  Treemap on `<canvas>`. Reactive stores for filters and selection. Live
  scan dashboard component subscribes to `scan-progress` events.

## Project status & roadmap

This is **0.3.x** — usable, beautiful, and missing the bits I haven't yet
built:

- Time Machine local snapshot detection (panel placeholder, real probe TBD)
- iCloud-evicted blob accounting
- Spotlight DB introspection
- Duplicate detection (content-hash based)
- Code signing + notarization for unsigned-bundle warnings
- Intel x86_64 bundle

See [CHANGELOG.md](CHANGELOG.md) for what shipped and when.

## License

[MIT](LICENSE) © Vishal Kumar

---

Built with [Tauri 2](https://tauri.app), [Solid.js](https://solidjs.com),
and [jwalk](https://github.com/byron/jwalk).
