import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { BigFile, ProgressEvent, TopDir } from "../types";
import { moveToTrash, revealInFinder } from "../ipc";
import CloudBadge from "./cloud-badge";
import SnapshotTreemap from "./snapshot-treemap";

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
  shortLabel: string;
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

// Wide layout: header + counters span the full content width; below them a
// 2-col grid splits the treemap (left, more space) and the biggest-files list
// (right, tall + scrollable) so the user can drill while watching the map.
const MAX_WIDTH = 1400;
const TREEMAP_HEIGHT = 520;

export default function ScanningState(props: Props) {
  const currentPhase = () => props.phases.find((p) => p.status === "active");

  // Paths the user has chosen to trash from inside the live scan view.
  // Optimistic: removed immediately from the view. Hidden in subsequent
  // snapshots too (path-prefix match).
  const [deleted, setDeleted] = createSignal<string[]>([]);

  // Cloud-synced files (iCloud / Google Drive / OneDrive / Dropbox / Box)
  // are hidden by default — trashing them is rarely useful for local-disk
  // cleanup and dehydrated copies take ~0 B locally anyway. The user can
  // toggle them back into view with the chip near the section title.
  const [showCloud, setShowCloud] = createSignal(false);

  // The treemap renderer needs an explicit pixel width. Measure the
  // container with ResizeObserver so the map stays responsive when the
  // window is resized (or sidebar toggled).
  const [treemapWidth, setTreemapWidth] = createSignal(800);
  let treemapHostRef: HTMLDivElement | undefined;
  let ro: ResizeObserver | undefined;
  onMount(() => {
    if (!treemapHostRef) return;
    ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.floor(e.contentRect.width);
        if (w > 0) setTreemapWidth(w);
      }
    });
    ro.observe(treemapHostRef);
  });
  onCleanup(() => {
    ro?.disconnect();
  });

  const isDeleted = (path: string): boolean => {
    const list = deleted();
    return list.some((d) => path === d || path.startsWith(d + "/"));
  };

  const visibleTopDirs = createMemo(() => {
    const dirs = props.snapshot?.topDirs ?? [];
    return dirs.filter((d) => !isDeleted(d.path));
  });

  // Files that match the deleted/cloud filters are dropped from the
  // visible list. We split into two memos so the section title can show
  // "(N hidden cloud files — show)" without recomputing the heavy filter.
  const undeletedFiles = createMemo(() =>
    (props.snapshot?.biggestFiles ?? []).filter((f) => !isDeleted(f.path)),
  );
  const cloudFiles = createMemo(() =>
    undeletedFiles().filter((f) => f.cloud_provider != null),
  );
  const visibleFiles = createMemo(() => {
    if (showCloud()) return undeletedFiles();
    return undeletedFiles().filter((f) => f.cloud_provider == null);
  });

  const handleTrash = async (path: string) => {
    // Optimistic: hide immediately. If the trash call fails, we don't
    // un-hide — the row would just reappear on the next snapshot.
    setDeleted((d) => [...d, path]);
    try {
      await moveToTrash(path);
    } catch (err) {
      console.error("trash failed", path, err);
    }
  };

  return (
    <div style={wrap}>
      <div style={column}>
        {/* Header card */}
        <div style={headerCard}>
          <div class="scan-stage" style={ringWrap}>
            <div class="scan-ring scan-ring-1" />
            <div class="scan-ring scan-ring-2" />
            <div class="scan-ring scan-ring-3" />
            <div class="scan-core" />
          </div>
          <div style={headerText}>
            <h2 style={title}>Scanning…</h2>
            <p style={pathStyle}>{props.path ?? ""}</p>
            <p style={phaseStyle}>{currentPhase()?.label ?? "Starting…"}</p>
          </div>
        </div>

        {/* Counters strip */}
        <div style={countersRow}>
          <Counter label="Folders" value={props.counters.dirs.toLocaleString()} />
          <Divider />
          <Counter label="Files" value={props.counters.files.toLocaleString()} />
          <Divider />
          <Counter label="Size" value={formatBytes(props.counters.bytes)} />
          <Divider />
          <Counter label="Elapsed" value={formatElapsed(props.elapsedMs)} />
        </div>

        {/* 2-col grid: treemap left, biggest-files right. Both panels are
            tall and aligned at the top so the user can compare a folder
            tile to the heavy files inside it at a glance. */}
        <div style={twoCol}>
          {/* Left: treemap */}
          <div style={leftCol}>
            <div style={sectionTitle}>Top folders so far</div>
            <div ref={treemapHostRef} style={{ width: "100%" }}>
              <Show
                when={visibleTopDirs().length > 0}
                fallback={
                  <div style={treemapPlaceholder}>Collecting…</div>
                }
              >
                <SnapshotTreemap
                  topDirs={visibleTopDirs()}
                  width={treemapWidth()}
                  height={TREEMAP_HEIGHT}
                  onTrash={handleTrash}
                />
              </Show>
            </div>
          </div>

          {/* Right: biggest-files list */}
          <div style={rightCol}>
            <div style={sectionTitleRow}>
              <div style={sectionTitle}>
                Biggest files found ({visibleFiles().length})
              </div>
              <Show when={cloudFiles().length > 0}>
                <button
                  onClick={() => setShowCloud((v) => !v)}
                  style={cloudToggle(showCloud())}
                  title={
                    showCloud()
                      ? "Hide files synced from iCloud / Google Drive / OneDrive / Dropbox"
                      : "Show files synced from iCloud / Google Drive / OneDrive / Dropbox"
                  }
                >
                  {showCloud()
                    ? `Hide cloud (${cloudFiles().length})`
                    : `Show cloud (${cloudFiles().length})`}
                </button>
              </Show>
            </div>
            <Show
              when={visibleFiles().length > 0}
              fallback={<div style={listPlaceholder}>Collecting…</div>}
            >
              <ol style={fileList}>
                <For each={visibleFiles()}>
                  {(f) => (
                    <li
                      style={fileRow}
                      title={`${f.path}\n\nRight-click to reveal in Finder`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        void revealInFinder(f.path);
                      }}
                    >
                      <CloudBadge
                        provider={f.cloud_provider ?? null}
                        dehydrated={f.is_dehydrated}
                      />
                      <span style={fileName}>{f.name}</span>
                      <span style={fileSize}>{formatBytes(f.size_bytes)}</span>
                      <div style={rowActions}>
                        <button
                          style={iconBtn}
                          onClick={(e) => { e.stopPropagation(); void revealInFinder(f.path); }}
                          title="Reveal in Finder"
                          aria-label="Reveal in Finder"
                        >
                          {folderIconSvg()}
                        </button>
                        <button
                          style={iconBtnDanger}
                          onClick={(e) => { e.stopPropagation(); void handleTrash(f.path); }}
                          title="Move to Trash"
                          aria-label="Move to Trash"
                        >
                          {trashIconSvg()}
                        </button>
                      </div>
                    </li>
                  )}
                </For>
              </ol>
            </Show>
          </div>
        </div>

        {/* Phase timeline */}
        <Show when={props.phases.length > 0}>
          <ol style={timeline}>
            <For each={props.phases}>
              {(phase) => (
                <li style={timelineItem}>
                  <span style={iconStyle(phase.status)}>{iconFor(phase.status)}</span>
                  <span style={phaseLabelStyle(phase.status)}>{phase.shortLabel}</span>
                </li>
              )}
            </For>
          </ol>
        </Show>

        <button onClick={props.onCancel} style={cancelBtn}>Cancel</button>
      </div>
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

function Divider() {
  return <div style={counterDivider} />;
}

function folderIconSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function trashIconSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function iconFor(s: PhaseStatus): string {
  if (s === "done") return "✓";
  if (s === "active") return "●";
  return "○";
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

// ─────────────────────────── styles ───────────────────────────

const wrap = {
  flex: 1,
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  "justify-content": "flex-start",
  padding: "32px 24px 24px",
  "overflow-y": "auto",
} as const;

// Wide content area. Header + counters span this full width; below them a
// 2-col grid carves space for the treemap (left) and biggest-files (right).
const column = {
  width: "100%",
  "max-width": `${MAX_WIDTH}px`,
  display: "flex",
  "flex-direction": "column",
  gap: "20px",
} as const;

const twoCol = {
  display: "grid",
  // Treemap gets ~62% of width; biggest-files gets ~38%. Min 320px on the
  // right so the list never collapses to nothing on narrow windows.
  "grid-template-columns": "minmax(0, 1.6fr) minmax(320px, 1fr)",
  gap: "20px",
  "align-items": "start",
} as const;

const leftCol = {
  display: "flex",
  "flex-direction": "column",
  gap: "8px",
  "min-width": "0",
} as const;

const rightCol = {
  display: "flex",
  "flex-direction": "column",
  gap: "8px",
  "min-width": "0",
} as const;

const treemapPlaceholder = {
  width: "100%",
  height: `${TREEMAP_HEIGHT}px`,
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  "border-radius": "10px",
  border: "1px solid #1a1a22",
  background: "#0d0d12",
  color: "#6b7280",
  "font-size": "12px",
  "font-family": "SF Mono, monospace",
} as const;

const listPlaceholder = {
  ...treemapPlaceholder,
} as const;

const headerCard = {
  display: "flex",
  "align-items": "center",
  gap: "20px",
  padding: "20px 24px",
  border: "1px solid #1a1a22",
  "border-radius": "12px",
  background: "#0d0d12",
} as const;

const ringWrap = {
  width: "56px",
  height: "56px",
  flex: "0 0 56px",
  position: "relative",
} as const;

const headerText = {
  display: "flex",
  "flex-direction": "column",
  "align-items": "flex-start",
  gap: "2px",
  "min-width": "0",
  flex: 1,
} as const;

const title = {
  margin: 0,
  "font-size": "20px",
  "font-weight": 600,
  "letter-spacing": "-0.5px",
} as const;

const pathStyle = {
  margin: 0,
  color: "#9ca3af",
  "font-size": "13px",
  "font-family": "SF Mono, monospace",
  "overflow-wrap": "anywhere",
  width: "100%",
} as const;

const phaseStyle = {
  margin: 0,
  color: "#7c8aa3",
  "font-size": "12px",
  "font-family": "SF Mono, monospace",
} as const;

const countersRow = {
  display: "flex",
  "align-items": "stretch",
  "justify-content": "space-around",
  gap: "8px",
  padding: "20px 24px",
  border: "1px solid #1a1a22",
  "border-radius": "12px",
  background: "#0d0d12",
} as const;

const counterCell = {
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  flex: 1,
  "min-width": "0",
} as const;

const counterDivider = {
  width: "1px",
  background: "#1a1a22",
  "align-self": "stretch",
} as const;

const counterValue = {
  "font-size": "24px",
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
  "margin-top": "6px",
} as const;

const sectionTitle = {
  "font-size": "10px",
  "text-transform": "uppercase",
  "letter-spacing": "1.2px",
  color: "#6b7280",
  "padding-left": "2px",
} as const;

const sectionTitleRow = {
  display: "flex",
  "align-items": "center",
  "justify-content": "space-between",
  gap: "8px",
  "padding-bottom": "6px",
} as const;

function cloudToggle(active: boolean): Record<string, string> {
  return {
    "font-size": "10px",
    "text-transform": "uppercase",
    "letter-spacing": "1px",
    "font-weight": "600",
    padding: "3px 8px",
    "border-radius": "100px",
    background: active ? "#1d4ed8" : "transparent",
    color: active ? "#ffffff" : "#9ca3af",
    border: active ? "1px solid #1d4ed8" : "1px solid #1a1a22",
    cursor: "pointer",
    "white-space": "nowrap",
  };
}

const fileList = {
  "list-style": "none",
  margin: 0,
  padding: "8px 12px",
  background: "#0d0d12",
  border: "1px solid #1a1a22",
  "border-radius": "8px",
  display: "flex",
  "flex-direction": "column",
  gap: "2px",
  // Match the treemap panel height so the two columns visually align.
  // Backend tracks 200 biggest files; the user scrolls within this box.
  height: `${TREEMAP_HEIGHT}px`,
  "overflow-y": "auto",
  "overscroll-behavior": "contain",
} as const;

const fileRow = {
  display: "grid",
  // [badge] [name] [size] [actions]
  "grid-template-columns": "auto 1fr auto auto",
  "align-items": "center",
  "column-gap": "10px",
  "font-size": "12px",
  "font-family": "SF Mono, monospace",
  padding: "5px 6px",
  "border-radius": "5px",
} as const;

const fileName = {
  color: "#e5e7eb",
  overflow: "hidden",
  "text-overflow": "ellipsis",
  "white-space": "nowrap",
  "min-width": "0",
} as const;

const fileSize = {
  color: "#60a5fa",
  "font-variant-numeric": "tabular-nums",
  "white-space": "nowrap",
  "min-width": "64px",
  "text-align": "right",
} as const;

const rowActions = {
  display: "flex",
  "align-items": "center",
  gap: "4px",
} as const;

const iconBtn = {
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

const iconBtnDanger = {
  ...iconBtn,
  color: "#f87171",
  "border-color": "#3a2424",
} as const;

const timeline = {
  "list-style": "none",
  margin: 0,
  padding: "12px 16px",
  background: "#0d0d12",
  border: "1px solid #1a1a22",
  "border-radius": "10px",
  display: "flex",
  "flex-direction": "row",
  "justify-content": "space-between",
  "align-items": "center",
  gap: "8px",
} as const;

const timelineItem = {
  display: "flex",
  "align-items": "center",
  gap: "6px",
  "font-size": "11px",
  "font-family": "SF Mono, monospace",
  flex: 1,
  "justify-content": "center",
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
  "align-self": "center",
  "margin-top": "4px",
  background: "transparent",
  border: "1px solid #2a2a32",
  color: "#9ca3af",
  padding: "6px 20px",
  "border-radius": "6px",
  "font-size": "12px",
  cursor: "pointer",
} as const;
