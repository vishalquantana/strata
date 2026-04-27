import { createSignal, onMount, Show, createMemo } from "solid-js";
import {
  pickDirectory, startScan, onScanProgress, onScanComplete, onScanError,
  startWatching,
} from "./ipc";
import Onboarding from "./components/onboarding";
import { checkFullDiskAccess } from "./ipc";
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
  const [hasFda, setHasFda] = createSignal<boolean>(false);
  // fdaChecked gates a future loading-spinner; unused for now
  const [_fdaChecked, setFdaChecked] = createSignal<boolean>(false);

  const sel = selectionStore();
  const selectedNode = createMemo(() => {
    const t = tree();
    const id = sel.selectedId();
    if (!t || id === null) return null;
    return t.nodes[id] ?? null;
  });

  onMount(async () => {
    const initial = await checkFullDiskAccess();
    setHasFda(initial === "granted");
    setFdaChecked(true);
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
    <Show when={hasFda()} fallback={<Onboarding onGranted={() => setHasFda(true)} />}>
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
