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
      <Show when={!tree() && !scanning()}>
        <div style={emptyWrap}>
          <h2 style={{ margin: "0 0 8px", "font-weight": 600, "letter-spacing": "-0.5px" }}>Welcome to Strata</h2>
          <p style={{ margin: "0 0 24px", color: "#6b7280", "font-size": "14px" }}>
            Pick a folder to see what's eating your disk — and what you've forgotten.
          </p>
          <button onClick={handlePick} style={{ ...btn, padding: "10px 22px", "font-size": "13px" }}>Choose folder…</button>
        </div>
      </Show>
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
const emptyWrap = {
  flex: 1,
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  "justify-content": "center",
  color: "#e5e7eb",
} as const;
