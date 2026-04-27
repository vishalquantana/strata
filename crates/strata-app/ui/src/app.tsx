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
