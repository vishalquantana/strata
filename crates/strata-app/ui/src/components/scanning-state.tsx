import { For, Show } from "solid-js";
import type { BigFile, ProgressEvent, TopDir } from "../types";
import { revealInFinder } from "../ipc";

export interface ScanCounters {
  dirs: number;
  files: number;
  bytes: number;
  startedAt: number; // epoch ms
}

export type PhaseStatus = "pending" | "active" | "done";
export interface PhaseEntry {
  id: string;
  label: string;
  status: PhaseStatus;
}

export interface ScanSnapshot {
  topDirs: TopDir[];
  biggestFiles: BigFile[];
}

interface Props {
  path: string | null;
  event: ProgressEvent | null;
  counters: ScanCounters;
  phases: PhaseEntry[];
  elapsedMs: number;
  snapshot: ScanSnapshot | null;
  onCancel: () => void;
}

export default function ScanningState(props: Props) {
  const currentPhase = () => props.phases.find((p) => p.status === "active");
  const totalTopDirSize = () =>
    props.snapshot?.topDirs.reduce((s, d) => s + d.size_bytes, 0) ?? 0;

  return (
    <div style={wrap}>
      <div style={topRow}>
        <div class="scan-stage" style={{ "margin-right": "16px" }}>
          <div class="scan-ring scan-ring-1" />
          <div class="scan-ring scan-ring-2" />
          <div class="scan-ring scan-ring-3" />
          <div class="scan-core" />
        </div>
        <div style={topRowText}>
          <h2 style={title}>Scanning…</h2>
          <p style={pathStyle}>{props.path ?? ""}</p>
          <p style={phaseStyle}>{currentPhase()?.label ?? "Starting…"}</p>
        </div>
      </div>

      <div style={countersRow}>
        <Counter label="Folders" value={props.counters.dirs.toLocaleString()} />
        <Counter label="Files" value={props.counters.files.toLocaleString()} />
        <Counter label="Size" value={formatBytes(props.counters.bytes)} />
        <Counter label="Elapsed" value={formatElapsed(props.elapsedMs)} />
      </div>

      <Show when={(props.snapshot?.topDirs.length ?? 0) > 0}>
        <Section title="Top folders so far">
          <div style={topDirsBar}>
            <For each={props.snapshot!.topDirs}>
              {(dir, i) => {
                const total = totalTopDirSize();
                const pct = total > 0 ? (dir.size_bytes / total) * 100 : 0;
                return (
                  <div
                    style={{
                      ...topDirCell,
                      flex: `${Math.max(pct, 4)} 1 0`,
                      background: dirColor(i()),
                    }}
                    title={`${dir.path} — ${formatBytes(dir.size_bytes)}`}
                  >
                    <div style={topDirName}>{dir.name}</div>
                    <div style={topDirSize}>{formatBytes(dir.size_bytes)}</div>
                  </div>
                );
              }}
            </For>
          </div>
        </Section>
      </Show>

      <Show when={(props.snapshot?.biggestFiles.length ?? 0) > 0}>
        <Section title="Biggest files found">
          <ol style={fileList}>
            <For each={props.snapshot!.biggestFiles.slice(0, 10)}>
              {(f) => (
                <li
                  style={fileRow}
                  title={`${f.path}\n\nRight-click or click the folder icon to reveal in Finder`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    void revealInFinder(f.path);
                  }}
                >
                  <span style={fileName}>{f.name}</span>
                  <button
                    style={revealBtn}
                    onClick={(e) => { e.stopPropagation(); void revealInFinder(f.path); }}
                    title="Reveal in Finder"
                    aria-label="Reveal in Finder"
                  >
                    {folderIconSvg()}
                  </button>
                  <span style={fileSize}>{formatBytes(f.size_bytes)}</span>
                </li>
              )}
            </For>
          </ol>
        </Section>
      </Show>

      <Show when={props.phases.length > 0}>
        <ol style={timeline}>
          <For each={props.phases}>
            {(phase) => (
              <li style={timelineItem}>
                <span style={iconStyle(phase.status)}>{iconFor(phase.status)}</span>
                <span style={phaseLabelStyle(phase.status)}>{phase.label}</span>
              </li>
            )}
          </For>
        </ol>
      </Show>

      <button onClick={props.onCancel} style={cancelBtn}>Cancel</button>
    </div>
  );
}

function Counter(p: { label: string; value: string }) {
  return (
    <div style={counterCell}>
      <div style={counterValue}>{p.value}</div>
      <div style={counterLabel}>{p.label}</div>
    </div>
  );
}

function Section(p: { title: string; children: any }) {
  return (
    <div style={section}>
      <div style={sectionTitle}>{p.title}</div>
      {p.children}
    </div>
  );
}

function folderIconSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function iconFor(s: PhaseStatus): string {
  if (s === "done") return "✓";
  if (s === "active") return "●";
  return "○";
}

// Stable hue palette for the top-dirs bar — distinct enough to read at a glance.
const DIR_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#e11d48", "#0ea5e9",
  "#a855f7", "#14b8a6",
] as const;
function dirColor(i: number): string {
  return DIR_COLORS[i % DIR_COLORS.length];
}

function formatBytes(b: number): string {
  if (b === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

const wrap = {
  flex: 1,
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  "justify-content": "flex-start",
  gap: "12px",
  padding: "32px 32px 24px",
  "overflow-y": "auto",
  "max-width": "100%",
} as const;

const topRow = {
  display: "flex",
  "align-items": "center",
  gap: "8px",
  "margin-top": "8px",
} as const;
const topRowText = {
  display: "flex",
  "flex-direction": "column",
  "align-items": "flex-start",
  gap: "2px",
} as const;

const title = {
  margin: 0,
  "font-weight": 600,
  "letter-spacing": "-0.5px",
} as const;

const pathStyle = {
  margin: 0,
  color: "#9ca3af",
  "font-size": "13px",
  "font-family": "SF Mono, monospace",
  "max-width": "640px",
  "overflow-wrap": "anywhere",
} as const;

const phaseStyle = {
  margin: 0,
  color: "#7c8aa3",
  "font-size": "12px",
  "font-family": "SF Mono, monospace",
} as const;

const countersRow = {
  display: "flex",
  gap: "32px",
  "padding": "16px 24px",
  "border": "1px solid #1a1a22",
  "border-radius": "10px",
  background: "#0d0d12",
} as const;

const counterCell = {
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  "min-width": "90px",
} as const;

const counterValue = {
  "font-size": "22px",
  "font-weight": 600,
  "letter-spacing": "-0.5px",
  color: "#f5f5f7",
  "font-variant-numeric": "tabular-nums",
} as const;

const counterLabel = {
  "font-size": "10px",
  "text-transform": "uppercase",
  "letter-spacing": "1px",
  color: "#6b7280",
  "margin-top": "4px",
} as const;

const section = {
  width: "100%",
  "max-width": "780px",
  display: "flex",
  "flex-direction": "column",
  gap: "8px",
} as const;

const sectionTitle = {
  "font-size": "10px",
  "text-transform": "uppercase",
  "letter-spacing": "1.2px",
  color: "#6b7280",
  "padding-left": "2px",
} as const;

const topDirsBar = {
  display: "flex",
  height: "60px",
  "border-radius": "8px",
  overflow: "hidden",
  border: "1px solid #1a1a22",
  background: "#0d0d12",
} as const;

const topDirCell = {
  "min-width": "0",
  padding: "8px 10px",
  display: "flex",
  "flex-direction": "column",
  "justify-content": "space-between",
  color: "#0d0d12",
  "font-weight": 600,
  overflow: "hidden",
  transition: "flex 400ms ease",
} as const;

const topDirName = {
  "font-size": "11px",
  "white-space": "nowrap",
  overflow: "hidden",
  "text-overflow": "ellipsis",
} as const;

const topDirSize = {
  "font-size": "10px",
  opacity: 0.85,
  "font-variant-numeric": "tabular-nums",
} as const;

const fileList = {
  "list-style": "none",
  margin: 0,
  padding: "8px 12px",
  background: "#0d0d12",
  border: "1px solid #1a1a22",
  "border-radius": "8px",
  display: "flex",
  "flex-direction": "column",
  gap: "4px",
} as const;

const fileRow = {
  display: "flex",
  "justify-content": "space-between",
  gap: "16px",
  "font-size": "12px",
  "font-family": "SF Mono, monospace",
  "padding": "4px 6px",
} as const;

const fileName = {
  color: "#e5e7eb",
  overflow: "hidden",
  "text-overflow": "ellipsis",
  "white-space": "nowrap",
  "min-width": "0",
  flex: 1,
} as const;

const fileSize = {
  color: "#60a5fa",
  "font-variant-numeric": "tabular-nums",
  "white-space": "nowrap",
  "min-width": "60px",
  "text-align": "right",
} as const;

const revealBtn = {
  background: "transparent",
  border: "1px solid #2a2a32",
  color: "#9ca3af",
  width: "26px",
  height: "22px",
  display: "inline-flex",
  "align-items": "center",
  "justify-content": "center",
  "border-radius": "5px",
  cursor: "pointer",
  padding: 0,
} as const;

const timeline = {
  "list-style": "none",
  margin: "8px 0 0",
  padding: 0,
  display: "flex",
  "flex-direction": "row",
  "flex-wrap": "wrap",
  gap: "16px",
  "justify-content": "center",
  "max-width": "780px",
} as const;

const timelineItem = {
  display: "flex",
  "align-items": "center",
  gap: "6px",
  "font-size": "11px",
  "font-family": "SF Mono, monospace",
} as const;

function iconStyle(s: PhaseStatus) {
  return {
    width: "14px",
    "text-align": "center",
    color: s === "done" ? "#34d399" : s === "active" ? "#60a5fa" : "#374151",
    "font-size": "12px",
  } as const;
}

function phaseLabelStyle(s: PhaseStatus) {
  return {
    color: s === "done" ? "#9ca3af" : s === "active" ? "#f5f5f7" : "#4b5563",
    "font-weight": s === "active" ? 600 : 400,
  } as const;
}

const cancelBtn = {
  "margin-top": "8px",
  background: "transparent",
  border: "1px solid #2a2a32",
  color: "#9ca3af",
  padding: "6px 16px",
  "border-radius": "6px",
  "font-size": "12px",
  cursor: "pointer",
} as const;
