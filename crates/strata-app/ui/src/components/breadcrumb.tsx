import type { DirNode, ScanTree } from "../types";

interface Props {
  tree: ScanTree;
  currentId: number;
  onJumpTo: (id: number) => void;
}

export default function Breadcrumb(props: Props) {
  const path: DirNode[] = [];
  let cur: DirNode | undefined = props.tree.nodes[props.currentId];
  while (cur) {
    path.unshift(cur);
    cur = cur.parent_id !== null ? props.tree.nodes[cur.parent_id] : undefined;
  }
  return (
    <div style={wrap}>
      {path.map((n, i) => (
        <>
          <button onClick={() => props.onJumpTo(n.id)} style={crumb}>{n.name || "/"}</button>
          {i < path.length - 1 && <span style={sep}>›</span>}
        </>
      ))}
    </div>
  );
}

const wrap = {
  display: "flex", "align-items": "center", gap: "4px",
  "font-size": "12px",
  color: "#9ca3af",
  "font-family": "SF Mono, monospace",
} as const;
const crumb = {
  background: "transparent",
  border: "none",
  color: "#9ca3af",
  cursor: "pointer",
  padding: "2px 4px",
  "border-radius": "3px",
  "font-size": "12px",
} as const;
const sep = { color: "#4b5563" } as const;
