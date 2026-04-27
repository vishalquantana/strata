import type { ScanTree } from "../types";

interface Props {
  tree: ScanTree | null;
  onPick: () => void;
}

export default function VolumesSection(props: Props) {
  return (
    <div style={section}>
      <div style={label}>Volumes</div>
      {props.tree ? (
        <div style={row}>
          <span style={{ color: "#e5e7eb" }}>{shortName(props.tree.source_path)}</span>
          <span style={{ color: "#6b7280", "font-size": "11px" }}>
            {formatBytes(props.tree.nodes[props.tree.root_id].size_bytes)}
          </span>
        </div>
      ) : (
        <button onClick={props.onPick} style={pickBtn}>+ Pick a folder…</button>
      )}
    </div>
  );
}

const section = { padding: "12px 12px 4px" } as const;
const label = {
  color: "#4b5563",
  "font-size": "10px",
  "text-transform": "uppercase",
  "letter-spacing": "1.5px",
  "margin-bottom": "8px",
} as const;
const row = {
  display: "flex", "align-items": "center", "justify-content": "space-between",
  padding: "6px 8px", "border-radius": "6px",
  background: "#13131a",
  "font-size": "12px",
} as const;
const pickBtn = {
  width: "100%",
  background: "transparent",
  border: "1px dashed #2a2a32",
  color: "#9ca3af",
  padding: "8px",
  "border-radius": "6px",
  cursor: "pointer",
  "font-size": "12px",
} as const;

function shortName(p: string): string {
  const parts = p.split("/");
  return parts[parts.length - 1] || p;
}
function formatBytes(b: number): string {
  const u = ["B","KB","MB","GB","TB"];
  let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}
