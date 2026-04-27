# Strata Plan 2 — Tauri Shell + Viz Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the Plan 1 scanner in a Tauri desktop app that opens a window, lets the user pick a directory, scans it with live progress, and renders the result as a morphing treemap ↔ sunburst with click-to-zoom and the dark-moody color encoding from the spec. UI is intentionally rough at this stage — Plan 3 adds the sidebar, details panel, and polish.

**Architecture:** Rust crate `strata-app` consumes `strata-scan` as a library. Tauri commands (`pick_directory`, `start_scan`) expose the scanner to the WebView. Progress events stream over Tauri's event system. Frontend is a single Vite + TypeScript app that uses D3 (`d3-hierarchy`, `d3-shape`, `d3-interpolate`) to compute treemap and sunburst layouts on the same hierarchy and morph between them via Canvas-2D rendering with stable per-node identity.

**Tech Stack:**
- Tauri 2.x
- Rust crates: `tauri`, `serde`, `tokio`
- Frontend: TypeScript, Vite, D3 (`d3-hierarchy`, `d3-color`, `d3-interpolate`, `d3-scale`)
- Solid.js for reactivity (small, fast, fits one-window app)
- No CSS framework

**Depends on:** Plan 1 (scanner crate `strata-scan` complete and committed).

---

## File Structure

```
qdisk/
├── Cargo.toml                          # update workspace members
├── crates/
│   ├── strata-scan/                    # from Plan 1
│   └── strata-app/                     # NEW
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       ├── build.rs
│       ├── icons/                      # placeholder set
│       ├── src/
│       │   ├── main.rs                 # tauri::Builder, command registration
│       │   ├── commands.rs             # pick_directory, start_scan
│       │   └── scan_runner.rs          # spawns scan in background, emits events
│       └── ui/                         # Vite frontend
│           ├── index.html
│           ├── package.json
│           ├── vite.config.ts
│           ├── tsconfig.json
│           ├── src/
│           │   ├── main.ts             # entry; mounts Solid root
│           │   ├── app.tsx             # top-level component
│           │   ├── ipc.ts              # invoke + listen wrappers
│           │   ├── types.ts            # mirrors model.rs
│           │   ├── colors.ts           # color encoding (cool→hot, stale→deep)
│           │   ├── viz/
│           │   │   ├── canvas.ts       # canvas setup, hi-DPI, event loop
│           │   │   ├── hierarchy.ts    # builds d3.hierarchy from ScanTree
│           │   │   ├── layout-treemap.ts
│           │   │   ├── layout-sunburst.ts
│           │   │   ├── morph.ts        # interpolate layouts during toggle
│           │   │   ├── render.ts       # draws current frame
│           │   │   ├── hit-test.ts     # given (x,y), find node id
│           │   │   └── viz.tsx         # Solid wrapper, owns ref + state
│           │   └── components/
│           │       ├── toggle.tsx      # sunburst | treemap pill
│           │       ├── breadcrumb.tsx
│           │       └── progress-bar.tsx
│           └── public/
└── docs/superpowers/plans/
    └── 2026-04-27-plan-2-tauri-shell-and-viz.md
```

---

## Task 1: Add Tauri scaffold to workspace

**Files:**
- Modify: `Cargo.toml`
- Create: `crates/strata-app/Cargo.toml`
- Create: `crates/strata-app/build.rs`
- Create: `crates/strata-app/tauri.conf.json`
- Create: `crates/strata-app/src/main.rs`
- Create: `crates/strata-app/icons/` (placeholder; copied from a Tauri template)

- [ ] **Step 1: Verify Tauri prerequisites**

Run: `node --version && npm --version`
Expected: Node ≥ 18, npm ≥ 9. If missing, install via `brew install node`.

Run: `cargo install tauri-cli --version "^2"` (one-time; idempotent).

- [ ] **Step 2: Add the new crate to the workspace manifest**

Edit root `Cargo.toml` — replace `members` array:

```toml
[workspace]
resolver = "2"
members = ["crates/strata-scan", "crates/strata-app"]

[workspace.package]
edition = "2021"
authors = ["Vishal Kumar"]
license = "MIT"
repository = "https://github.com/vishalquantana/strata"
```

- [ ] **Step 3: Create the strata-app Cargo.toml**

Write `crates/strata-app/Cargo.toml`:

```toml
[package]
name = "strata-app"
version = "0.1.0"
edition.workspace = true
authors.workspace = true
license.workspace = true
repository.workspace = true
description = "Strata — beautiful macOS disk-space viewer."

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync"] }
strata-scan = { path = "../strata-scan" }
anyhow = "1"

[features]
custom-protocol = ["tauri/custom-protocol"]

[[bin]]
name = "strata-app"
path = "src/main.rs"
```

- [ ] **Step 4: Create the build script**

Write `crates/strata-app/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 5: Create the Tauri config**

Write `crates/strata-app/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Strata",
  "version": "0.1.0",
  "identifier": "com.vishalquantana.strata",
  "build": {
    "frontendDist": "../ui/dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm --prefix ui run dev",
    "beforeBuildCommand": "npm --prefix ui run build"
  },
  "app": {
    "windows": [
      {
        "title": "Strata",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "decorations": true,
        "transparent": false,
        "center": true,
        "backgroundColor": "#08080b"
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg"],
    "icon": ["icons/icon.icns"],
    "macOS": {
      "minimumSystemVersion": "11.0"
    }
  }
}
```

- [ ] **Step 6: Add placeholder icons**

Run from repo root:

```bash
mkdir -p crates/strata-app/icons
# minimal placeholder — Tauri requires icon.icns for dmg builds
# For dev mode (Step 9) we don't actually need it, but we touch the file
# so config is satisfied. Real icon ships with Plan 3.
touch crates/strata-app/icons/icon.icns
```

- [ ] **Step 7: Create the placeholder main.rs**

Write `crates/strata-app/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Strata");
}
```

- [ ] **Step 8: Confirm the crate compiles**

Run: `cargo check -p strata-app`
Expected: builds (may complain about missing UI dist — that's OK at this step).

- [ ] **Step 9: Commit**

```bash
git add Cargo.toml crates/strata-app/
git commit -m "feat(app): tauri scaffold for strata-app crate"
```

---

## Task 2: Vite + Solid frontend skeleton

**Files:**
- Create: `crates/strata-app/ui/package.json`
- Create: `crates/strata-app/ui/vite.config.ts`
- Create: `crates/strata-app/ui/tsconfig.json`
- Create: `crates/strata-app/ui/index.html`
- Create: `crates/strata-app/ui/src/main.ts`
- Create: `crates/strata-app/ui/src/app.tsx`

- [ ] **Step 1: Create the UI package manifest**

Write `crates/strata-app/ui/package.json`:

```json
{
  "name": "strata-ui",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "d3-color": "^3.1.0",
    "d3-hierarchy": "^3.1.2",
    "d3-interpolate": "^3.0.1",
    "d3-scale": "^4.0.2",
    "solid-js": "^1.8.0"
  },
  "devDependencies": {
    "@types/d3-color": "^3.1.3",
    "@types/d3-hierarchy": "^3.1.6",
    "@types/d3-interpolate": "^3.0.4",
    "@types/d3-scale": "^4.0.8",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vite-plugin-solid": "^2.10.0"
  }
}
```

- [ ] **Step 2: Create the Vite config**

Write `crates/strata-app/ui/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "safari15",
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

- [ ] **Step 3: Create the TS config**

Write `crates/strata-app/ui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "lib": ["DOM", "ES2022"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create the HTML entry**

Write `crates/strata-app/ui/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Strata</title>
    <style>
      :root {
        --bg: #08080b;
        --panel: #0d0d12;
        --border: #1a1a22;
        --text: #e5e7eb;
        --text-dim: #6b7280;
        --accent: #6c8cff;
      }
      html, body {
        margin: 0; padding: 0; height: 100%;
        background: var(--bg);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      #app { height: 100vh; display: flex; flex-direction: column; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create the entry script and root component**

Write `crates/strata-app/ui/src/main.ts`:

```typescript
import { render } from "solid-js/web";
import App from "./app";

render(() => App(), document.getElementById("app")!);
```

Write `crates/strata-app/ui/src/app.tsx`:

```tsx
export default function App() {
  return (
    <div style={{ padding: "24px", color: "#e5e7eb" }}>
      <h1>Strata</h1>
      <p style={{ color: "#6b7280" }}>UI scaffold — viz comes in Task 5.</p>
    </div>
  );
}
```

- [ ] **Step 6: Install npm deps**

Run: `(cd crates/strata-app/ui && npm install)`
Expected: lockfile created, no errors.

- [ ] **Step 7: Add a `.gitignore` entry for ui/node_modules and dist**

Append to repo-root `.gitignore`:

```
crates/strata-app/ui/node_modules/
crates/strata-app/ui/dist/
```

- [ ] **Step 8: Verify Vite builds**

Run: `(cd crates/strata-app/ui && npm run build)`
Expected: `dist/` folder produced.

- [ ] **Step 9: Commit**

```bash
git add .gitignore crates/strata-app/ui/
git commit -m "feat(app): vite + solid frontend skeleton"
```

---

## Task 3: Tauri commands for directory pick + scan

**Files:**
- Create: `crates/strata-app/src/commands.rs`
- Create: `crates/strata-app/src/scan_runner.rs`
- Modify: `crates/strata-app/src/main.rs`
- Modify: `crates/strata-app/Cargo.toml` (add `tauri-plugin-dialog`)

- [ ] **Step 1: Add the dialog plugin dependency**

Edit `crates/strata-app/Cargo.toml` and add to `[dependencies]`:

```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Implement the scan runner**

Write `crates/strata-app/src/scan_runner.rs`:

```rust
//! Owns the background-thread machinery for running a scan and emitting
//! progress events to the WebView.

use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};

use strata_scan::{run, ScanOptions};

/// Spawns the scan on a background thread. Emits `scan-progress` events
/// for each progress update, and a single `scan-complete` event with the
/// JSON-serialized tree at the end.
pub fn start_scan(app: AppHandle, path: PathBuf) {
    let app = Arc::new(app);
    thread::spawn(move || {
        let opts = ScanOptions::defaults();
        let app_for_progress = app.clone();
        let result = run(&path, opts, move |ev| {
            let _ = app_for_progress.emit("scan-progress", ev);
        });

        match result {
            Ok(tree) => {
                let _ = app.emit("scan-complete", &tree);
            }
            Err(e) => {
                let _ = app.emit("scan-error", e.to_string());
            }
        }
    });
}
```

- [ ] **Step 3: Implement the commands module**

Write `crates/strata-app/src/commands.rs`:

```rust
//! Tauri command handlers exposed to the WebView.

use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::scan_runner;

/// Open a folder-picker dialog. Returns the selected path or None.
#[tauri::command]
pub async fn pick_directory(app: AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |chosen| {
        // tauri-plugin-dialog v2: callback receives Option<FilePath>.
        // Convert to a real filesystem PathBuf, then to a String.
        let resolved = chosen
            .and_then(|fp| fp.into_path().ok())
            .map(|p| p.to_string_lossy().into_owned());
        let _ = tx.send(resolved);
    });
    rx.await.unwrap_or(None)
}

/// Start a scan of the given path. Returns immediately; events stream via
/// `scan-progress`, `scan-complete`, and `scan-error`.
#[tauri::command]
pub fn start_scan(app: AppHandle, path: String) {
    scan_runner::start_scan(app, PathBuf::from(path));
}
```

- [ ] **Step 4: Wire the commands into main.rs**

Replace `crates/strata-app/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod scan_runner;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::pick_directory,
            commands::start_scan,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Strata");
}
```

- [ ] **Step 5: Confirm the app compiles**

Run: `cargo check -p strata-app`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add crates/strata-app/
git commit -m "feat(app): tauri commands for directory pick and scan"
```

---

## Task 4: Frontend IPC and types

**Files:**
- Create: `crates/strata-app/ui/src/types.ts`
- Create: `crates/strata-app/ui/src/ipc.ts`
- Modify: `crates/strata-app/ui/src/app.tsx`

- [ ] **Step 1: Mirror the Rust model in TS**

Write `crates/strata-app/ui/src/types.ts`:

```typescript
export type NodeId = number;

export type Stale = "hot" | "warm" | "stale" | "verystale";

export interface Signals {
  last_used_at: string | null;
  last_modified_at: string;
  created_at: string;
  is_backed_up_tm: boolean;
  is_in_icloud: boolean;
  is_known_junk: boolean;
  duplicate_group_id: number | null;
}

export interface DirNode {
  id: NodeId;
  parent_id: NodeId | null;
  path: string;
  name: string;
  depth: number;
  size_bytes: number;
  file_count: number;
  signals: Signals;
  children: NodeId[];
}

export interface ScanTree {
  root_id: NodeId;
  nodes: DirNode[];
  scanned_at: string;
  source_path: string;
}

export type ProgressEvent =
  | { event: "walk_started"; root: string }
  | { event: "walk_progress"; dirs_seen: number; files_seen: number; bytes_seen: number }
  | { event: "walk_completed"; node_count: number }
  | { event: "probe_started"; kind: string }
  | { event: "probe_completed"; kind: string; applied: number }
  | { event: "scan_finished" }
  | { event: "error"; message: string };
```

- [ ] **Step 2: Wrap the Tauri IPC**

Write `crates/strata-app/ui/src/ipc.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ProgressEvent, ScanTree } from "./types";

export async function pickDirectory(): Promise<string | null> {
  const r = await invoke<string | null>("pick_directory");
  return r ?? null;
}

export async function startScan(path: string): Promise<void> {
  await invoke("start_scan", { path });
}

export function onScanProgress(cb: (ev: ProgressEvent) => void): Promise<UnlistenFn> {
  return listen<ProgressEvent>("scan-progress", (e) => cb(e.payload));
}

export function onScanComplete(cb: (tree: ScanTree) => void): Promise<UnlistenFn> {
  return listen<ScanTree>("scan-complete", (e) => cb(e.payload));
}

export function onScanError(cb: (msg: string) => void): Promise<UnlistenFn> {
  return listen<string>("scan-error", (e) => cb(e.payload));
}
```

- [ ] **Step 3: Wire a minimal "pick + scan" flow in app.tsx**

Replace `crates/strata-app/ui/src/app.tsx`:

```tsx
import { createSignal, onMount } from "solid-js";
import { pickDirectory, startScan, onScanProgress, onScanComplete, onScanError } from "./ipc";
import type { ProgressEvent, ScanTree } from "./types";

export default function App() {
  const [status, setStatus] = createSignal<string>("Ready");
  const [tree, setTree] = createSignal<ScanTree | null>(null);

  onMount(async () => {
    await onScanProgress((ev: ProgressEvent) => {
      setStatus(JSON.stringify(ev));
    });
    await onScanComplete((t) => {
      setTree(t);
      setStatus(`Done — ${t.nodes.length} nodes, root size ${formatBytes(t.nodes[t.root_id].size_bytes)}`);
    });
    await onScanError((msg) => {
      setStatus("ERROR: " + msg);
    });
  });

  async function handlePick() {
    const p = await pickDirectory();
    if (!p) return;
    setStatus("Scanning " + p + "…");
    setTree(null);
    await startScan(p);
  }

  return (
    <div style={{ padding: "24px" }}>
      <h1 style={{ margin: "0 0 12px" }}>Strata</h1>
      <button onClick={handlePick} style={btn}>Pick a folder…</button>
      <pre style={{ "margin-top": "16px", color: "#6b7280", "font-family": "SF Mono, monospace", "font-size": "12px" }}>
        {status()}
      </pre>
      {tree() && (
        <p style={{ color: "#6b7280" }}>
          Tree loaded — {tree()!.nodes.length} nodes. Viz coming in Task 5.
        </p>
      )}
    </div>
  );
}

const btn = {
  background: "#6c8cff",
  color: "#fff",
  border: "none",
  padding: "8px 16px",
  "border-radius": "6px",
  "font-size": "13px",
  "font-weight": "600",
  cursor: "pointer",
} as const;

function formatBytes(b: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}
```

- [ ] **Step 4: Run the full app in dev mode and verify the round-trip works**

Run: `cargo tauri dev --config crates/strata-app/tauri.conf.json` (from repo root)

Expected: A native window opens. Click "Pick a folder…", choose `~/Downloads` (or any small dir), watch the status update with progress events, then settle on "Done — N nodes, root size X". This proves Plan 1's scanner is reachable from the WebView.

- [ ] **Step 5: Commit**

```bash
git add crates/strata-app/ui/src/
git commit -m "feat(app): frontend IPC + minimal pick-and-scan flow"
```

---

## Task 5: Build the d3 hierarchy and treemap layout

**Files:**
- Create: `crates/strata-app/ui/src/viz/hierarchy.ts`
- Create: `crates/strata-app/ui/src/viz/layout-treemap.ts`
- Create: `crates/strata-app/ui/src/viz/canvas.ts`
- Create: `crates/strata-app/ui/src/colors.ts`

- [ ] **Step 1: Write the colors module**

Write `crates/strata-app/ui/src/colors.ts`:

```typescript
import { rgb } from "d3-color";
import type { DirNode } from "./types";

/// Returns a hex color for a node based on its staleness + size.
/// Cool blue = hot, amber = warm, magenta = stale, deep red = very-stale-and-large.
/// Junk gets a desaturated grey-green tint regardless.
export function colorForNode(node: DirNode): string {
  if (node.signals.is_known_junk) {
    return "#3a4a3a";
  }
  const stale = staleness(node);
  switch (stale) {
    case "hot":       return "#3b82f6";  // blue-500
    case "warm":      return "#f59e0b";  // amber-500
    case "stale":     return "#ec4899";  // pink-500
    case "verystale":
      // Deep red if also large (>1GB), otherwise softer red.
      return node.size_bytes > 1_073_741_824 ? "#dc2626" : "#f87171";
  }
}

/// Returns a slightly brighter outline color (used for hover ring).
export function outlineColor(base: string): string {
  const c = rgb(base);
  return rgb(
    Math.min(255, c.r + 40),
    Math.min(255, c.g + 40),
    Math.min(255, c.b + 40),
  ).formatHex();
}

function staleness(node: DirNode): "hot" | "warm" | "stale" | "verystale" {
  const lu = node.signals.last_used_at ? new Date(node.signals.last_used_at).getTime() : 0;
  const lm = new Date(node.signals.last_modified_at).getTime();
  const fresh = Math.max(lu, lm);
  const ageDays = (Date.now() - fresh) / 86_400_000;
  if (ageDays <= 30) return "hot";
  if (ageDays <= 180) return "warm";
  if (ageDays <= 730) return "stale";
  return "verystale";
}
```

- [ ] **Step 2: Build the hierarchy adapter**

Write `crates/strata-app/ui/src/viz/hierarchy.ts`:

```typescript
import { hierarchy, type HierarchyNode } from "d3-hierarchy";
import type { DirNode, ScanTree } from "../types";

/// Builds a d3 hierarchy from the flat ScanTree, rooted at `rootId`.
export function buildHierarchy(tree: ScanTree, rootId = tree.root_id): HierarchyNode<DirNode> {
  const byId = new Map<number, DirNode>();
  for (const n of tree.nodes) byId.set(n.id, n);

  // d3.hierarchy needs a recursive shape — we wrap each node so it can
  // walk children without us mutating the original.
  type Wrap = { node: DirNode; children?: Wrap[] };
  function wrap(id: number): Wrap {
    const n = byId.get(id)!;
    const w: Wrap = { node: n };
    if (n.children.length > 0) {
      w.children = n.children.map(wrap);
    }
    return w;
  }
  const root = wrap(rootId);

  // Pass `node` through as the d3 datum.
  const h = hierarchy<DirNode>(
    root.node,
    (d) => byId.get(d.id)!.children.map((cid) => byId.get(cid)!),
  );
  // Sum sizes — children's sizes already include their descendants, so we
  // use leaf-only summation by treating "files" as a virtual sibling. For
  // v1 just use the rolled-up size_bytes directly via .sum on leaves only.
  h.sum((d) => (d.children.length === 0 ? d.size_bytes : 0));
  h.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return h;
}
```

Note: This works because Plan 1's walker rolls up sizes — leaves have their own size, internal nodes' totals come from `.sum`. For folders that contain only files (no subdirs), the leaf is the folder itself and its `.sum` falls back to `size_bytes`.

- [ ] **Step 3: Add the treemap layout**

Write `crates/strata-app/ui/src/viz/layout-treemap.ts`:

```typescript
import { treemap, treemapSquarify, type HierarchyNode } from "d3-hierarchy";
import type { DirNode } from "../types";

export interface Rect {
  id: number;
  x: number; y: number;
  w: number; h: number;
  depth: number;
}

/// Lays out the hierarchy as a treemap into the given pixel rect.
/// Returns one Rect per non-root node (we don't draw the root background).
export function computeTreemap(
  root: HierarchyNode<DirNode>,
  width: number,
  height: number,
  visibleThreshold = 0.005, // 0.5% of root area
): Rect[] {
  const layout = treemap<DirNode>()
    .tile(treemapSquarify.ratio(1.4))
    .size([width, height])
    .padding(1)
    .round(true);
  layout(root);

  const totalArea = width * height;
  const rects: Rect[] = [];
  root.each((d) => {
    if (d.depth === 0) return;
    const r = d as unknown as { x0: number; y0: number; x1: number; y1: number };
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    if (w * h < totalArea * visibleThreshold) return;
    rects.push({ id: d.data.id, x: r.x0, y: r.y0, w, h, depth: d.depth });
  });
  return rects;
}
```

- [ ] **Step 4: Build the canvas helper**

Write `crates/strata-app/ui/src/viz/canvas.ts`:

```typescript
/// Sets up a hi-DPI canvas. Returns the context with the appropriate
/// device-pixel-ratio scaling already applied.
export function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  return ctx;
}

export function clear(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#08080b";
  ctx.fillRect(0, 0, w, h);
}
```

- [ ] **Step 5: Confirm TS compiles**

Run: `(cd crates/strata-app/ui && npx tsc --noEmit)`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add crates/strata-app/ui/src/colors.ts crates/strata-app/ui/src/viz/
git commit -m "feat(viz): hierarchy + treemap layout + canvas helpers"
```

---

## Task 6: Render the treemap, with hover and click

**Files:**
- Create: `crates/strata-app/ui/src/viz/render.ts`
- Create: `crates/strata-app/ui/src/viz/hit-test.ts`
- Create: `crates/strata-app/ui/src/viz/viz.tsx`
- Modify: `crates/strata-app/ui/src/app.tsx`

- [ ] **Step 1: Implement the renderer**

Write `crates/strata-app/ui/src/viz/render.ts`:

```typescript
import { colorForNode, outlineColor } from "../colors";
import type { DirNode } from "../types";
import type { Rect } from "./layout-treemap";

export interface RenderInput {
  rects: Rect[];
  nodesById: Map<number, DirNode>;
  hoveredId: number | null;
}

export function renderTreemap(
  ctx: CanvasRenderingContext2D,
  input: RenderInput,
) {
  for (const r of input.rects) {
    const node = input.nodesById.get(r.id)!;
    const fill = colorForNode(node);
    ctx.fillStyle = fill;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // Inset glow effect — a darker overlay on the bottom-right.
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(r.x, r.y + r.h - Math.min(r.h * 0.25, 12), r.w, Math.min(r.h * 0.25, 12));

    // Label if region is large enough.
    if (r.w > 60 && r.h > 24) {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
      ctx.textBaseline = "top";
      const label = truncate(node.name, Math.floor(r.w / 7));
      ctx.fillText(label, r.x + 6, r.y + 6);
      if (r.h > 40) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "500 10px 'SF Mono', SFMono-Regular, monospace";
        ctx.fillText(formatBytes(node.size_bytes), r.x + 6, r.y + 22);
      }
    }

    if (input.hoveredId === r.id) {
      ctx.strokeStyle = outlineColor(fill);
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}

function formatBytes(b: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}
```

- [ ] **Step 2: Implement hit-testing**

Write `crates/strata-app/ui/src/viz/hit-test.ts`:

```typescript
import type { Rect } from "./layout-treemap";

/// Linear scan; fine for ~500 visible rects per frame.
/// Returns the deepest rect under the point (deepest = drawn-last in our scan order).
export function hitTest(rects: Rect[], x: number, y: number): number | null {
  // Iterate in reverse so we hit the deepest (innermost-drawn) rect first.
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return r.id;
    }
  }
  return null;
}
```

- [ ] **Step 3: Build the Solid Viz component**

Write `crates/strata-app/ui/src/viz/viz.tsx`:

```tsx
import { createEffect, createSignal, onMount, onCleanup } from "solid-js";
import type { DirNode, ScanTree } from "../types";
import { setupCanvas, clear } from "./canvas";
import { buildHierarchy } from "./hierarchy";
import { computeTreemap, type Rect } from "./layout-treemap";
import { renderTreemap } from "./render";
import { hitTest } from "./hit-test";

interface Props {
  tree: ScanTree;
}

export default function Viz(props: Props) {
  let canvasRef: HTMLCanvasElement | undefined;
  const [hoveredId, setHoveredId] = createSignal<number | null>(null);
  const [zoomRoot, setZoomRoot] = createSignal<number>(props.tree.root_id);

  let rects: Rect[] = [];
  let nodesById = new Map<number, DirNode>();
  let ctx: CanvasRenderingContext2D | null = null;
  let cssWidth = 0;
  let cssHeight = 0;

  function relayout() {
    if (!canvasRef || !ctx) return;
    const rect = canvasRef.getBoundingClientRect();
    cssWidth = rect.width;
    cssHeight = rect.height;
    nodesById = new Map(props.tree.nodes.map((n) => [n.id, n]));
    const h = buildHierarchy(props.tree, zoomRoot());
    rects = computeTreemap(h, cssWidth, cssHeight);
    draw();
  }

  function draw() {
    if (!ctx) return;
    clear(ctx, cssWidth, cssHeight);
    renderTreemap(ctx, { rects, nodesById, hoveredId: hoveredId() });
  }

  onMount(() => {
    if (!canvasRef) return;
    ctx = setupCanvas(canvasRef);
    relayout();

    const ro = new ResizeObserver(() => {
      if (!canvasRef || !ctx) return;
      ctx = setupCanvas(canvasRef);
      relayout();
    });
    ro.observe(canvasRef);
    onCleanup(() => ro.disconnect());
  });

  // Re-render when hover changes.
  createEffect(() => {
    hoveredId();
    draw();
  });

  // Re-layout when the zoom root changes.
  createEffect(() => {
    zoomRoot();
    relayout();
  });

  function onMove(e: MouseEvent) {
    if (!canvasRef) return;
    const r = canvasRef.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const id = hitTest(rects, x, y);
    setHoveredId(id);
  }

  function onClick() {
    const id = hoveredId();
    if (id === null) return;
    const node = nodesById.get(id);
    if (!node) return;
    if (node.children.length > 0) {
      setZoomRoot(id);
    }
  }

  function zoomOut() {
    const cur = zoomRoot();
    const node = nodesById.get(cur);
    if (node && node.parent_id !== null) {
      setZoomRoot(node.parent_id);
    }
  }

  return (
    <div style={{ position: "relative", flex: 1, "min-height": 0 }}>
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHoveredId(null)}
        onClick={onClick}
        style={{ width: "100%", height: "100%", display: "block", cursor: "pointer" }}
      />
      {zoomRoot() !== props.tree.root_id && (
        <button onClick={zoomOut} style={zoomBtn}>← Back</button>
      )}
    </div>
  );
}

const zoomBtn = {
  position: "absolute",
  top: "12px",
  left: "12px",
  background: "rgba(13,13,18,0.85)",
  border: "1px solid #1a1a22",
  color: "#e5e7eb",
  padding: "6px 12px",
  "border-radius": "100px",
  "backdrop-filter": "blur(8px)",
  cursor: "pointer",
  "font-size": "12px",
} as const;
```

- [ ] **Step 4: Wire Viz into App**

Replace `crates/strata-app/ui/src/app.tsx`:

```tsx
import { createSignal, onMount, Show } from "solid-js";
import { pickDirectory, startScan, onScanProgress, onScanComplete, onScanError } from "./ipc";
import type { ProgressEvent, ScanTree } from "./types";
import Viz from "./viz/viz";

export default function App() {
  const [status, setStatus] = createSignal<string>("Pick a folder to begin");
  const [tree, setTree] = createSignal<ScanTree | null>(null);
  const [scanning, setScanning] = createSignal(false);

  onMount(async () => {
    await onScanProgress((ev: ProgressEvent) => {
      setStatus(formatProgress(ev));
    });
    await onScanComplete((t) => {
      setTree(t);
      setScanning(false);
      setStatus(`${t.nodes.length} folders · ${formatBytes(t.nodes[t.root_id].size_bytes)}`);
    });
    await onScanError((msg) => {
      setScanning(false);
      setStatus("ERROR: " + msg);
    });
  });

  async function handlePick() {
    const p = await pickDirectory();
    if (!p) return;
    setTree(null);
    setScanning(true);
    setStatus("Scanning " + p + "…");
    await startScan(p);
  }

  return (
    <div style={{ height: "100vh", display: "flex", "flex-direction": "column" }}>
      <header style={header}>
        <span style={{ "font-weight": 700, "letter-spacing": "-0.3px" }}>Strata</span>
        <button onClick={handlePick} style={btn} disabled={scanning()}>
          {scanning() ? "Scanning…" : "Pick a folder…"}
        </button>
        <span style={{ color: "#6b7280", "font-size": "12px", "font-family": "SF Mono, monospace" }}>
          {status()}
        </span>
      </header>
      <Show when={tree()}>
        {(t) => <Viz tree={t()} />}
      </Show>
    </div>
  );
}

const header = {
  display: "flex", "align-items": "center", gap: "16px",
  padding: "10px 16px",
  background: "#0d0d12",
  "border-bottom": "1px solid #1a1a22",
} as const;

const btn = {
  background: "#6c8cff", color: "#fff", border: "none",
  padding: "6px 14px", "border-radius": "6px",
  "font-size": "12px", "font-weight": 600, cursor: "pointer",
} as const;

function formatProgress(ev: ProgressEvent): string {
  switch (ev.event) {
    case "walk_started": return `Walking ${ev.root}`;
    case "walk_completed": return `${ev.node_count} folders found`;
    case "probe_started": return `Probing ${ev.kind}`;
    case "probe_completed": return `${ev.kind} done (${ev.applied} matches)`;
    case "scan_finished": return "Done";
    case "error": return "ERROR: " + ev.message;
    default: return JSON.stringify(ev);
  }
}

function formatBytes(b: number): string {
  const u = ["B","KB","MB","GB","TB"];
  let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}
```

- [ ] **Step 5: Run the dev app and verify the treemap renders**

Run: `cargo tauri dev --config crates/strata-app/tauri.conf.json`
Expected: window opens; pick a folder; treemap fills the canvas with colored rectangles. Hovering shows a ring; clicking a folder zooms into it; "← Back" returns.

- [ ] **Step 6: Commit**

```bash
git add crates/strata-app/ui/src/
git commit -m "feat(viz): treemap rendering with hover and click-to-zoom"
```

---

## Task 7: Sunburst layout + the morph toggle

**Files:**
- Create: `crates/strata-app/ui/src/viz/layout-sunburst.ts`
- Create: `crates/strata-app/ui/src/viz/morph.ts`
- Create: `crates/strata-app/ui/src/components/toggle.tsx`
- Modify: `crates/strata-app/ui/src/viz/render.ts`
- Modify: `crates/strata-app/ui/src/viz/hit-test.ts`
- Modify: `crates/strata-app/ui/src/viz/viz.tsx`

- [ ] **Step 1: Add the sunburst layout**

Write `crates/strata-app/ui/src/viz/layout-sunburst.ts`:

```typescript
import { partition, type HierarchyNode } from "d3-hierarchy";
import type { DirNode } from "../types";

export interface Arc {
  id: number;
  cx: number; cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;     // radians, 0 = up, clockwise
  endAngle: number;
  depth: number;
}

export function computeSunburst(
  root: HierarchyNode<DirNode>,
  width: number,
  height: number,
  visibleThreshold = 0.005,
): Arc[] {
  const radius = Math.min(width, height) / 2 - 8;
  const cx = width / 2;
  const cy = height / 2;

  const part = partition<DirNode>().size([2 * Math.PI, radius]);
  part(root);

  const arcs: Arc[] = [];
  const totalAngle = 2 * Math.PI;
  root.each((d) => {
    if (d.depth === 0) return;
    const p = d as unknown as { x0: number; x1: number; y0: number; y1: number };
    const angularSize = p.x1 - p.x0;
    if (angularSize / totalAngle < visibleThreshold) return;
    arcs.push({
      id: d.data.id,
      cx, cy,
      innerRadius: p.y0,
      outerRadius: p.y1,
      startAngle: p.x0,
      endAngle: p.x1,
      depth: d.depth,
    });
  });
  return arcs;
}
```

- [ ] **Step 2: Update render.ts to draw arcs**

Replace `crates/strata-app/ui/src/viz/render.ts`:

```typescript
import { colorForNode, outlineColor } from "../colors";
import type { DirNode } from "../types";
import type { Rect } from "./layout-treemap";
import type { Arc } from "./layout-sunburst";

export interface Shape {
  kind: "rect" | "arc" | "morph";
  rect?: Rect;
  arc?: Arc;
  /// 0 = full rect, 1 = full arc, in-between is interpolated.
  morphT?: number;
  rectFrom?: Rect;
  arcTo?: Arc;
  id: number;
}

export interface RenderInput {
  shapes: Shape[];
  nodesById: Map<number, DirNode>;
  hoveredId: number | null;
}

export function render(ctx: CanvasRenderingContext2D, input: RenderInput) {
  for (const s of input.shapes) {
    const node = input.nodesById.get(s.id)!;
    const fill = colorForNode(node);
    ctx.fillStyle = fill;
    if (s.kind === "rect" && s.rect) {
      drawRect(ctx, s.rect, fill, node, input.hoveredId === s.id);
    } else if (s.kind === "arc" && s.arc) {
      drawArc(ctx, s.arc, fill, input.hoveredId === s.id);
    } else if (s.kind === "morph" && s.rectFrom && s.arcTo && s.morphT !== undefined) {
      // Crossfade: render rect with (1-t) opacity, arc with t opacity.
      ctx.globalAlpha = 1 - s.morphT;
      drawRect(ctx, s.rectFrom, fill, node, false);
      ctx.globalAlpha = s.morphT;
      drawArc(ctx, s.arcTo, fill, false);
      ctx.globalAlpha = 1;
    }
  }
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  fill: string,
  node: DirNode,
  hovered: boolean,
) {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(r.x, r.y + r.h - Math.min(r.h * 0.25, 12), r.w, Math.min(r.h * 0.25, 12));

  if (r.w > 60 && r.h > 24) {
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(truncate(node.name, Math.floor(r.w / 7)), r.x + 6, r.y + 6);
    if (r.h > 40) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "500 10px 'SF Mono', SFMono-Regular, monospace";
      ctx.fillText(formatBytes(node.size_bytes), r.x + 6, r.y + 22);
    }
  }
  if (hovered) {
    ctx.strokeStyle = outlineColor(fill);
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  }
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  a: Arc,
  fill: string,
  hovered: boolean,
) {
  ctx.beginPath();
  // d3 partition uses 0-rad-up convention but Canvas is 0-rad-right; subtract pi/2.
  ctx.arc(a.cx, a.cy, a.outerRadius, a.startAngle - Math.PI / 2, a.endAngle - Math.PI / 2);
  ctx.arc(a.cx, a.cy, a.innerRadius, a.endAngle - Math.PI / 2, a.startAngle - Math.PI / 2, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (hovered) {
    ctx.strokeStyle = outlineColor(fill);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}
function formatBytes(b: number): string {
  const u = ["B","KB","MB","GB","TB"];
  let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}
```

- [ ] **Step 3: Update hit-test for both shape kinds**

Replace `crates/strata-app/ui/src/viz/hit-test.ts`:

```typescript
import type { Rect } from "./layout-treemap";
import type { Arc } from "./layout-sunburst";

export function hitTestRects(rects: Rect[], x: number, y: number): number | null {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return r.id;
    }
  }
  return null;
}

export function hitTestArcs(arcs: Arc[], x: number, y: number): number | null {
  for (let i = arcs.length - 1; i >= 0; i--) {
    const a = arcs[i];
    const dx = x - a.cx;
    const dy = y - a.cy;
    const r = Math.hypot(dx, dy);
    if (r < a.innerRadius || r > a.outerRadius) continue;
    // angle in (-pi, pi]; we want 0 = up, clockwise positive.
    let ang = Math.atan2(dx, -dy);
    if (ang < 0) ang += 2 * Math.PI;
    if (ang >= a.startAngle && ang < a.endAngle) {
      return a.id;
    }
  }
  return null;
}
```

- [ ] **Step 4: Implement the morph helper**

Write `crates/strata-app/ui/src/viz/morph.ts`:

```typescript
import type { Rect } from "./layout-treemap";
import type { Arc } from "./layout-sunburst";
import type { Shape } from "./render";

/// Pair rects and arcs by id. For a given t (0..1) produce shapes that
/// render the crossfade. Items present in only one layout fade in/out.
export function buildMorphShapes(rects: Rect[], arcs: Arc[], t: number): Shape[] {
  const rectById = new Map(rects.map((r) => [r.id, r]));
  const arcById = new Map(arcs.map((a) => [a.id, a]));
  const allIds = new Set<number>([...rectById.keys(), ...arcById.keys()]);
  const out: Shape[] = [];
  for (const id of allIds) {
    const r = rectById.get(id);
    const a = arcById.get(id);
    if (r && a) {
      out.push({ kind: "morph", id, rectFrom: r, arcTo: a, morphT: t });
    } else if (r) {
      // Only in treemap → fade with (1-t)
      out.push({ kind: "morph", id, rectFrom: r, arcTo: { id, cx: 0, cy: 0, innerRadius: 0, outerRadius: 0, startAngle: 0, endAngle: 0, depth: r.depth }, morphT: t });
    } else if (a) {
      out.push({ kind: "morph", id, rectFrom: { id, x: 0, y: 0, w: 0, h: 0, depth: a.depth }, arcTo: a, morphT: t });
    }
  }
  return out;
}

/// Cubic ease-in-out for the morph progress.
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
```

- [ ] **Step 5: Build the toggle component**

Write `crates/strata-app/ui/src/components/toggle.tsx`:

```tsx
export type VizMode = "treemap" | "sunburst";

interface Props {
  mode: VizMode;
  onChange: (mode: VizMode) => void;
}

export default function Toggle(props: Props) {
  return (
    <div style={wrap}>
      <button
        style={{ ...pill, ...(props.mode === "sunburst" ? on : off) }}
        onClick={() => props.onChange("sunburst")}
      >◎ Sunburst</button>
      <button
        style={{ ...pill, ...(props.mode === "treemap" ? on : off) }}
        onClick={() => props.onChange("treemap")}
      >▦ Treemap</button>
    </div>
  );
}

const wrap = {
  position: "absolute",
  top: "12px", left: "50%", transform: "translateX(-50%)",
  display: "flex",
  background: "rgba(13,13,18,0.85)",
  "backdrop-filter": "blur(8px)",
  border: "1px solid #1a1a22",
  "border-radius": "100px",
  padding: "3px",
  gap: "0",
} as const;

const pill = {
  border: "none",
  padding: "5px 12px",
  "border-radius": "100px",
  "font-size": "11px",
  "font-weight": 600,
  cursor: "pointer",
  transition: "all 0.15s ease",
} as const;

const on = { background: "#6c8cff", color: "#fff" } as const;
const off = { background: "transparent", color: "#9ca3af" } as const;
```

- [ ] **Step 6: Update Viz to support both layouts and the morph**

Replace `crates/strata-app/ui/src/viz/viz.tsx`:

```tsx
import { createEffect, createSignal, onMount, onCleanup } from "solid-js";
import type { DirNode, ScanTree } from "../types";
import { setupCanvas, clear } from "./canvas";
import { buildHierarchy } from "./hierarchy";
import { computeTreemap, type Rect } from "./layout-treemap";
import { computeSunburst, type Arc } from "./layout-sunburst";
import { render, type Shape } from "./render";
import { hitTestRects, hitTestArcs } from "./hit-test";
import { buildMorphShapes, easeInOutCubic } from "./morph";
import Toggle, { type VizMode } from "../components/toggle";

interface Props {
  tree: ScanTree;
}

const MORPH_DURATION_MS = 600;

export default function Viz(props: Props) {
  let canvasRef: HTMLCanvasElement | undefined;
  const [hoveredId, setHoveredId] = createSignal<number | null>(null);
  const [zoomRoot, setZoomRoot] = createSignal<number>(props.tree.root_id);
  const [mode, setMode] = createSignal<VizMode>("treemap");

  let rects: Rect[] = [];
  let arcs: Arc[] = [];
  let nodesById = new Map<number, DirNode>();
  let ctx: CanvasRenderingContext2D | null = null;
  let cssWidth = 0;
  let cssHeight = 0;

  // Morph state
  let morphFrom: VizMode | null = null;
  let morphTo: VizMode | null = null;
  let morphStart = 0;
  let rafId: number | null = null;

  function relayout() {
    if (!canvasRef || !ctx) return;
    const r = canvasRef.getBoundingClientRect();
    cssWidth = r.width;
    cssHeight = r.height;
    nodesById = new Map(props.tree.nodes.map((n) => [n.id, n]));
    const h = buildHierarchy(props.tree, zoomRoot());
    rects = computeTreemap(h, cssWidth, cssHeight);
    arcs = computeSunburst(h, cssWidth, cssHeight);
    drawCurrent();
  }

  function shapesForMode(m: VizMode): Shape[] {
    if (m === "treemap") {
      return rects.map((r) => ({ kind: "rect" as const, rect: r, id: r.id }));
    }
    return arcs.map((a) => ({ kind: "arc" as const, arc: a, id: a.id }));
  }

  function drawCurrent() {
    if (!ctx) return;
    clear(ctx, cssWidth, cssHeight);
    render(ctx, { shapes: shapesForMode(mode()), nodesById, hoveredId: hoveredId() });
  }

  function startMorph(to: VizMode) {
    if (mode() === to) return;
    morphFrom = mode();
    morphTo = to;
    morphStart = performance.now();
    if (rafId !== null) cancelAnimationFrame(rafId);
    const tick = (now: number) => {
      const elapsed = now - morphStart;
      const tRaw = Math.min(1, elapsed / MORPH_DURATION_MS);
      const t = easeInOutCubic(tRaw);
      // Crossfade direction: rect→arc means rectFrom is actual rect, arcTo is actual arc, t goes 0→1.
      const tDirected = morphFrom === "treemap" ? t : 1 - t;
      if (!ctx) return;
      clear(ctx, cssWidth, cssHeight);
      const shapes = buildMorphShapes(rects, arcs, tDirected);
      render(ctx, { shapes, nodesById, hoveredId: null });
      if (tRaw < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setMode(to);
        morphFrom = null;
        morphTo = null;
        rafId = null;
        drawCurrent();
      }
    };
    rafId = requestAnimationFrame(tick);
  }

  onMount(() => {
    if (!canvasRef) return;
    ctx = setupCanvas(canvasRef);
    relayout();
    const ro = new ResizeObserver(() => {
      if (!canvasRef || !ctx) return;
      ctx = setupCanvas(canvasRef);
      relayout();
    });
    ro.observe(canvasRef);
    onCleanup(() => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    });
  });

  createEffect(() => {
    hoveredId();
    if (morphFrom === null) drawCurrent();
  });
  createEffect(() => {
    zoomRoot();
    relayout();
  });

  function onMove(e: MouseEvent) {
    if (!canvasRef || morphFrom !== null) return;
    const r = canvasRef.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const id = mode() === "treemap" ? hitTestRects(rects, x, y) : hitTestArcs(arcs, x, y);
    setHoveredId(id);
  }

  function onClick() {
    const id = hoveredId();
    if (id === null) return;
    const node = nodesById.get(id);
    if (!node || node.children.length === 0) return;
    setZoomRoot(id);
  }

  function zoomOut() {
    const cur = zoomRoot();
    const node = nodesById.get(cur);
    if (node && node.parent_id !== null) setZoomRoot(node.parent_id);
  }

  return (
    <div style={{ position: "relative", flex: 1, "min-height": 0 }}>
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHoveredId(null)}
        onClick={onClick}
        style={{ width: "100%", height: "100%", display: "block", cursor: "pointer" }}
      />
      <Toggle mode={mode()} onChange={startMorph} />
      {zoomRoot() !== props.tree.root_id && (
        <button onClick={zoomOut} style={zoomBtn}>← Back</button>
      )}
    </div>
  );
}

const zoomBtn = {
  position: "absolute", top: "12px", left: "12px",
  background: "rgba(13,13,18,0.85)",
  border: "1px solid #1a1a22",
  color: "#e5e7eb",
  padding: "6px 12px",
  "border-radius": "100px",
  "backdrop-filter": "blur(8px)",
  cursor: "pointer",
  "font-size": "12px",
} as const;
```

- [ ] **Step 7: Run dev mode and verify the morph**

Run: `cargo tauri dev --config crates/strata-app/tauri.conf.json`
Expected: window opens; pick a folder; toggle between sunburst and treemap views with a smooth ~600ms crossfade. Hover and click work in both modes.

- [ ] **Step 8: Commit**

```bash
git add crates/strata-app/ui/src/
git commit -m "feat(viz): sunburst layout + morph toggle"
```

---

## Task 8: Breadcrumb component and progress bar

**Files:**
- Create: `crates/strata-app/ui/src/components/breadcrumb.tsx`
- Create: `crates/strata-app/ui/src/components/progress-bar.tsx`
- Modify: `crates/strata-app/ui/src/app.tsx`

- [ ] **Step 1: Build breadcrumb**

Write `crates/strata-app/ui/src/components/breadcrumb.tsx`:

```tsx
import type { DirNode, ScanTree } from "../types";

interface Props {
  tree: ScanTree;
  currentId: number;
  onJumpTo: (id: number) => void;
}

export default function Breadcrumb(props: Props) {
  const path: DirNode[] = [];
  let cur: DirNode | undefined = props.tree.nodes[props.currentId];
  while (cur) {
    path.unshift(cur);
    cur = cur.parent_id !== null ? props.tree.nodes[cur.parent_id] : undefined;
  }
  return (
    <div style={wrap}>
      {path.map((n, i) => (
        <>
          <button onClick={() => props.onJumpTo(n.id)} style={crumb}>{n.name || "/"}</button>
          {i < path.length - 1 && <span style={sep}>›</span>}
        </>
      ))}
    </div>
  );
}

const wrap = {
  display: "flex", "align-items": "center", gap: "4px",
  "font-size": "12px",
  color: "#9ca3af",
  "font-family": "SF Mono, monospace",
} as const;
const crumb = {
  background: "transparent",
  border: "none",
  color: "#9ca3af",
  cursor: "pointer",
  padding: "2px 4px",
  "border-radius": "3px",
  "font-size": "12px",
} as const;
const sep = { color: "#4b5563" } as const;
```

- [ ] **Step 2: Build progress bar**

Write `crates/strata-app/ui/src/components/progress-bar.tsx`:

```tsx
import type { ProgressEvent } from "../types";

interface Props {
  event: ProgressEvent | null;
  active: boolean;
}

export default function ProgressBar(props: Props) {
  if (!props.active) return null;
  const label = props.event ? labelFor(props.event) : "Starting…";
  return (
    <div style={wrap}>
      <div style={bar}>
        <div style={fill} />
      </div>
      <span style={text}>{label}</span>
    </div>
  );
}

function labelFor(ev: ProgressEvent): string {
  switch (ev.event) {
    case "walk_started": return "Walking filesystem…";
    case "walk_completed": return `Walked ${ev.node_count.toLocaleString()} folders`;
    case "probe_started": return `Probe: ${ev.kind}…`;
    case "probe_completed": return `${ev.kind} done`;
    case "scan_finished": return "Done";
    case "error": return "Error";
    default: return "Working…";
  }
}

const wrap = { display: "flex", "align-items": "center", gap: "10px" } as const;
const bar = {
  width: "80px", height: "3px",
  background: "#1a1a22",
  "border-radius": "2px",
  overflow: "hidden",
  position: "relative",
} as const;
const fill = {
  position: "absolute", inset: "0",
  background: "#6c8cff",
  animation: "stratapulse 1.2s ease-in-out infinite",
  width: "40%",
} as const;
const text = {
  "font-size": "11px",
  color: "#6b7280",
  "font-family": "SF Mono, monospace",
} as const;
```

Add the keyframes to `index.html` `<style>`:

```css
@keyframes stratapulse {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
```

- [ ] **Step 3: Wire breadcrumb and progress into app.tsx**

For Task 8 we keep the layout simple — breadcrumb in header replaces the static status when scanning is done. Modify `app.tsx` header section (replace the status `<span>` and add breadcrumb integration):

Replace `crates/strata-app/ui/src/app.tsx`:

```tsx
import { createSignal, onMount, Show } from "solid-js";
import { pickDirectory, startScan, onScanProgress, onScanComplete, onScanError } from "./ipc";
import type { ProgressEvent, ScanTree } from "./types";
import Viz from "./viz/viz";
import ProgressBar from "./components/progress-bar";
import Breadcrumb from "./components/breadcrumb";

export default function App() {
  const [event, setEvent] = createSignal<ProgressEvent | null>(null);
  const [tree, setTree] = createSignal<ScanTree | null>(null);
  const [scanning, setScanning] = createSignal(false);
  const [currentRoot, setCurrentRoot] = createSignal<number | null>(null);

  onMount(async () => {
    await onScanProgress((ev) => setEvent(ev));
    await onScanComplete((t) => {
      setTree(t);
      setCurrentRoot(t.root_id);
      setScanning(false);
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
    await startScan(p);
  }

  return (
    <div style={{ height: "100vh", display: "flex", "flex-direction": "column" }}>
      <header style={header}>
        <span style={{ "font-weight": 700, "letter-spacing": "-0.3px" }}>Strata</span>
        <button onClick={handlePick} style={btn} disabled={scanning()}>
          {scanning() ? "Scanning…" : "Pick a folder…"}
        </button>
        <Show when={tree() && currentRoot() !== null}>
          <Breadcrumb tree={tree()!} currentId={currentRoot()!} onJumpTo={setCurrentRoot} />
        </Show>
        <div style={{ "margin-left": "auto" }}>
          <ProgressBar event={event()} active={scanning()} />
        </div>
      </header>
      <Show when={tree() && currentRoot() !== null}>
        <Viz tree={tree()!} initialRootId={currentRoot()!} onZoomChange={setCurrentRoot} />
      </Show>
    </div>
  );
}

const header = {
  display: "flex", "align-items": "center", gap: "16px",
  padding: "10px 16px",
  background: "#0d0d12",
  "border-bottom": "1px solid #1a1a22",
} as const;
const btn = {
  background: "#6c8cff", color: "#fff", border: "none",
  padding: "6px 14px", "border-radius": "6px",
  "font-size": "12px", "font-weight": 600, cursor: "pointer",
} as const;
```

- [ ] **Step 4: Update Viz to accept controlled zoom root**

Update the props in `crates/strata-app/ui/src/viz/viz.tsx` — change the `Props` interface and the `zoomRoot` signal:

Replace these specific lines in `viz.tsx`:

```tsx
interface Props {
  tree: ScanTree;
  initialRootId: number;
  onZoomChange: (id: number) => void;
}
```

And replace the signal initialization:

```tsx
const [zoomRoot, setZoomRoot] = createSignal<number>(props.initialRootId);
```

And add an effect to push changes outward, plus respond to inbound changes:

```tsx
createEffect(() => {
  props.onZoomChange(zoomRoot());
});
createEffect(() => {
  if (props.initialRootId !== zoomRoot()) {
    setZoomRoot(props.initialRootId);
  }
});
```

- [ ] **Step 5: Run dev and verify**

Run: `cargo tauri dev --config crates/strata-app/tauri.conf.json`
Expected: breadcrumb appears in header after scan; clicking a region zooms in and the breadcrumb extends; clicking a breadcrumb segment jumps back to that level.

- [ ] **Step 6: Commit**

```bash
git add crates/strata-app/ui/
git commit -m "feat(app): breadcrumb + progress bar; controlled zoom from header"
```

---

## Task 9: Final polish + smoke test

**Files:**
- Modify: `crates/strata-app/ui/src/app.tsx` (light copy polish)
- Create: `crates/strata-app/README.md`

- [ ] **Step 1: Add an empty-state when no tree loaded**

Edit `app.tsx` body section (inside the main container, before the `<Show>`):

```tsx
<Show when={!tree() && !scanning()}>
  <div style={emptyWrap}>
    <h2 style={{ margin: "0 0 8px", "font-weight": 600, "letter-spacing": "-0.5px" }}>Welcome to Strata</h2>
    <p style={{ margin: "0 0 24px", color: "#6b7280", "font-size": "14px" }}>
      Pick a folder to see what's eating your disk — and what you've forgotten.
    </p>
    <button onClick={handlePick} style={{ ...btn, padding: "10px 22px", "font-size": "13px" }}>Choose folder…</button>
  </div>
</Show>
```

Add to the styles in `app.tsx`:

```tsx
const emptyWrap = {
  flex: 1,
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  "justify-content": "center",
  color: "#e5e7eb",
} as const;
```

- [ ] **Step 2: Write the app README**

Write `crates/strata-app/README.md`:

```markdown
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
```

- [ ] **Step 3: Final manual smoke test**

Run: `cargo tauri dev --config crates/strata-app/tauri.conf.json`

Verify:
- Window opens with empty-state.
- "Choose folder…" opens a folder picker.
- Picking a folder shows scanning progress in the header.
- After scan: treemap fills the canvas with colored regions.
- Toggle pill switches to sunburst with a smooth ~600ms morph.
- Hover shows ring on regions.
- Clicking a folder zooms in; "← Back" or breadcrumb jumps back out.

- [ ] **Step 4: Commit + push**

```bash
git add crates/strata-app/
git commit -m "feat(app): empty state + readme; v1 viz core ships"
git push origin master
```

---

## Plan 2 done — what you have

A working desktop app: pick a folder, scan it, see your disk as a beautiful morphing treemap ↔ sunburst. Click to zoom. Hover to highlight. Colors encode staleness. The viz core is solid; what's missing is the sidebar, the slide-in details panel, the hover-peek tooltip, the action buttons (Reveal in Finder, Move to Trash), and the Full Disk Access onboarding flow. All of that comes in Plan 3.

**Next:** Plan 3 — `2026-04-27-plan-3-ui-shell.md`.
