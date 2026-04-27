# Strata Plan 3 — UI Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Plan 2 viz into the v1 spec: collapsible left sidebar (volumes / filters / saved searches), slide-in right details panel with all six signals and actions (Reveal in Finder, Move to Trash), hover-peek tooltip, Full Disk Access onboarding flow, FSEvents live updates, and final dark-theme polish. After this plan, Strata is shippable as v1.

**Architecture:** Backend gains three Tauri commands (`reveal_in_finder`, `move_to_trash`, `check_full_disk_access`) plus an FSEvents subscription that emits `fs-changed` events causing the frontend to recompute affected nodes. Frontend gains a sidebar/details layout shell, a hover-peek tooltip overlay, a filters store (Solid signals) that drives the dim-non-matching-nodes effect, and an onboarding screen that gates the main app until Full Disk Access is granted.

**Tech Stack:**
- Add Rust crates: `notify` (FSEvents), `trash`
- Add npm deps: none — Solid signals + plain CSS suffice

**Depends on:** Plan 2 complete (working app with morphing treemap↔sunburst).

---

## File Structure

Net new and changed:

```
crates/strata-app/
├── Cargo.toml                          # add notify, trash deps
├── src/
│   ├── main.rs                         # register new commands + fs watcher
│   ├── commands.rs                     # add reveal/trash/fda commands
│   ├── fs_watcher.rs                   # NEW: FSEvents → events
│   └── permissions.rs                  # NEW: full-disk-access checker
└── ui/
    └── src/
        ├── app.tsx                     # restructured into shell layout
        ├── stores/
        │   ├── filters.ts              # NEW: filter signal store
        │   └── selection.ts            # NEW: selected node id
        ├── components/
        │   ├── sidebar.tsx             # NEW
        │   ├── filters-section.tsx     # NEW
        │   ├── volumes-section.tsx     # NEW
        │   ├── details-panel.tsx       # NEW
        │   ├── hover-peek.tsx          # NEW
        │   ├── onboarding.tsx          # NEW
        │   └── stat-row.tsx            # NEW (used by details panel)
        ├── viz/
        │   ├── render.ts               # update: filter-dim
        │   └── viz.tsx                 # update: emit selection, listen to filters
        └── ipc.ts                      # add reveal/trash/fda/fs-watch helpers
```

---

## Task 1: Backend — reveal-in-finder, move-to-trash, FDA check

**Files:**
- Modify: `crates/strata-app/Cargo.toml`
- Modify: `crates/strata-app/src/main.rs`
- Modify: `crates/strata-app/src/commands.rs`
- Create: `crates/strata-app/src/permissions.rs`

- [ ] **Step 1: Add crate deps**

Edit `crates/strata-app/Cargo.toml` `[dependencies]`:

```toml
trash = "5"
notify = "6"
```

- [ ] **Step 2: Implement reveal-in-finder + move-to-trash commands**

Edit `crates/strata-app/src/commands.rs` — append these handlers below the existing ones:

```rust
use std::path::Path;
use std::process::Command;

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to invoke open: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| format!("Failed to trash {path}: {e}"))?;
    Ok(())
}
```

- [ ] **Step 3: Implement Full Disk Access detector**

Write `crates/strata-app/src/permissions.rs`:

```rust
//! Full Disk Access detection.
//!
//! macOS gates `~/Library/Application Support/com.apple.TCC` and similar
//! protected paths behind FDA. We probe by attempting to read a known
//! protected path; if it succeeds, FDA is granted.
//!
//! The check is best-effort. We use `~/Library/Mail` as the canary —
//! reading its directory listing requires FDA on modern macOS.

use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FdaStatus {
    Granted,
    Denied,
    Unknown,
}

pub fn check() -> FdaStatus {
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return FdaStatus::Unknown,
    };
    let canary = PathBuf::from(home).join("Library").join("Mail");
    if !canary.exists() {
        // No Mail directory at all (e.g., user never ran Mail.app). Try
        // ~/Library/Application Support/com.apple.TCC instead.
        return probe_tcc();
    }
    match fs::read_dir(&canary) {
        Ok(_) => FdaStatus::Granted,
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => FdaStatus::Denied,
        Err(_) => FdaStatus::Unknown,
    }
}

fn probe_tcc() -> FdaStatus {
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return FdaStatus::Unknown,
    };
    let tcc = PathBuf::from(home)
        .join("Library/Application Support/com.apple.TCC");
    match fs::read_dir(&tcc) {
        Ok(_) => FdaStatus::Granted,
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => FdaStatus::Denied,
        Err(_) => FdaStatus::Unknown,
    }
}
```

- [ ] **Step 4: Add the FDA command**

Append to `crates/strata-app/src/commands.rs`:

```rust
use crate::permissions::{check as check_fda, FdaStatus};

#[tauri::command]
pub fn check_full_disk_access() -> FdaStatus {
    check_fda()
}

#[tauri::command]
pub fn open_fda_settings() -> Result<(), String> {
    Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        .spawn()
        .map_err(|e| format!("Failed to open Settings: {e}"))?;
    Ok(())
}
```

- [ ] **Step 5: Wire new modules into main.rs**

Replace `crates/strata-app/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod fs_watcher;
mod permissions;
mod scan_runner;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::pick_directory,
            commands::start_scan,
            commands::reveal_in_finder,
            commands::move_to_trash,
            commands::check_full_disk_access,
            commands::open_fda_settings,
            commands::start_watching,
            commands::stop_watching,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Strata");
}
```

(`fs_watcher` and `start_watching` / `stop_watching` are added in Task 2.)

- [ ] **Step 6: Stub fs_watcher so the build passes**

Write `crates/strata-app/src/fs_watcher.rs`:

```rust
//! FSEvents-backed live filesystem watcher. Stub — implemented in Task 2.

#[tauri::command]
pub fn start_watching(_path: String) -> Result<(), String> { Ok(()) }
#[tauri::command]
pub fn stop_watching() -> Result<(), String> { Ok(()) }
```

And in `crates/strata-app/src/commands.rs` re-export the stubs at the top:

```rust
pub use crate::fs_watcher::{start_watching, stop_watching};
```

- [ ] **Step 7: Confirm the app compiles**

Run: `cargo check -p strata-app`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add crates/strata-app/Cargo.toml crates/strata-app/src/
git commit -m "feat(app): reveal/trash/fda commands + fs-watcher stub"
```

---

## Task 2: FSEvents watcher

**Files:**
- Modify: `crates/strata-app/src/fs_watcher.rs`

- [ ] **Step 1: Implement the real watcher**

Replace `crates/strata-app/src/fs_watcher.rs`:

```rust
//! FSEvents-backed live filesystem watcher. Emits `fs-changed` events
//! containing the affected paths. Frontend coalesces and triggers
//! incremental re-scans.

use notify::{recommended_watcher, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatcherState(pub Mutex<Option<RecommendedWatcher>>);

#[derive(serde::Serialize, Clone)]
pub struct FsChange {
    pub path: String,
    pub kind: String,
}

#[tauri::command]
pub fn start_watching(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    *guard = None; // drop any existing watcher first

    let app2 = app.clone();
    let mut watcher = recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            let kind = match ev.kind {
                EventKind::Create(_) => "create",
                EventKind::Modify(_) => "modify",
                EventKind::Remove(_) => "remove",
                _ => "other",
            };
            for p in ev.paths {
                let _ = app2.emit("fs-changed", FsChange {
                    path: p.to_string_lossy().to_string(),
                    kind: kind.to_string(),
                });
            }
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&PathBuf::from(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    *guard = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn stop_watching(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    *guard = None;
    Ok(())
}
```

- [ ] **Step 2: Register the watcher state in main.rs**

Edit `crates/strata-app/src/main.rs`:

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(fs_watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            commands::pick_directory,
            commands::start_scan,
            commands::reveal_in_finder,
            commands::move_to_trash,
            commands::check_full_disk_access,
            commands::open_fda_settings,
            commands::start_watching,
            commands::stop_watching,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Strata");
}
```

- [ ] **Step 3: Confirm build**

Run: `cargo check -p strata-app`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add crates/strata-app/src/
git commit -m "feat(app): real FSEvents watcher with fs-changed events"
```

---

## Task 3: Frontend — IPC additions

**Files:**
- Modify: `crates/strata-app/ui/src/ipc.ts`

- [ ] **Step 1: Add helpers**

Append to `crates/strata-app/ui/src/ipc.ts`:

```typescript
export async function revealInFinder(path: string): Promise<void> {
  await invoke("reveal_in_finder", { path });
}

export async function moveToTrash(path: string): Promise<void> {
  await invoke("move_to_trash", { path });
}

export type FdaStatus = "granted" | "denied" | "unknown";

export async function checkFullDiskAccess(): Promise<FdaStatus> {
  return await invoke<FdaStatus>("check_full_disk_access");
}

export async function openFdaSettings(): Promise<void> {
  await invoke("open_fda_settings");
}

export async function startWatching(path: string): Promise<void> {
  await invoke("start_watching", { path });
}

export async function stopWatching(): Promise<void> {
  await invoke("stop_watching");
}

export interface FsChange {
  path: string;
  kind: "create" | "modify" | "remove" | "other";
}

export function onFsChange(cb: (c: FsChange) => void): Promise<UnlistenFn> {
  return listen<FsChange>("fs-changed", (e) => cb(e.payload));
}
```

- [ ] **Step 2: Confirm TS compiles**

Run: `(cd crates/strata-app/ui && npx tsc --noEmit)`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add crates/strata-app/ui/src/ipc.ts
git commit -m "feat(ui): ipc helpers for reveal/trash/fda/fs-watch"
```

---

## Task 4: Filter and selection stores

**Files:**
- Create: `crates/strata-app/ui/src/stores/filters.ts`
- Create: `crates/strata-app/ui/src/stores/selection.ts`

- [ ] **Step 1: Build the filter store**

Write `crates/strata-app/ui/src/stores/filters.ts`:

```typescript
import { createSignal, createMemo } from "solid-js";
import type { DirNode } from "../types";

export type FilterKey = "stale" | "junk" | "dupes" | "tm_safe";

const [active, setActive] = createSignal<Set<FilterKey>>(new Set());

export function filterStore() {
  return {
    active,
    toggle(key: FilterKey) {
      const cur = new Set(active());
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      setActive(cur);
    },
    clear() { setActive(new Set()); },
  };
}

/// Returns a function that, given a DirNode, decides whether it matches the
/// current active filter set. With NO filters active, every node matches.
export function makeMatcher() {
  return createMemo(() => {
    const set = active();
    if (set.size === 0) return (_n: DirNode) => true;
    return (n: DirNode) => {
      if (set.has("stale") && !isStale(n)) return false;
      if (set.has("junk") && !n.signals.is_known_junk) return false;
      if (set.has("dupes") && n.signals.duplicate_group_id === null) return false;
      if (set.has("tm_safe") && !(isStale(n) && n.signals.is_backed_up_tm)) return false;
      return true;
    };
  });
}

function isStale(n: DirNode): boolean {
  const lu = n.signals.last_used_at ? new Date(n.signals.last_used_at).getTime() : 0;
  const lm = new Date(n.signals.last_modified_at).getTime();
  const ageDays = (Date.now() - Math.max(lu, lm)) / 86_400_000;
  return ageDays > 180;
}
```

- [ ] **Step 2: Build the selection store**

Write `crates/strata-app/ui/src/stores/selection.ts`:

```typescript
import { createSignal } from "solid-js";

const [selectedId, setSelectedId] = createSignal<number | null>(null);

export function selectionStore() {
  return {
    selectedId,
    select(id: number | null) { setSelectedId(id); },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add crates/strata-app/ui/src/stores/
git commit -m "feat(ui): filter and selection stores"
```

---

## Task 5: Sidebar and filter section

**Files:**
- Create: `crates/strata-app/ui/src/components/sidebar.tsx`
- Create: `crates/strata-app/ui/src/components/filters-section.tsx`
- Create: `crates/strata-app/ui/src/components/volumes-section.tsx`

- [ ] **Step 1: Build the volumes section**

Write `crates/strata-app/ui/src/components/volumes-section.tsx`:

```tsx
import type { ScanTree } from "../types";

interface Props {
  tree: ScanTree | null;
  onPick: () => void;
}

export default function VolumesSection(props: Props) {
  return (
    <div style={section}>
      <div style={label}>Volumes</div>
      {props.tree ? (
        <div style={row}>
          <span style={{ color: "#e5e7eb" }}>{shortName(props.tree.source_path)}</span>
          <span style={{ color: "#6b7280", "font-size": "11px" }}>
            {formatBytes(props.tree.nodes[props.tree.root_id].size_bytes)}
          </span>
        </div>
      ) : (
        <button onClick={props.onPick} style={pickBtn}>+ Pick a folder…</button>
      )}
    </div>
  );
}

const section = { padding: "12px 12px 4px" } as const;
const label = {
  color: "#4b5563",
  "font-size": "10px",
  "text-transform": "uppercase",
  "letter-spacing": "1.5px",
  "margin-bottom": "8px",
} as const;
const row = {
  display: "flex", "align-items": "center", "justify-content": "space-between",
  padding: "6px 8px", "border-radius": "6px",
  background: "#13131a",
  "font-size": "12px",
} as const;
const pickBtn = {
  width: "100%",
  background: "transparent",
  border: "1px dashed #2a2a32",
  color: "#9ca3af",
  padding: "8px",
  "border-radius": "6px",
  cursor: "pointer",
  "font-size": "12px",
} as const;

function shortName(p: string): string {
  const parts = p.split("/");
  return parts[parts.length - 1] || p;
}
function formatBytes(b: number): string {
  const u = ["B","KB","MB","GB","TB"];
  let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}
```

- [ ] **Step 2: Build the filters section**

Write `crates/strata-app/ui/src/components/filters-section.tsx`:

```tsx
import { filterStore, type FilterKey } from "../stores/filters";

const FILTERS: { key: FilterKey; name: string; color: string }[] = [
  { key: "stale", name: "Stale", color: "#f59e0b" },
  { key: "junk", name: "Junk", color: "#10b981" },
  { key: "dupes", name: "Duplicates", color: "#ec4899" },
  { key: "tm_safe", name: "Backed-up safe", color: "#3b82f6" },
];

export default function FiltersSection() {
  const store = filterStore();
  return (
    <div style={section}>
      <div style={label}>Filters</div>
      {FILTERS.map((f) => {
        const isOn = () => store.active().has(f.key);
        return (
          <div
            onClick={() => store.toggle(f.key)}
            style={{
              ...row,
              ...(isOn() ? rowOn : {}),
            }}
          >
            <span style={{ display: "flex", "align-items": "center", gap: "8px" }}>
              <span style={{ ...dot, background: f.color, opacity: isOn() ? "1" : "0.4" }} />
              {f.name}
            </span>
            <span style={{ color: "#4b5563", "font-size": "11px" }}>
              {isOn() ? "✓" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const section = { padding: "4px 12px 12px" } as const;
const label = {
  color: "#4b5563",
  "font-size": "10px",
  "text-transform": "uppercase",
  "letter-spacing": "1.5px",
  "margin": "12px 0 8px",
} as const;
const row = {
  display: "flex", "justify-content": "space-between", "align-items": "center",
  padding: "5px 8px",
  "border-radius": "5px",
  cursor: "pointer",
  "font-size": "12px",
  color: "#9ca3af",
  transition: "all 0.15s ease",
} as const;
const rowOn = {
  background: "#13131a",
  color: "#e5e7eb",
} as const;
const dot = {
  width: "8px", height: "8px", "border-radius": "50%",
  display: "inline-block",
} as const;
```

- [ ] **Step 3: Build the sidebar shell**

Write `crates/strata-app/ui/src/components/sidebar.tsx`:

```tsx
import { Show } from "solid-js";
import VolumesSection from "./volumes-section";
import FiltersSection from "./filters-section";
import type { ScanTree } from "../types";

interface Props {
  tree: ScanTree | null;
  visible: boolean;
  onPick: () => void;
}

export default function Sidebar(props: Props) {
  return (
    <Show when={props.visible}>
      <aside style={shell}>
        <VolumesSection tree={props.tree} onPick={props.onPick} />
        <FiltersSection />
      </aside>
    </Show>
  );
}

const shell = {
  width: "200px",
  "min-width": "200px",
  background: "#0a0a0e",
  "border-right": "1px solid #1a1a22",
  display: "flex",
  "flex-direction": "column",
  overflow: "auto",
} as const;
```

- [ ] **Step 4: Commit**

```bash
git add crates/strata-app/ui/src/components/
git commit -m "feat(ui): sidebar with volumes and filters sections"
```

---

## Task 6: Render filter-dim in the canvas

**Files:**
- Modify: `crates/strata-app/ui/src/viz/render.ts`
- Modify: `crates/strata-app/ui/src/viz/viz.tsx`

- [ ] **Step 1: Update render to accept a "matched" predicate**

Edit `crates/strata-app/ui/src/viz/render.ts` — replace the `RenderInput` interface and the body of `render`:

```typescript
export interface RenderInput {
  shapes: Shape[];
  nodesById: Map<number, DirNode>;
  hoveredId: number | null;
  selectedId: number | null;
  isMatched: (n: DirNode) => boolean;
}

export function render(ctx: CanvasRenderingContext2D, input: RenderInput) {
  for (const s of input.shapes) {
    const node = input.nodesById.get(s.id)!;
    const matched = input.isMatched(node);
    ctx.globalAlpha = matched ? 1 : 0.2;
    const fill = colorForNode(node);
    if (s.kind === "rect" && s.rect) {
      drawRect(ctx, s.rect, fill, node, input.hoveredId === s.id || input.selectedId === s.id);
    } else if (s.kind === "arc" && s.arc) {
      drawArc(ctx, s.arc, fill, input.hoveredId === s.id || input.selectedId === s.id);
    } else if (s.kind === "morph" && s.rectFrom && s.arcTo && s.morphT !== undefined) {
      const tBase = matched ? 1 : 0.2;
      ctx.globalAlpha = tBase * (1 - s.morphT);
      drawRect(ctx, s.rectFrom, fill, node, false);
      ctx.globalAlpha = tBase * s.morphT;
      drawArc(ctx, s.arcTo, fill, false);
    }
  }
  ctx.globalAlpha = 1;
}
```

- [ ] **Step 2: Update Viz to feed matcher and selection**

Edit `crates/strata-app/ui/src/viz/viz.tsx` — at the top imports, add:

```typescript
import { makeMatcher } from "../stores/filters";
import { selectionStore } from "../stores/selection";
```

Inside the component, after `const [mode, setMode] = ...`, add:

```typescript
const matcher = makeMatcher();
const sel = selectionStore();
```

Update every `render(ctx, { ... })` call to include `selectedId` and `isMatched`:

```typescript
render(ctx, {
  shapes: shapesForMode(mode()),
  nodesById,
  hoveredId: hoveredId(),
  selectedId: sel.selectedId(),
  isMatched: matcher(),
});
```

(There are two such calls: one in `drawCurrent`, one inside the morph `tick`.)

Also update `onClick` so that clicking a region BOTH selects it (opens details panel) AND zooms into it when it has children (spec §5: "Click region → smooth zoom into that subtree"). Clicking a leaf only selects.

```typescript
function onClick() {
  const id = hoveredId();
  if (id === null) {
    sel.select(null);
    return;
  }
  sel.select(id);
  const node = nodesById.get(id);
  if (!node || node.children.length === 0) return;
  // Has children: zoom in. zoomRoot is already a Plan 2 signal driving the layout.
  setZoomRoot(id);
}
```

Add re-render reactivity for selection and matcher:

```typescript
createEffect(() => {
  sel.selectedId();
  matcher();
  if (morphFrom === null) drawCurrent();
});
```

- [ ] **Step 3: Run dev and verify**

Run: `cargo tauri dev --config crates/strata-app/tauri.conf.json`
Expected: ticking a filter dims non-matching regions to ~20% opacity. Clicking a region with children selects it (highlight ring + opens details panel) AND zooms into it. Clicking a leaf only selects.

- [ ] **Step 4: Commit**

```bash
git add crates/strata-app/ui/src/viz/
git commit -m "feat(viz): filter dim + selection ring"
```

---

## Task 7: Hover-peek tooltip

**Files:**
- Create: `crates/strata-app/ui/src/components/hover-peek.tsx`
- Modify: `crates/strata-app/ui/src/viz/viz.tsx`

- [ ] **Step 1: Build the hover-peek component**

Write `crates/strata-app/ui/src/components/hover-peek.tsx`:

```tsx
import type { DirNode } from "../types";

interface Props {
  node: DirNode | null;
  x: number;
  y: number;
}

export default function HoverPeek(props: Props) {
  if (!props.node) return null;
  const n = props.node;
  return (
    <div style={{ ...wrap, left: clamp(props.x + 12, 8, window.innerWidth - 240), top: clamp(props.y + 12, 8, window.innerHeight - 100) }}>
      <div style={name}>{n.name}</div>
      <div style={size}>{formatBytes(n.size_bytes)} · {n.file_count.toLocaleString()} files</div>
      <div style={meta}>
        <span>Used {n.signals.last_used_at ? relative(n.signals.last_used_at) : "never tracked"}</span>
      </div>
      <div style={badges}>
        {n.signals.is_known_junk && <span style={{ ...badge, background: "#10b981", color: "#022c22" }}>JUNK</span>}
        {n.signals.is_backed_up_tm && <span style={{ ...badge, background: "#3b82f6", color: "#0a1f44" }}>TM</span>}
        {n.signals.duplicate_group_id !== null && <span style={{ ...badge, background: "#ec4899", color: "#3a0822" }}>DUPE</span>}
        {isStale(n) && <span style={{ ...badge, background: "#f59e0b", color: "#3a2400" }}>STALE</span>}
      </div>
    </div>
  );
}

const wrap = {
  position: "fixed",
  background: "rgba(13,13,18,0.96)",
  "backdrop-filter": "blur(12px)",
  border: "1px solid #1a1a22",
  "border-radius": "8px",
  padding: "10px 12px",
  "box-shadow": "0 8px 24px rgba(0,0,0,0.4)",
  "pointer-events": "none",
  "z-index": 100,
  "min-width": "180px",
  "max-width": "240px",
} as const;
const name = {
  color: "#fff",
  "font-weight": 600,
  "font-size": "13px",
  "margin-bottom": "2px",
  "white-space": "nowrap",
  overflow: "hidden",
  "text-overflow": "ellipsis",
} as const;
const size = {
  color: "#9ca3af",
  "font-size": "11px",
  "font-family": "SF Mono, monospace",
  "margin-bottom": "6px",
} as const;
const meta = {
  color: "#6b7280",
  "font-size": "11px",
  "margin-bottom": "8px",
} as const;
const badges = {
  display: "flex", "flex-wrap": "wrap", gap: "4px",
} as const;
const badge = {
  padding: "1px 6px",
  "border-radius": "3px",
  "font-size": "9px",
  "font-weight": 700,
  "letter-spacing": "0.5px",
} as const;

function isStale(n: DirNode): boolean {
  const lu = n.signals.last_used_at ? new Date(n.signals.last_used_at).getTime() : 0;
  const lm = new Date(n.signals.last_modified_at).getTime();
  return (Date.now() - Math.max(lu, lm)) / 86_400_000 > 180;
}
function relative(iso: string): string {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (days < 1) return "today";
  if (days < 30) return `${Math.round(days)}d ago`;
  if (days < 365) return `${Math.round(days/30)}mo ago`;
  return `${(days/365).toFixed(1)}y ago`;
}
function formatBytes(b: number): string {
  const u = ["B","KB","MB","GB","TB"];
  let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
```

- [ ] **Step 2: Wire HoverPeek into Viz**

Edit `crates/strata-app/ui/src/viz/viz.tsx` — add to imports:

```typescript
import HoverPeek from "../components/hover-peek";
```

Add a signal for cursor position:

```typescript
const [cursor, setCursor] = createSignal<{ x: number; y: number } | null>(null);
```

Update `onMove` to also store the cursor:

```typescript
function onMove(e: MouseEvent) {
  if (!canvasRef || morphFrom !== null) return;
  const r = canvasRef.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  const id = mode() === "treemap" ? hitTestRects(rects, x, y) : hitTestArcs(arcs, x, y);
  setHoveredId(id);
  setCursor({ x: e.clientX, y: e.clientY });
}
```

Update `onMouseLeave` to clear cursor:

```typescript
onMouseLeave={() => { setHoveredId(null); setCursor(null); }}
```

In the JSX returned by Viz, after the toggle, add the peek:

```tsx
{hoveredId() !== null && cursor() && (
  <HoverPeek
    node={nodesById.get(hoveredId()!) ?? null}
    x={cursor()!.x}
    y={cursor()!.y}
  />
)}
```

- [ ] **Step 3: Run dev and verify**

Run: `cargo tauri dev --config crates/strata-app/tauri.conf.json`
Expected: hovering any region shows a floating peek with name, size, badges. Position follows cursor without going off-screen.

- [ ] **Step 4: Commit**

```bash
git add crates/strata-app/ui/src/
git commit -m "feat(ui): hover-peek tooltip"
```

---

## Task 8: Details panel

**Files:**
- Create: `crates/strata-app/ui/src/components/stat-row.tsx`
- Create: `crates/strata-app/ui/src/components/details-panel.tsx`
- Modify: `crates/strata-app/ui/src/app.tsx`

- [ ] **Step 1: Build the stat-row component**

Write `crates/strata-app/ui/src/components/stat-row.tsx`:

```tsx
import type { JSX } from "solid-js";

interface Props {
  label: string;
  value: JSX.Element | string;
  emphasis?: boolean;
}

export default function StatRow(props: Props) {
  return (
    <div style={row}>
      <span style={lbl}>{props.label}</span>
      <span style={{ ...val, ...(props.emphasis ? { color: "#fff", "font-weight": 600 } : {}) }}>
        {props.value}
      </span>
    </div>
  );
}

const row = {
  display: "flex",
  "justify-content": "space-between",
  "align-items": "center",
  padding: "8px 0",
  "border-bottom": "1px solid #1a1a22",
  "font-size": "12px",
} as const;
const lbl = { color: "#6b7280" } as const;
const val = {
  color: "#d1d5db",
  "font-family": "SF Mono, monospace",
  "font-size": "11px",
} as const;
```

- [ ] **Step 2: Build the details panel**

Write `crates/strata-app/ui/src/components/details-panel.tsx`:

```tsx
import { Show, createSignal } from "solid-js";
import type { DirNode, ScanTree } from "../types";
import StatRow from "./stat-row";
import { revealInFinder, moveToTrash } from "../ipc";

interface Props {
  tree: ScanTree;
  node: DirNode | null;
  onClose: () => void;
  onAfterTrash: (path: string) => void;
}

export default function DetailsPanel(props: Props) {
  const [acting, setActing] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  return (
    <Show when={props.node}>
      {(n) => (
        <aside style={shell}>
          <div style={header}>
            <button onClick={props.onClose} style={closeBtn}>✕</button>
          </div>
          <div style={body}>
            <div style={name}>{n().name}</div>
            <div style={path}>{n().path}</div>
            <div style={size}>{formatBytes(n().size_bytes)}</div>
            <div style={subSize}>{n().file_count.toLocaleString()} files</div>

            <div style={statBlock}>
              <StatRow label="Last opened" value={n().signals.last_used_at ? humanDate(n().signals.last_used_at!) : "Not tracked"} />
              <StatRow label="Last modified" value={humanDate(n().signals.last_modified_at)} />
              <StatRow label="Time Machine" value={n().signals.is_backed_up_tm ? "✓ Backed up" : "Not backed up"} />
              <StatRow label="iCloud" value={n().signals.is_in_icloud ? "✓ In iCloud" : "Local only"} />
              <StatRow label="Duplicate" value={n().signals.duplicate_group_id !== null ? `Group ${n().signals.duplicate_group_id}` : "—"} />
              <StatRow label="Junk pattern" value={n().signals.is_known_junk ? "✓ Matches junk pattern" : "—"} />
            </div>

            <div style={actions}>
              <button
                style={btnSecondary}
                disabled={acting()}
                onClick={async () => {
                  setError(null);
                  setActing(true);
                  try { await revealInFinder(n().path); } catch (e: any) { setError(String(e)); }
                  setActing(false);
                }}
              >Reveal in Finder</button>
              <button
                style={btnDanger}
                disabled={acting()}
                onClick={async () => {
                  if (!confirm(`Move ${n().name} to Trash?`)) return;
                  setError(null);
                  setActing(true);
                  try {
                    await moveToTrash(n().path);
                    props.onAfterTrash(n().path);
                  } catch (e: any) {
                    setError(String(e));
                  }
                  setActing(false);
                }}
              >Move to Trash</button>
            </div>

            <Show when={error()}>
              <div style={errBox}>{error()}</div>
            </Show>
          </div>
        </aside>
      )}
    </Show>
  );
}

function humanDate(iso: string): string {
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86_400_000;
  if (days < 1) return "today";
  if (days < 30) return `${Math.round(days)} days ago`;
  if (days < 365) return `${Math.round(days/30)} months ago`;
  return `${(days/365).toFixed(1)} years ago`;
}

function formatBytes(b: number): string {
  const u = ["B","KB","MB","GB","TB"];
  let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

const shell = {
  width: "320px",
  "min-width": "320px",
  background: "#0a0a0e",
  "border-left": "1px solid #1a1a22",
  display: "flex",
  "flex-direction": "column",
  animation: "slideInRight 0.2s ease-out",
} as const;
const header = {
  display: "flex",
  "justify-content": "flex-end",
  padding: "10px",
} as const;
const closeBtn = {
  background: "transparent",
  border: "none",
  color: "#6b7280",
  cursor: "pointer",
  "font-size": "16px",
  padding: "2px 6px",
} as const;
const body = { padding: "0 16px 16px" } as const;
const name = {
  "font-size": "16px",
  "font-weight": 700,
  color: "#fff",
  "letter-spacing": "-0.3px",
  "margin-bottom": "2px",
  "word-break": "break-word",
} as const;
const path = {
  "font-size": "11px",
  color: "#6b7280",
  "font-family": "SF Mono, monospace",
  "margin-bottom": "16px",
  "word-break": "break-all",
} as const;
const size = {
  "font-size": "26px",
  "font-weight": 700,
  color: "#fff",
  "letter-spacing": "-1px",
  "font-variant-numeric": "tabular-nums",
} as const;
const subSize = {
  color: "#6b7280",
  "font-size": "11px",
  "font-family": "SF Mono, monospace",
  "margin-bottom": "20px",
} as const;
const statBlock = { "margin-bottom": "20px" } as const;
const actions = {
  display: "flex",
  "flex-direction": "column",
  gap: "8px",
} as const;
const btnBase = {
  padding: "9px 14px",
  "border-radius": "6px",
  "font-size": "12px",
  "font-weight": 600,
  cursor: "pointer",
  border: "none",
  width: "100%",
} as const;
const btnSecondary = {
  ...btnBase,
  background: "#13131a",
  color: "#e5e7eb",
  border: "1px solid #1a1a22",
} as const;
const btnDanger = {
  ...btnBase,
  background: "#dc2626",
  color: "#fff",
} as const;
const errBox = {
  "margin-top": "12px",
  padding: "10px",
  background: "#3a0a0a",
  border: "1px solid #7f1d1d",
  "border-radius": "6px",
  color: "#fca5a5",
  "font-size": "11px",
} as const;
```

Add the slide-in keyframes to `crates/strata-app/ui/index.html` `<style>`:

```css
@keyframes slideInRight {
  from { transform: translateX(20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```

- [ ] **Step 3: Wire the panel into app.tsx**

Replace `crates/strata-app/ui/src/app.tsx`:

```tsx
import { createSignal, onMount, Show, createMemo } from "solid-js";
import {
  pickDirectory, startScan, onScanProgress, onScanComplete, onScanError,
  startWatching,
} from "./ipc";
import type { ProgressEvent, ScanTree } from "./types";
import Viz from "./viz/viz";
import ProgressBar from "./components/progress-bar";
import Breadcrumb from "./components/breadcrumb";
import Sidebar from "./components/sidebar";
import DetailsPanel from "./components/details-panel";
import { selectionStore } from "./stores/selection";

export default function App() {
  const [event, setEvent] = createSignal<ProgressEvent | null>(null);
  const [tree, setTree] = createSignal<ScanTree | null>(null);
  const [scanning, setScanning] = createSignal(false);
  const [currentRoot, setCurrentRoot] = createSignal<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = createSignal(true);

  const sel = selectionStore();
  const selectedNode = createMemo(() => {
    const t = tree();
    const id = sel.selectedId();
    if (!t || id === null) return null;
    return t.nodes[id] ?? null;
  });

  onMount(async () => {
    await onScanProgress((ev) => setEvent(ev));
    await onScanComplete(async (t) => {
      setTree(t);
      setCurrentRoot(t.root_id);
      setScanning(false);
      try { await startWatching(t.source_path); } catch {}
    });
    await onScanError((msg) => {
      setScanning(false);
      setEvent({ event: "error", message: msg });
    });
  });

  async function handlePick() {
    const p = await pickDirectory();
    if (!p) return;
    setTree(null);
    setScanning(true);
    setEvent(null);
    sel.select(null);
    await startScan(p);
  }

  return (
    <div style={{ height: "100vh", display: "flex", "flex-direction": "column" }}>
      <header style={header}>
        <button onClick={() => setSidebarOpen(!sidebarOpen())} style={iconBtn} title="Toggle sidebar">⌘</button>
        <span style={{ "font-weight": 700, "letter-spacing": "-0.3px" }}>Strata</span>
        <Show when={tree() && currentRoot() !== null}>
          <Breadcrumb tree={tree()!} currentId={currentRoot()!} onJumpTo={setCurrentRoot} />
        </Show>
        <div style={{ "margin-left": "auto" }}>
          <ProgressBar event={event()} active={scanning()} />
        </div>
      </header>
      <div style={{ flex: 1, display: "flex", "min-height": 0 }}>
        <Sidebar tree={tree()} visible={sidebarOpen()} onPick={handlePick} />
        <main style={{ flex: 1, display: "flex", "flex-direction": "column", "min-width": 0 }}>
          <Show when={!tree() && !scanning()}>
            <div style={emptyWrap}>
              <h2 style={{ margin: "0 0 8px", "font-weight": 600, "letter-spacing": "-0.5px" }}>Welcome to Strata</h2>
              <p style={{ margin: "0 0 24px", color: "#6b7280", "font-size": "14px" }}>
                Pick a folder to see what's eating your disk.
              </p>
              <button onClick={handlePick} style={btnPrimary}>Choose folder…</button>
            </div>
          </Show>
          <Show when={tree() && currentRoot() !== null}>
            <Viz tree={tree()!} initialRootId={currentRoot()!} onZoomChange={setCurrentRoot} />
          </Show>
        </main>
        <Show when={selectedNode()}>
          <DetailsPanel
            tree={tree()!}
            node={selectedNode()}
            onClose={() => sel.select(null)}
            onAfterTrash={() => sel.select(null)}
          />
        </Show>
      </div>
    </div>
  );
}

const header = {
  display: "flex", "align-items": "center", gap: "12px",
  padding: "8px 12px",
  background: "#0d0d12",
  "border-bottom": "1px solid #1a1a22",
  "font-size": "12px",
} as const;
const iconBtn = {
  background: "transparent",
  border: "1px solid #1a1a22",
  color: "#9ca3af",
  width: "26px", height: "26px",
  "border-radius": "5px",
  cursor: "pointer",
  "font-size": "12px",
} as const;
const emptyWrap = {
  flex: 1,
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  "justify-content": "center",
} as const;
const btnPrimary = {
  background: "#6c8cff", color: "#fff", border: "none",
  padding: "10px 22px", "border-radius": "6px",
  "font-size": "13px", "font-weight": 600, cursor: "pointer",
} as const;
```

- [ ] **Step 4: Run dev and verify the full flow**

Run: `cargo tauri dev --config crates/strata-app/tauri.conf.json`
Expected:
- Sidebar visible on left with volumes + filters.
- Click ⌘ button toggles sidebar visibility.
- Pick a folder → scan runs → treemap appears.
- Click any region → details panel slides in from the right.
- Click "Reveal in Finder" → opens Finder.
- Click "Move to Trash" → confirms, moves, panel closes.
- Toggle filters → non-matching regions dim.

- [ ] **Step 5: Commit**

```bash
git add crates/strata-app/ui/
git commit -m "feat(ui): details panel + sidebar shell + actions"
```

---

## Task 9: Onboarding screen for Full Disk Access

**Files:**
- Create: `crates/strata-app/ui/src/components/onboarding.tsx`
- Modify: `crates/strata-app/ui/src/app.tsx`

- [ ] **Step 1: Build the onboarding component**

Write `crates/strata-app/ui/src/components/onboarding.tsx`:

```tsx
import { createSignal, onMount, onCleanup } from "solid-js";
import { checkFullDiskAccess, openFdaSettings, type FdaStatus } from "../ipc";

interface Props {
  onGranted: () => void;
}

export default function Onboarding(props: Props) {
  const [status, setStatus] = createSignal<FdaStatus>("unknown");
  let timer: number | undefined;

  async function refresh() {
    const s = await checkFullDiskAccess();
    setStatus(s);
    if (s === "granted") props.onGranted();
  }

  onMount(() => {
    refresh();
    timer = window.setInterval(refresh, 1500);
  });
  onCleanup(() => {
    if (timer !== undefined) clearInterval(timer);
  });

  return (
    <div style={wrap}>
      <div style={card}>
        <h2 style={title}>Strata needs Full Disk Access</h2>
        <p style={para}>
          To find the folders you've forgotten, Strata needs to read your
          entire home directory — including system caches, app data, and
          hidden files where bloat usually hides.
        </p>
        <p style={paraSmall}>
          We never send anything off your machine. There's no telemetry,
          no analytics, no cloud sync. Everything stays local.
        </p>
        <div style={steps}>
          <ol style={ol}>
            <li>Click "Open System Settings" below.</li>
            <li>Find <strong>Strata</strong> in the list and toggle it on.</li>
            <li>Strata will detect the change automatically.</li>
          </ol>
        </div>
        <div style={actions}>
          <button onClick={openFdaSettings} style={btnPrimary}>Open System Settings…</button>
          <button onClick={refresh} style={btnSecondary}>I've granted it</button>
        </div>
        <div style={statusLine}>
          {status() === "granted" && <span style={{ color: "#10b981" }}>✓ Granted — loading…</span>}
          {status() === "denied" && <span style={{ color: "#ef4444" }}>Not yet granted</span>}
          {status() === "unknown" && <span style={{ color: "#6b7280" }}>Checking…</span>}
        </div>
      </div>
    </div>
  );
}

const wrap = {
  flex: 1,
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  background: "#08080b",
} as const;
const card = {
  "max-width": "460px",
  padding: "32px",
  background: "#0d0d12",
  border: "1px solid #1a1a22",
  "border-radius": "12px",
} as const;
const title = {
  margin: "0 0 12px",
  "font-size": "20px",
  "font-weight": 700,
  "letter-spacing": "-0.4px",
  color: "#fff",
} as const;
const para = {
  margin: "0 0 12px",
  color: "#9ca3af",
  "font-size": "13px",
  "line-height": 1.55,
} as const;
const paraSmall = {
  margin: "0 0 20px",
  color: "#6b7280",
  "font-size": "12px",
  "line-height": 1.55,
} as const;
const steps = {
  background: "#0a0a0e",
  border: "1px solid #1a1a22",
  "border-radius": "8px",
  padding: "12px 16px 12px 32px",
  "margin-bottom": "20px",
} as const;
const ol = {
  margin: 0, padding: 0,
  color: "#9ca3af",
  "font-size": "13px",
  "line-height": 1.7,
} as const;
const actions = {
  display: "flex",
  gap: "8px",
  "margin-bottom": "16px",
} as const;
const btnBase = {
  padding: "8px 14px",
  "border-radius": "6px",
  "font-size": "12px",
  "font-weight": 600,
  cursor: "pointer",
  border: "none",
} as const;
const btnPrimary = {
  ...btnBase,
  background: "#6c8cff",
  color: "#fff",
} as const;
const btnSecondary = {
  ...btnBase,
  background: "#13131a",
  color: "#e5e7eb",
  border: "1px solid #1a1a22",
} as const;
const statusLine = {
  "font-size": "11px",
  "font-family": "SF Mono, monospace",
} as const;
```

- [ ] **Step 2: Gate the main app behind onboarding**

Edit `crates/strata-app/ui/src/app.tsx` — add at the top:

```typescript
import Onboarding from "./components/onboarding";
import { checkFullDiskAccess } from "./ipc";
```

Add a signal:

```typescript
const [hasFda, setHasFda] = createSignal<boolean>(false);
const [fdaChecked, setFdaChecked] = createSignal<boolean>(false);
```

Inside `onMount`, before subscribing to events:

```typescript
const initial = await checkFullDiskAccess();
setHasFda(initial === "granted");
setFdaChecked(true);
```

Wrap the entire return body so onboarding shows until granted:

```tsx
return (
  <Show when={hasFda()} fallback={<Onboarding onGranted={() => setHasFda(true)} />}>
    {/* ... existing layout ... */}
  </Show>
);
```

- [ ] **Step 3: Verify onboarding flow**

To test in dev, you can deny FDA: in System Settings → Privacy & Security → Full Disk Access, remove `cargo` / your terminal / `Strata` if present, then run `cargo tauri dev`.

Expected: onboarding screen appears; clicking "Open System Settings" deep-links into the right pane; granting access in System Settings causes the app to advance to the main view within ~1.5s (the polling interval).

- [ ] **Step 4: Commit**

```bash
git add crates/strata-app/ui/src/components/onboarding.tsx crates/strata-app/ui/src/app.tsx
git commit -m "feat(ui): full-disk-access onboarding flow"
```

---

## Task 10: FSEvents-driven incremental updates

**Files:**
- Modify: `crates/strata-app/ui/src/app.tsx`

For v1 we keep this simple: when the watcher emits a change anywhere under the scanned root, we debounce 1.5s and trigger a full rescan. Real incremental updates (only re-walk changed subtrees) are deferred to v1.1.

- [ ] **Step 1: Add the debounced rescan listener**

Edit `crates/strata-app/ui/src/app.tsx` — add to imports:

```typescript
import { onFsChange, type FsChange } from "./ipc";
```

Inside `onMount`, after the existing event subscriptions, add:

```typescript
let rescanTimer: number | undefined;
await onFsChange((_c: FsChange) => {
  if (rescanTimer !== undefined) clearTimeout(rescanTimer);
  rescanTimer = window.setTimeout(() => {
    const t = tree();
    if (!t || scanning()) return;
    setScanning(true);
    setEvent({ event: "walk_started", root: t.source_path });
    startScan(t.source_path);
  }, 1500);
});
```

- [ ] **Step 2: Verify incrementally**

Run dev, scan a folder, then in Finder/terminal create or delete a file under the scanned tree. Within 1.5s, the scan should re-run and the viz update.

- [ ] **Step 3: Commit**

```bash
git add crates/strata-app/ui/src/app.tsx
git commit -m "feat(ui): debounced rescan on FSEvents change"
```

---

## Task 11: Final polish — keyboard shortcuts, focus styles, ESC behavior, manual rescan, right-click menu

**Files:**
- Modify: `crates/strata-app/ui/src/app.tsx`
- Modify: `crates/strata-app/ui/src/viz/viz.tsx` (right-click context menu)

- [ ] **Step 1: Add global keyboard shortcuts**

In `crates/strata-app/ui/src/app.tsx`, ensure `onCleanup` is imported alongside `onMount` from `solid-js` (e.g., `import { onMount, onCleanup, createSignal } from "solid-js";`).

Inside `onMount`, after existing subscriptions:

```typescript
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    // Priority 1: close details panel if open.
    if (sel.selectedId() !== null) {
      sel.select(null);
      e.preventDefault();
      return;
    }
    // Priority 2: zoom out one level (spec §4: "ESC zooms out one level").
    const t = tree();
    if (t && zoomRoot() !== t.root_id) {
      const node = t.nodes[zoomRoot()];
      if (node && node.parent_id !== null && node.parent_id !== undefined) {
        setZoomRoot(node.parent_id);
        e.preventDefault();
      }
    }
  } else if ((e.metaKey || e.ctrlKey) && e.key === "1") {
    setSidebarOpen(!sidebarOpen());
    e.preventDefault();
  } else if ((e.metaKey || e.ctrlKey) && e.key === "o") {
    handlePick();
    e.preventDefault();
  } else if ((e.metaKey || e.ctrlKey) && e.key === "r") {
    // ⌘R: manual rescan of the current root path.
    handleRescan();
    e.preventDefault();
  }
};
window.addEventListener("keydown", onKey);
onCleanup(() => window.removeEventListener("keydown", onKey));
```

- [ ] **Step 2: Add manual rescan button + handler**

Spec §4 shows a `↻ Rescan` button in the title bar, and §7 v1 scope explicitly includes "Manual rescan button for forced full refresh".

In `app.tsx`, add a signal for the last-scanned path and a `handleRescan` function:

```typescript
const [lastScannedPath, setLastScannedPath] = createSignal<string | null>(null);

async function handleRescan() {
  const p = lastScannedPath();
  if (!p) return;
  // Reuse the same start_scan command as the initial pick.
  await startScan(p);
}
```

Wherever the existing `handlePick()` calls `startScan(path)`, also call `setLastScannedPath(path)` immediately after a successful pick so the rescan button knows what to re-scan.

Add the button to the title-bar JSX, next to the path label:

```tsx
<button
  onClick={handleRescan}
  disabled={!lastScannedPath() || scanning()}
  title="Rescan current folder (⌘R)"
  style={{ "margin-left": "8px" }}
>↻ Rescan</button>
```

(`scanning()` should already be defined from Plan 2 Task 8's progress wiring; if not, derive it from the presence of an in-flight scan-progress event stream.)

- [ ] **Step 3: Add right-click context menu in the viz**

Spec §5 Interaction: "Right-click region → context menu (Reveal in Finder, Move to Trash, Copy path)."

In `crates/strata-app/ui/src/viz/viz.tsx`, add a context-menu signal at the top of the `Viz` component:

```typescript
const [ctxMenu, setCtxMenu] = createSignal<{ x: number; y: number; nodeId: number } | null>(null);
```

On the canvas element, add an `oncontextmenu` handler:

```tsx
oncontextmenu={(e) => {
  e.preventDefault();
  const id = hoveredId();
  if (id === null) { setCtxMenu(null); return; }
  setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: id });
}}
```

Render the menu (only when present) as a fixed-positioned panel at `(x, y)`, dismissed on outside-click or ESC. Each entry calls the corresponding Tauri command from `ipc.ts` (`revealInFinder`, `moveToTrash`, plus a `navigator.clipboard.writeText(node.path)` for Copy path):

```tsx
<Show when={ctxMenu()}>
  {(m) => {
    const node = nodesById.get(m().nodeId);
    if (!node) return null;
    return (
      <div
        style={{
          position: "fixed",
          left: `${m().x}px`,
          top: `${m().y}px`,
          background: "#0d0d12",
          border: "1px solid #1a1a22",
          padding: "4px 0",
          "border-radius": "6px",
          "box-shadow": "0 8px 24px rgba(0,0,0,0.5)",
          "z-index": 100,
          "min-width": "180px",
        }}
        onMouseLeave={() => setCtxMenu(null)}
      >
        <button class="ctx-item" onClick={() => { revealInFinder(node.path); setCtxMenu(null); }}>Reveal in Finder</button>
        <button class="ctx-item" onClick={async () => { await moveToTrash(node.path); setCtxMenu(null); }}>Move to Trash…</button>
        <button class="ctx-item" onClick={() => { navigator.clipboard.writeText(node.path); setCtxMenu(null); }}>Copy path</button>
      </div>
    );
  }}
</Show>
```

Add a `.ctx-item` style in `index.html`'s `<style>`:

```css
.ctx-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 12px;
  background: transparent;
  border: 0;
  color: #d8d8e0;
  font-size: 13px;
  cursor: pointer;
}
.ctx-item:hover { background: #1a1a22; }
```

Also extend the `keydown` handler in app.tsx so ESC dismisses an open context menu (highest priority — before details-panel close and zoom-out). Track a global signal or dispatch via a window event; the simplest pattern is a module-level `createSignal` exported from `viz.tsx`.

- [ ] **Step 4: Add focus styles**

In `index.html`'s `<style>`, append:

```css
button:focus-visible {
  outline: 2px solid #6c8cff;
  outline-offset: 2px;
}
button { transition: transform 0.1s ease, opacity 0.15s ease; }
button:active:not(:disabled) { transform: translateY(1px); }
button:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 5: Verify**

Run dev. Confirm:
- ESC closes details panel (priority 1) and, with no panel open, zooms out one level (priority 2).
- ⌘1 toggles sidebar.
- ⌘O opens folder picker.
- ⌘R rescans the current folder; the `↻ Rescan` title-bar button does the same.
- Right-clicking a region pops the Reveal/Trash/Copy-path menu; outside-click or ESC dismisses it.

- [ ] **Step 6: Commit**

```bash
git add crates/strata-app/ui/
git commit -m "feat(ui): keyboard shortcuts + manual rescan + right-click menu + focus polish"
```

---

## Task 12: Build, smoke-test, push

**Files:**
- (No new files; this is a release rehearsal.)

- [ ] **Step 1: Run a full-suite cargo test**

Run: `cargo test --workspace`
Expected: all tests pass (28 from Plan 1 still green; Plan 2 + 3 added no new Rust unit tests).

- [ ] **Step 2: TS type check**

Run: `(cd crates/strata-app/ui && npx tsc --noEmit)`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `cargo tauri build --config crates/strata-app/tauri.conf.json`
Expected: a `.app` bundle is produced under `target/release/bundle/macos/Strata.app`. (`.dmg` requires real `icon.icns`; you may see a warning — fine for v1 dev builds.)

Manually open the `.app`, repeat the smoke-test from Plan 2 Task 9 plus:
- Onboarding screen appears if FDA not granted.
- Sidebar collapses with ⌘1.
- Click region with children → details panel slides in AND viz zooms in.
- Click leaf → details panel slides in (no zoom).
- Reveal in Finder works.
- Move to Trash works (file lands in macOS Trash).
- Right-click region → context menu (Reveal / Trash / Copy path).
- ESC: closes panel if open; otherwise zooms out one level.
- ⌘R / `↻ Rescan` button performs a full re-scan of the current root.

- [ ] **Step 4: Push**

```bash
git push origin master
```

---

## Plan 3 done — Strata v1 ships

Strata is now a complete macOS disk-space viewer. Pick a folder, see your disk as a beautiful morphing treemap ↔ sunburst with a collapsible sidebar of volumes and filters, a slide-in details panel showing all six signals plus Reveal/Trash actions, hover-peek tooltips, FSEvents-driven live updates, and a polished Full Disk Access onboarding flow.

**What's intentionally not in v1 (per spec):**
- Light mode (deferred to v1.1)
- Quarantine-with-undo (v1.1; v1 uses system Trash)
- Apps-unused via LaunchServices (v1.5)
- External volume scanning by default (v1: opt-in only)
- Incremental rescan that only walks changed subtrees (v1: full rescan)

**Codesigning / notarization:** the produced `.app` is unsigned. Distribution requires an Apple Developer ID — out of scope for the implementation plan, but the path is straightforward (`xcrun notarytool` after `codesign`).
