import { createSignal, createMemo, onMount, Show, For } from "solid-js";
import { pickDirectory, startScan, listVolumes, onScanProgress, onScanComplete, onScanError } from "./ipc";
import type { ProgressEvent, ScanTree, Volume } from "./types";
import Viz from "./viz/viz";
import ProgressBar from "./components/progress-bar";
import Breadcrumb from "./components/breadcrumb";

// Dev-only safety net: when this module hot-updates, force a full window
// reload so onMount/createEffect always fire fresh. No effect in production.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}

function fmtGB(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  if (gb >= 1000) return (gb / 1000).toFixed(1) + " TB";
  if (gb >= 100) return gb.toFixed(0) + " GB";
  return gb.toFixed(1) + " GB";
}

function phaseLabel(ev: ProgressEvent | null): string {
  if (!ev) return "Preparing…";
  switch (ev.event) {
    case "walk_started": return "Walking the filesystem…";
    case "walk_progress": return "Walking the filesystem…";
    case "walk_completed": return `Walked ${ev.node_count.toLocaleString()} folders…`;
    case "probe_started":
      switch (ev.kind) {
        case "tm": return "Checking Time Machine backups…";
        case "icloud": return "Checking iCloud sync…";
        case "spotlight": return "Reading Spotlight metadata…";
        case "hash": return "Hashing for duplicates…";
        default: return `Probing ${ev.kind}…`;
      }
    case "probe_completed":
      return `Finished ${ev.kind} (${ev.applied.toLocaleString()} matched)`;
    case "scan_finished": return "Wrapping up…";
    case "error": return "Something went wrong";
  }
}

export default function App() {
  const [event, setEvent] = createSignal<ProgressEvent | null>(null);
  const [tree, setTree] = createSignal<ScanTree | null>(null);
  const [scanning, setScanning] = createSignal(false);
  const [scanningPath, setScanningPath] = createSignal<string>("");
  const [currentRoot, setCurrentRoot] = createSignal<number | null>(null);
  const [volumes, setVolumes] = createSignal<Volume[]>([]);

  async function refreshVolumes() {
    try {
      const vs = await listVolumes();
      setVolumes(vs);
    } catch (e) {
      console.error("[strata] listVolumes failed:", e);
      setVolumes([]);
    }
  }

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
    await refreshVolumes();
  });

  async function beginScan(path: string) {
    setTree(null);
    setEvent(null);
    setScanningPath(path);
    setScanning(true);
    await startScan(path);
  }

  async function handlePickFolder() {
    const p = await pickDirectory();
    if (!p) return;
    await beginScan(p);
  }

  const phase = createMemo(() => phaseLabel(event()));

  return (
    <div style={{ height: "100vh", display: "flex", "flex-direction": "column" }}>
      <header style={header}>
        <span style={{ "font-weight": 700, "letter-spacing": "-0.3px" }}>Strata</span>
        <button onClick={handlePickFolder} style={btn} disabled={scanning()}>
          {scanning() ? "Scanning…" : "Pick a folder…"}
        </button>
        <button onClick={refreshVolumes} style={{ ...btn, background: "#374151" }} disabled={scanning()}>
          ↻ Refresh disks
        </button>
        <Show when={tree() && currentRoot() !== null}>
          <Breadcrumb tree={tree()!} currentId={currentRoot()!} onJumpTo={setCurrentRoot} />
        </Show>
        <div style={{ "margin-left": "auto" }}>
          <ProgressBar event={event()} active={scanning()} />
        </div>
      </header>

      {/* Disk picker (initial empty state) */}
      <Show when={!tree() && !scanning()}>
        <div style={pickerWrap}>
          <h2 style={{ margin: "0 0 6px", "font-weight": 600, "letter-spacing": "-0.5px", "font-size": "22px" }}>
            Choose a disk to scan
          </h2>
          <p style={{ margin: "0 0 28px", color: "#6b7280", "font-size": "13px" }}>
            Strata will map every folder and surface what's quietly hogging your space.
          </p>
          <div style={diskGrid}>
            <For each={volumes()}>{(v) => {
              const pct = v.total_bytes > 0 ? v.used_bytes / v.total_bytes : 0;
              return (
                <button class="disk-card" onClick={() => beginScan(v.path)}>
                  <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                    <div class="disk-icon">{v.is_internal ? "💽" : "🗄"}</div>
                    <div style={{ "min-width": 0, flex: 1, "text-align": "left" }}>
                      <div style={{ "font-size": "16px", "font-weight": 600, "letter-spacing": "-0.3px",
                                    "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
                        {v.name}
                      </div>
                      <div style={{ "font-size": "11px", color: "#6b7280", "margin-top": "2px",
                                    "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
                        {v.path} · {v.is_removable ? "Removable" : "Internal"}
                      </div>
                    </div>
                  </div>
                  <div style={{ "margin-top": "16px" }}>
                    <div style={meterTrack}>
                      <div style={{ ...meterFill, width: `${Math.round(pct * 100)}%` }} />
                    </div>
                    <div style={{ display: "flex", "justify-content": "space-between",
                                  "margin-top": "8px", "font-size": "11px", color: "#9ca3af" }}>
                      <span>{fmtGB(v.used_bytes)} used</span>
                      <span>{fmtGB(v.free_bytes)} free</span>
                    </div>
                  </div>
                </button>
              );
            }}</For>
          </div>
          <Show when={volumes().length === 0}>
            <p style={{ color: "#6b7280", "font-size": "12px" }}>No disks detected.</p>
          </Show>
          <button class="folder-link" onClick={handlePickFolder}>
            Or pick a specific folder…
          </button>
        </div>
      </Show>

      {/* Scanning animation */}
      <Show when={scanning()}>
        <div style={scanWrap}>
          <div class="scan-stage">
            <div class="scan-ring scan-ring-1" />
            <div class="scan-ring scan-ring-2" />
            <div class="scan-ring scan-ring-3" />
            <div class="scan-core" />
          </div>
          <div style={{ "margin-top": "44px", "font-size": "16px", "font-weight": 600, "letter-spacing": "-0.3px" }}>
            {phase()}
          </div>
          <div style={{ "margin-top": "8px", "font-size": "12px", color: "#6b7280",
                        "max-width": "560px", "white-space": "nowrap", overflow: "hidden",
                        "text-overflow": "ellipsis" }}>
            {scanningPath()}
          </div>
          <Show when={event()?.event === "error"}>
            <div style={{ "margin-top": "16px", color: "#f87171", "font-size": "12px" }}>
              {(event() as any).message}
            </div>
          </Show>
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
const pickerWrap = {
  flex: 1,
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  "justify-content": "center",
  color: "#e5e7eb",
  padding: "32px",
  overflow: "auto",
} as const;
const diskGrid = {
  display: "grid",
  "grid-template-columns": "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
  width: "100%",
  "max-width": "920px",
  "margin-bottom": "24px",
} as const;
const meterTrack = {
  height: "6px",
  background: "#1a1a22",
  "border-radius": "3px",
  overflow: "hidden",
} as const;
const meterFill = {
  height: "100%",
  background: "linear-gradient(90deg, #6c8cff 0%, #a78bfa 100%)",
  "border-radius": "3px",
  transition: "width 0.3s ease",
} as const;
const scanWrap = {
  flex: 1,
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  "justify-content": "center",
  color: "#e5e7eb",
  padding: "32px",
} as const;
