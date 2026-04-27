import type { DirNode } from "../types";

interface Props {
  node: DirNode | null;
  x: number;
  y: number;
}

export default function HoverPeek(props: Props) {
  if (!props.node) return null;
  const n = props.node;
  return (
    <div style={{ ...wrap, left: `${clamp(props.x + 12, 8, window.innerWidth - 240)}px`, top: `${clamp(props.y + 12, 8, window.innerHeight - 100)}px` }}>
      <div style={name}>{n.name}</div>
      <div style={size}>{formatBytes(n.size_bytes)} · {n.file_count.toLocaleString()} files</div>
      <div style={meta}>
        <span>Used {n.signals.last_used_at ? relative(n.signals.last_used_at) : "never tracked"}</span>
      </div>
      <div style={badges}>
        {n.signals.is_known_junk && <span style={{ ...badge, background: "#10b981", color: "#022c22" }}>JUNK</span>}
        {n.signals.is_backed_up_tm && <span style={{ ...badge, background: "#3b82f6", color: "#0a1f44" }}>TM</span>}
        {n.signals.duplicate_group_id !== null && <span style={{ ...badge, background: "#ec4899", color: "#3a0822" }}>DUPE</span>}
        {isStale(n) && <span style={{ ...badge, background: "#f59e0b", color: "#3a2400" }}>STALE</span>}
      </div>
    </div>
  );
}

const wrap = {
  position: "fixed",
  background: "rgba(13,13,18,0.96)",
  "backdrop-filter": "blur(12px)",
  border: "1px solid #1a1a22",
  "border-radius": "8px",
  padding: "10px 12px",
  "box-shadow": "0 8px 24px rgba(0,0,0,0.4)",
  "pointer-events": "none",
  "z-index": 100,
  "min-width": "180px",
  "max-width": "240px",
} as const;
const name = {
  color: "#fff",
  "font-weight": 600,
  "font-size": "13px",
  "margin-bottom": "2px",
  "white-space": "nowrap",
  overflow: "hidden",
  "text-overflow": "ellipsis",
} as const;
const size = {
  color: "#9ca3af",
  "font-size": "11px",
  "font-family": "SF Mono, monospace",
  "margin-bottom": "6px",
} as const;
const meta = {
  color: "#6b7280",
  "font-size": "11px",
  "margin-bottom": "8px",
} as const;
const badges = {
  display: "flex", "flex-wrap": "wrap", gap: "4px",
} as const;
const badge = {
  padding: "1px 6px",
  "border-radius": "3px",
  "font-size": "9px",
  "font-weight": 700,
  "letter-spacing": "0.5px",
} as const;

function isStale(n: DirNode): boolean {
  const lu = n.signals.last_used_at ? new Date(n.signals.last_used_at).getTime() : 0;
  const lm = new Date(n.signals.last_modified_at).getTime();
  return (Date.now() - Math.max(lu, lm)) / 86_400_000 > 180;
}
function relative(iso: string): string {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (days < 1) return "today";
  if (days < 30) return `${Math.round(days)}d ago`;
  if (days < 365) return `${Math.round(days/30)}mo ago`;
  return `${(days/365).toFixed(1)}y ago`;
}
function formatBytes(b: number): string {
  const u = ["B","KB","MB","GB","TB"];
  let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
