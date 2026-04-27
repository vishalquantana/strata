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
