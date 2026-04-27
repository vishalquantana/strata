import { createSignal, onMount, onCleanup, Show, createMemo } from "solid-js";
import {
  pickDirectory, startScan, onScanProgress, onScanComplete, onScanError,
  startWatching, onFsChange, type FsChange,
} from "./ipc";
import { dismissCtxMenu, ctxMenuOpen } from "./viz/viz";
import Onboarding from "./components/onboarding";
import { checkFullDiskAccess } from "./ipc";
import type { ProgressEvent, ScanTree } from "./types";
import Viz from "./viz/viz";
import ProgressBar from "./components/progress-bar";
import Breadcrumb from "./components/breadcrumb";
import Sidebar from "./components/sidebar";
import DetailsPanel from "./components/details-panel";
import QuickPicker from "./components/quick-picker";
import ScanningState, {
  type ScanCounters, type PhaseEntry, type PhaseStatus, type ScanSnapshot,
} from "./components/scanning-state";
import { selectionStore } from "./stores/selection";
import { APP_VERSION } from "./version";

// Phase timeline shown during a scan. Order matches the scan engine.
const INITIAL_PHASES: PhaseEntry[] = [
  { id: "walk", label: "Walking filesystem", status: "pending" },
  { id: "tm", label: "Time Machine status", status: "pending" },
  { id: "icloud", label: "iCloud detection", status: "pending" },
  { id: "spotlight", label: "Spotlight metadata", status: "pending" },
  { id: "hash", label: "Duplicate detection", status: "pending" },
];

function setPhase(phases: PhaseEntry[], id: string, status: PhaseStatus): PhaseEntry[] {
  return phases.map((p) => (p.id === id ? { ...p, status } : p));
}

export default function App() {
  const [event, setEvent] = createSignal<ProgressEvent | null>(null);
  const [tree, setTree] = createSignal<ScanTree | null>(null);
  const [scanning, setScanning] = createSignal(false);
  const [currentRoot, setCurrentRoot] = createSignal<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = createSignal(true);
  const [hasFda, setHasFda] = createSignal<boolean>(false);
  // fdaChecked gates a future loading-spinner; unused for now
  const [_fdaChecked, setFdaChecked] = createSignal<boolean>(false);
  const [lastScannedPath, setLastScannedPath] = createSignal<string | null>(null);
  const [counters, setCounters] = createSignal<ScanCounters>({
    dirs: 0, files: 0, bytes: 0, startedAt: 0,
  });
  const [phases, setPhases] = createSignal<PhaseEntry[]>(INITIAL_PHASES);
  const [elapsedMs, setElapsedMs] = createSignal(0);
  const [snapshot, setSnapshot] = createSignal<ScanSnapshot | null>(null);

  const sel = selectionStore();
  const selectedNode = createMemo(() => {
    const t = tree();
    const id = sel.selectedId();
    if (!t || id === null) return null;
    return t.nodes[id] ?? null;
  });

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Priority 1: dismiss context menu if open
        if (ctxMenuOpen()) {
          dismissCtxMenu();
          e.preventDefault();
          return;
        }
        // Priority 2: close details panel if open
        if (sel.selectedId() !== null) {
          sel.select(null);
          e.preventDefault();
          return;
        }
        // Priority 3: zoom out one level
        const t = tree();
        const cur = currentRoot();
        if (t && cur !== null && cur !== t.root_id) {
          const node = t.nodes[cur];
          if (node && node.parent_id !== null && node.parent_id !== undefined) {
            setCurrentRoot(node.parent_id);
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
        handleRescan();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));

    // Register scan event listeners FIRST so they're ready before any scan
    // can be triggered. The FDA check follows. Otherwise a granted-FDA cold
    // start can race with the listener registration and lose early events.
    // Live elapsed-time tick while scanning.
    const elapsedTimer = window.setInterval(() => {
      if (scanning()) {
        const started = counters().startedAt;
        if (started > 0) setElapsedMs(Date.now() - started);
      }
    }, 250);
    onCleanup(() => window.clearInterval(elapsedTimer));

    void (async () => {
      await onScanProgress((ev) => {
        setEvent(ev);
        if (ev.event === "walk_started") {
          setPhases((ps) => setPhase(ps, "walk", "active"));
        } else if (ev.event === "walk_progress") {
          setCounters((c) => ({
            ...c,
            dirs: ev.dirs_seen,
            files: ev.files_seen,
            bytes: ev.bytes_seen,
          }));
        } else if (ev.event === "walk_snapshot") {
          setSnapshot({ topDirs: ev.top_dirs, biggestFiles: ev.biggest_files });
        } else if (ev.event === "walk_completed") {
          setPhases((ps) => setPhase(ps, "walk", "done"));
        } else if (ev.event === "probe_started") {
          setPhases((ps) => setPhase(ps, ev.kind, "active"));
        } else if (ev.event === "probe_completed") {
          setPhases((ps) => setPhase(ps, ev.kind, "done"));
        }
      });
      await onScanComplete(async (t) => {
        setPhases((ps) => ps.map((p) =>
          p.status === "active" ? { ...p, status: "done" } : p,
        ));
        setTree(t);
        setCurrentRoot(t.root_id);
        setScanning(false);
        try { await startWatching(t.source_path); } catch {}
      });
      await onScanError((msg) => {
        setScanning(false);
        setEvent({ event: "error", message: msg });
      });
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
      // FDA check runs AFTER listeners are wired so the main UI can't render
      // (and the user can't click a preset) until events can be received.
      const initial = await checkFullDiskAccess();
      setHasFda(initial === "granted");
      setFdaChecked(true);
    })();
  });

  async function scanPath(p: string) {
    if (scanning()) return;
    setLastScannedPath(p);
    setTree(null);
    setScanning(true);
    setEvent(null);
    setCounters({ dirs: 0, files: 0, bytes: 0, startedAt: Date.now() });
    setPhases(INITIAL_PHASES);
    setElapsedMs(0);
    setSnapshot(null);
    sel.select(null);
    await startScan(p);
  }

  async function handlePick() {
    if (scanning()) return;
    const p = await pickDirectory();
    if (!p) return;
    await scanPath(p);
  }

  async function handleRescan() {
    if (scanning()) return;
    const p = lastScannedPath();
    if (!p) return;
    await scanPath(p);
  }

  return (
    <Show when={hasFda()} fallback={<Onboarding onGranted={() => setHasFda(true)} />}>
      <div style={{ height: "100vh", display: "flex", "flex-direction": "column" }}>
        <header style={header}>
          <button onClick={() => setSidebarOpen(!sidebarOpen())} style={iconBtn} title="Toggle sidebar">⌘</button>
          <span style={{ "font-weight": 700, "letter-spacing": "-0.3px" }}>Strata</span>
          <Show when={tree() && currentRoot() !== null}>
            <Breadcrumb tree={tree()!} currentId={currentRoot()!} onJumpTo={setCurrentRoot} />
          </Show>
          <button
            onClick={handleRescan}
            disabled={!lastScannedPath() || scanning()}
            title="Rescan current folder (⌘R)"
            style={rescanBtn}
          >↻ Rescan</button>
          <div style={{ "margin-left": "auto" }}>
            <ProgressBar event={event()} active={scanning()} />
          </div>
        </header>
        <div style={{ flex: 1, display: "flex", "min-height": 0 }}>
          <Sidebar tree={tree()} visible={sidebarOpen()} onPick={handlePick} />
          <main style={{ flex: 1, display: "flex", "flex-direction": "column", "min-width": 0 }}>
            <Show when={!tree() && !scanning()}>
              <QuickPicker onPick={(p) => { void scanPath(p); }} onCustom={handlePick} />
            </Show>
            <Show when={scanning() && !tree()}>
              <ScanningState
                path={lastScannedPath()}
                event={event()}
                counters={counters()}
                phases={phases()}
                elapsedMs={elapsedMs()}
                snapshot={snapshot()}
                onCancel={() => { setScanning(false); setEvent(null); }}
              />
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
        <span style={versionBadge} title="Strata version">v{APP_VERSION}</span>
      </div>
    </Show>
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
const versionBadge = {
  position: "fixed",
  left: "8px",
  bottom: "6px",
  color: "#4b5563",
  "font-size": "10px",
  "font-family": "SF Mono, monospace",
  "letter-spacing": "0.3px",
  "pointer-events": "none",
  "user-select": "none",
  "z-index": 10,
} as const;
const rescanBtn = {
  background: "transparent",
  border: "1px solid #1a1a22",
  color: "#9ca3af",
  padding: "4px 10px",
  "border-radius": "5px",
  "font-size": "11px",
  cursor: "pointer",
  "margin-left": "8px",
} as const;
