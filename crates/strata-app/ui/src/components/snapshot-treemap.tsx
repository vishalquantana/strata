import { createMemo, For, Show } from "solid-js";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import type { TopDir } from "../types";
import { revealInFinder } from "../ipc";

interface Props {
  topDirs: TopDir[];
  width: number;
  height: number;
  onTrash?: (path: string) => void;
}

interface Tile {
  dir: TopDir;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

// Stable hue palette — distinct enough to read at a glance.
const PALETTE = [
  "#3b82f6", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#e11d48", "#0ea5e9",
  "#a855f7", "#14b8a6",
] as const;

export default function SnapshotTreemap(props: Props) {
  const tiles = createMemo<Tile[]>(() => {
    const dirs = props.topDirs;
    if (dirs.length === 0 || props.width <= 0 || props.height <= 0) return [];

    const root = hierarchy({
      name: "root",
      children: dirs.map((d, i) => ({ name: d.name, value: d.size_bytes, _i: i, _dir: d })),
    } as any).sum((n: any) => n.value ?? 0);

    treemap<any>()
      .tile(treemapSquarify.ratio(1.4))
      .size([props.width, props.height])
      .padding(2)
      .round(true)(root);

    const out: Tile[] = [];
    root.leaves().forEach((leaf: any) => {
      const i = leaf.data._i as number;
      const dir = leaf.data._dir as TopDir;
      out.push({
        dir,
        x: leaf.x0,
        y: leaf.y0,
        w: leaf.x1 - leaf.x0,
        h: leaf.y1 - leaf.y0,
        color: PALETTE[i % PALETTE.length],
      });
    });
    return out;
  });

  return (
    <Show when={tiles().length > 0} fallback={<div style={emptyStyle}>Collecting…</div>}>
      <div
        style={{
          position: "relative",
          width: `${props.width}px`,
          height: `${props.height}px`,
          "border-radius": "10px",
          overflow: "hidden",
          border: "1px solid #1a1a22",
          background: "#0d0d12",
        }}
      >
        <For each={tiles()}>
          {(t) => {
            const showLabel = t.w >= 60 && t.h >= 32;
            const showSize = t.w >= 80 && t.h >= 50;
            const showActions = t.w >= 90 && t.h >= 60;
            return (
              <div
                style={{
                  position: "absolute",
                  left: `${t.x}px`,
                  top: `${t.y}px`,
                  width: `${t.w}px`,
                  height: `${t.h}px`,
                  background: t.color,
                  "border-radius": "4px",
                  cursor: "pointer",
                  overflow: "hidden",
                  color: "#0d0d12",
                  "box-sizing": "border-box",
                  padding: "8px 10px",
                  transition: "transform 200ms ease, opacity 200ms ease",
                }}
                title={`${t.dir.path} — ${formatBytes(t.dir.size_bytes)}`}
                onClick={() => void revealInFinder(t.dir.path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void revealInFinder(t.dir.path);
                }}
              >
                <Show when={showLabel}>
                  <div
                    style={{
                      "font-size": "11px",
                      "font-weight": 600,
                      "white-space": "nowrap",
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                    }}
                  >
                    {t.dir.name}
                  </div>
                </Show>
                <Show when={showSize}>
                  <div
                    style={{
                      "font-size": "10px",
                      "font-weight": 500,
                      opacity: 0.85,
                      "font-variant-numeric": "tabular-nums",
                      "margin-top": "2px",
                    }}
                  >
                    {formatBytes(t.dir.size_bytes)}
                  </div>
                </Show>
                <Show when={showActions && props.onTrash}>
                  <button
                    style={trashTileBtn}
                    title="Move to Trash"
                    aria-label="Move to Trash"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onTrash!(t.dir.path);
                    }}
                  >
                    {trashIconSvg()}
                  </button>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
}

function trashIconSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function formatBytes(b: number): string {
  if (b === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

const emptyStyle = {
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  height: "280px",
  "border-radius": "10px",
  border: "1px solid #1a1a22",
  background: "#0d0d12",
  color: "#6b7280",
  "font-size": "12px",
  "font-family": "SF Mono, monospace",
} as const;

const trashTileBtn = {
  position: "absolute",
  top: "6px",
  right: "6px",
  background: "rgba(13, 13, 18, 0.4)",
  border: "1px solid rgba(13, 13, 18, 0.4)",
  color: "#0d0d12",
  width: "22px",
  height: "22px",
  display: "inline-flex",
  "align-items": "center",
  "justify-content": "center",
  "border-radius": "5px",
  cursor: "pointer",
  padding: 0,
  "backdrop-filter": "blur(2px)",
} as const;
