import { createMemo, For, Show } from "solid-js";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import type { TopDir } from "../types";
import { revealInFinder } from "../ipc";

interface Props {
  topDirs: TopDir[];
  width: number;
  height: number;
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
      <svg
        width={props.width}
        height={props.height}
        style={svgStyle}
        viewBox={`0 0 ${props.width} ${props.height}`}
      >
        <For each={tiles()}>
          {(t) => {
            const showLabel = t.w >= 60 && t.h >= 28;
            const showSize = t.w >= 80 && t.h >= 44;
            return (
              <g
                style={{ cursor: "pointer" }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void revealInFinder(t.dir.path);
                }}
                onClick={() => void revealInFinder(t.dir.path)}
              >
                <title>{`${t.dir.path} — ${formatBytes(t.dir.size_bytes)}`}</title>
                <rect
                  x={t.x}
                  y={t.y}
                  width={t.w}
                  height={t.h}
                  fill={t.color}
                  rx={4}
                  ry={4}
                />
                <Show when={showLabel}>
                  <text
                    x={t.x + 8}
                    y={t.y + 16}
                    fill="#0d0d12"
                    font-size="11"
                    font-weight="600"
                    style={{ "pointer-events": "none" }}
                  >
                    {truncate(t.dir.name, Math.max(4, Math.floor(t.w / 7)))}
                  </text>
                </Show>
                <Show when={showSize}>
                  <text
                    x={t.x + 8}
                    y={t.y + 30}
                    fill="#0d0d12"
                    font-size="10"
                    font-weight="500"
                    opacity="0.85"
                    style={{ "pointer-events": "none", "font-variant-numeric": "tabular-nums" }}
                  >
                    {formatBytes(t.dir.size_bytes)}
                  </text>
                </Show>
              </g>
            );
          }}
        </For>
      </svg>
    </Show>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}

function formatBytes(b: number): string {
  if (b === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

const svgStyle = {
  display: "block",
  "border-radius": "8px",
  overflow: "hidden",
  border: "1px solid #1a1a22",
  background: "#0d0d12",
} as const;

const emptyStyle = {
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  height: "260px",
  "border-radius": "8px",
  border: "1px solid #1a1a22",
  background: "#0d0d12",
  color: "#6b7280",
  "font-size": "12px",
  "font-family": "SF Mono, monospace",
} as const;
