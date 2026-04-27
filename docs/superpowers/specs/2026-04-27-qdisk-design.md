# Strata — Design Spec

(Project directory: `qdisk`. Product name: **Strata**.)


**Date:** 2026-04-27
**Status:** Draft, pending implementation plan

## 1. Product positioning

A beautiful macOS disk-space viewer that surfaces **forgotten folders**, not just big files.

Where existing tools (DaisyDisk, Disk Inventory X, GrandPerspective) show *what's big*, Strata shows *what's big AND forgettable* — folders that are stale, junk, duplicated, or already backed up. The unique value is helping users find space they've truly lost track of.

The name evokes geological layers — exactly what nested directories are, and exactly what the sunburst view renders.

**Target user:** A Mac power user who has filled their disk and wants to make confident reclaim decisions without spending an evening manually inspecting folders in Finder.

**Tagline material:** *"See what's eating your disk — and what you've already forgotten you have."*

## 2. Tech architecture

- **Tauri** application shell — distributed as a signed `.dmg`, ~10–15 MB bundle.
- **Rust backend** for all filesystem and metadata work:
  - Multi-threaded directory walker (`jwalk` crate).
  - Spotlight metadata via `mdls` shellouts or `CoreServices` FFI for `kMDItemLastUsedDate`.
  - `tmutil` shellout to query Time Machine backup status per path.
  - FSEvents subscription for live updates after initial scan.
  - Optional content hashing (BLAKE3) for duplicate detection on a background thread.
- **WebView UI** — TypeScript + Vite + D3.js. D3 carries the morphing treemap↔sunburst. A small reactive layer (Solid.js or lit-html) for sidebar/details panel state. Plain CSS, no UI framework.
- **IPC** — Tauri commands (`scan_volume`, `rescan`, `compute_hashes`, `move_to_trash`, `reveal_in_finder`). Backend streams progress events the UI subscribes to.

## 3. Data model

Each scanned directory node:

```
DirNode {
  path: String,
  name: String,
  parent_id: NodeId?,
  size_bytes: u64,            // recursive total
  file_count: u64,            // recursive total
  depth: u16,
  last_used_at: Option<DateTime>,    // max(kMDItemLastUsedDate) of any descendant
  last_modified_at: DateTime,        // max(mtime) of any descendant
  created_at: DateTime,
  is_backed_up_tm: bool,             // tmutil isexcluded == false AND backup exists
  is_in_icloud: bool,                // best-effort: known cloud paths + xattr check
  is_known_junk: bool,               // matches built-in junk pattern list
  duplicate_group_id: Option<u64>,   // null until background hash pass populates
  staleness: Stale,                  // Hot | Warm | Stale | VeryStale (derived)
  children: Vec<NodeId>,
}
```

**Staleness derivation** uses `max(last_used_at, last_modified_at)`:
- Hot: ≤30 days
- Warm: 31 days–6 months
- Stale: 6 months–2 years
- VeryStale: >2 years

**Known junk patterns** (initial list, expandable):
- `node_modules`, `.next`, `dist`, `build`, `target` (Rust), `__pycache__`, `.venv`
- `~/Library/Caches/*`, `~/Library/Developer/Xcode/DerivedData`, `~/Library/Developer/CoreSimulator`
- Browser caches (Chrome, Safari, Arc, Brave) under `~/Library/Application Support/*/Cache`

## 4. Window layout

Single window, three-pane structure with collapsible side regions.

```
┌─────────────────────────────────────────────────────────────┐
│ ⓞⓞⓞ  Strata — Macintosh HD    [scan ▰▰▰▰▱]    ↻ Rescan      │ ← title bar
├──────────┬──────────────────────────────────────┬───────────┤
│ Volumes  │   ┌── ◎ Sunburst | ▦ Treemap ──┐    │ Details   │
│ • Mac HD │   │                              │   │ (slides   │
│ • Backup │   │       <viz canvas>           │   │ in on     │
│          │   │                              │   │ click)    │
│ Filters  │   └──────────────────────────────┘    │           │
│ ☑ Stale  │                                       │           │
│ ☑ Junk   │   <hover peek tooltip near cursor>    │           │
│ ☐ Dupes  │                                       │           │
│ ☑ TM-OK  │                                       │           │
│          │                                       │           │
│ Saved    │                                       │           │
│ • >1y 5G │                                       │           │
└──────────┴──────────────────────────────────────┴───────────┘
```

- **Left sidebar** (collapsible via `⌘1`, default open ~180px wide):
  - **Volumes** — internal disk + any mounted externals (externals opt-in to scan).
  - **Filters** — multi-select chips: Stale, Junk, Duplicates, "Backed-up safe". Filtering **dims non-matching nodes to 20% opacity** without reshaping the geometry — keeps spatial mental model intact while highlighting matches.
  - **Saved searches** — user-saved filter combinations, e.g., ">1 year unused, >5GB".
- **Center canvas** — viz fills available space.
  - Toggle pill at top center: `◎ Sunburst | ▦ Treemap`. Click animates morph (~600ms cubic-ease).
  - Breadcrumb at top-left when zoomed in (e.g., `Macintosh HD › Users › vishal › Movies`). Click any segment to zoom out to it. ESC zooms out one level.
  - Hover any region → small floating tooltip with name, size, last-used, and colored badges.
  - Click any region → right details panel slides in.
- **Right details panel** (slides in on click, dismissable via close button or ESC, ~320px wide):
  - Folder name, full breadcrumb, big size readout (e.g., `184 GB · 2,341 files`).
  - All six signals as a compact stat grid:
    - Last opened
    - Last modified
    - Time Machine status
    - iCloud / cloud-mirror status
    - Duplicate match (or "Computing…" if hash pass not done)
    - Junk pattern (if any matched)
  - Action buttons: **Reveal in Finder**, **Move to Trash** (with native macOS confirm sheet).

## 5. Visualization details

### Color encoding (semantic, not random)
- Cool blues/cyans → recently used / hot
- Yellows/ambers → stale (>6 months)
- Reds/magentas → very stale (>2 years) AND large (>1 GB)
- Green outline overlay → "safely deletable" (backed-up + stale)
- Desaturated grey → system/non-actionable (e.g., `/System`, app bundles)

Color mapping is consistent across the treemap and sunburst views, so morph transitions are coherent.

### Interaction
- **Click region** → smooth zoom into that subtree (becomes the new root). Breadcrumb updates.
- **ESC / breadcrumb click** → zoom back out one level.
- **Toggle morph (sunburst ↔ treemap)** — D3-based; each leaf node has a stable identity, so positions and sizes interpolate over ~600ms with cubic easing.
- **Hover** → 1px ring around region + tooltip near cursor.
- **Right-click region** → context menu (Reveal in Finder, Move to Trash, Copy path).

### Performance
- Viz only renders the **top N visible nodes at the current zoom level** (target ~500 nodes on canvas at any moment). Underlying scan tree may have hundreds of thousands of nodes; nodes below the visibility threshold (e.g., <0.5% of current root area) are not drawn individually but rolled into a synthetic "Other" sibling node per parent. The "Other" node has stable identity across both treemap and sunburst views and across morph transitions; clicking it expands its parent (zooms in one level so its small children become individually visible).
- Renderer: Canvas 2D with manual hit-testing (faster than SVG at this scale, still allows smooth animation via `requestAnimationFrame`).

## 6. Aesthetic

Dark moody, Linear/Vercel-inspired.

- Background: `#08080b`. Panels: `#0d0d12`. Borders: `#1a1a22`.
- Typography: SF Pro Display (UI), SF Mono (numerics, paths). Tabular numerics enabled.
- Data palette: vibrant but desaturated indigos, cyans, emeralds, ambers, magentas. Each region has a subtle inset glow (`box-shadow: inset 0 0 24px rgba(color, 0.15)`).
- Motion: short, purposeful (≤600ms). Cubic easing. No bouncy/elastic curves.
- Micro-interactions: hover ring, smooth zoom, sidebar collapse animation, details panel slide.
- Light mode deferred to v1.1 (color tokens defined behind a CSS variable system from day one to make it cheap to add).

## 7. v1 scope

**In v1:**
- Treemap and sunburst with morph toggle.
- Hover peek + click details panel.
- Collapsible left sidebar with volume picker, filter chips, saved searches.
- Six signals collected and displayed:
  - Last opened, last modified, Time Machine backup, known-junk pattern fully populated on first scan.
  - iCloud/cloud-mirror and duplicate detection populate from a background pass after initial scan completes (UI shows "Computing…").
- Reveal in Finder, Move to Trash with native macOS confirmation sheet.
- Full Disk Access onboarding flow on first run (explainer + deep-link to System Settings).
- FSEvents subscription for live updates (changes detected automatically; no manual rescan needed for normal use).
- Manual rescan button for forced full refresh.
- Dark theme.

**Deferred to v1.1+:**
- Light mode.
- Quarantine-with-undo (a "Strata Trash" folder with a 30-day auto-empty), in addition to system Trash.
- "Apps you haven't launched in N months" via LaunchServices.
- External volume scanning enabled by default (v1: opt-in per volume).
- Per-volume Time Machine inspection beyond binary backed-up flag (e.g., "last backup: 3 days ago").
- Saved searches beyond the built-in defaults.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `kMDItemLastUsedDate` is sparse (not all files have it). | Fallback heuristic: `last_used_at = max(kMDItemLastUsedDate, atime, mtime)`. atime is unreliable on APFS but better than nothing. |
| Hash-based duplicate detection across millions of files crushes memory and CPU. | Only hash files >50 MB. Use partial hash (first 4KB + middle 4KB + last 4KB) as cheap pre-filter; only full-hash when partial hashes match. Cap dupe-set at 10,000 files per scan. |
| Treemap↔sunburst morph at 50,000+ nodes stutters. | Virtualize: only morph the ~500 nodes currently visible at the active zoom level. Sub-threshold nodes collapsed into "Other" aggregate wedge/rect. |
| Spotlight queries (`mdls`) are slow when shelled out per-file. | Use `mdfind` batch queries by path prefix, or call `MDItemCopyAttributes` directly via Rust FFI to CoreServices. Fall back to filesystem-only signals if Spotlight is disabled. |
| Full Disk Access permission UX is jarring. | Polished onboarding screen: explains what we'll read and what we won't, deep-links directly to the pane in System Settings, detects when permission is granted and continues automatically. |
| Brand visibility — "Strata" is a real word with prior software uses (3D modeling, etc.). | Confirm trademark/SEO posture before public launch. App Store discoverability is downstream of v1; not blocking design or implementation. |

## 9. Out of scope (forever, not just v1)

- Windows / Linux support. macOS-only by design.
- Cloud-only scanning (Dropbox, Google Drive web). Only locally-mirrored cloud folders are visible.
- Server/multi-machine deployments. Single-user desktop app.
- Selling user data, telemetry, analytics. Local-only by ethos.
