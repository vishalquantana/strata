import { Show, createSignal } from "solid-js";
import type { DirNode, ScanTree } from "../types";
import StatRow from "./stat-row";
import { revealInFinder, moveToTrash } from "../ipc";

interface Props {
  tree: ScanTree;
  node: DirNode | null;
  onClose: () => void;
  onAfterTrash: (path: string) => void;
}

export default function DetailsPanel(props: Props) {
  const [acting, setActing] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  return (
    <Show when={props.node}>
      {(n) => (
        <aside style={shell}>
          <div style={header}>
            <button onClick={props.onClose} style={closeBtn}>✕</button>
          </div>
          <div style={body}>
            <div style={name}>{n().name}</div>
            <div style={path}>{n().path}</div>
            <div style={size}>{formatBytes(n().size_bytes)}</div>
            <div style={subSize}>{n().file_count.toLocaleString()} files</div>

            <div style={statBlock}>
              <StatRow label="Last opened" value={n().signals.last_used_at ? humanDate(n().signals.last_used_at!) : "Not tracked"} />
              <StatRow label="Last modified" value={humanDate(n().signals.last_modified_at)} />
              <StatRow label="Time Machine" value={n().signals.is_backed_up_tm ? "✓ Backed up" : "Not backed up"} />
              <StatRow label="iCloud" value={n().signals.is_in_icloud ? "✓ In iCloud" : "Local only"} />
              <StatRow label="Duplicate" value={n().signals.duplicate_group_id !== null ? `Group ${n().signals.duplicate_group_id}` : "—"} />
              <StatRow label="Junk pattern" value={n().signals.is_known_junk ? "✓ Matches junk pattern" : "—"} />
            </div>

            <div style={actions}>
              <button
                style={btnSecondary}
                disabled={acting()}
                onClick={async () => {
                  setError(null);
                  setActing(true);
                  try { await revealInFinder(n().path); } catch (e: any) { setError(String(e)); }
                  setActing(false);
                }}
              >Reveal in Finder</button>
              <button
                style={btnDanger}
                disabled={acting()}
                onClick={async () => {
                  if (!confirm(`Move ${n().name} to Trash?`)) return;
                  setError(null);
                  setActing(true);
                  try {
                    await moveToTrash(n().path);
                    props.onAfterTrash(n().path);
                  } catch (e: any) {
                    setError(String(e));
                  }
                  setActing(false);
                }}
              >Move to Trash</button>
            </div>

            <Show when={error()}>
              <div style={errBox}>{error()}</div>
            </Show>
          </div>
        </aside>
      )}
    </Show>
  );
}

function humanDate(iso: string): string {
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86_400_000;
  if (days < 1) return "today";
  if (days < 30) return `${Math.round(days)} days ago`;
  if (days < 365) return `${Math.round(days/30)} months ago`;
  return `${(days/365).toFixed(1)} years ago`;
}

function formatBytes(b: number): string {
  const u = ["B","KB","MB","GB","TB"];
  let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

const shell = {
  width: "320px",
  "min-width": "320px",
  background: "#0a0a0e",
  "border-left": "1px solid #1a1a22",
  display: "flex",
  "flex-direction": "column",
  animation: "slideInRight 0.2s ease-out",
} as const;
const header = {
  display: "flex",
  "justify-content": "flex-end",
  padding: "10px",
} as const;
const closeBtn = {
  background: "transparent",
  border: "none",
  color: "#6b7280",
  cursor: "pointer",
  "font-size": "16px",
  padding: "2px 6px",
} as const;
const body = { padding: "0 16px 16px" } as const;
const name = {
  "font-size": "16px",
  "font-weight": 700,
  color: "#fff",
  "letter-spacing": "-0.3px",
  "margin-bottom": "2px",
  "word-break": "break-word",
} as const;
const path = {
  "font-size": "11px",
  color: "#6b7280",
  "font-family": "SF Mono, monospace",
  "margin-bottom": "16px",
  "word-break": "break-all",
} as const;
const size = {
  "font-size": "26px",
  "font-weight": 700,
  color: "#fff",
  "letter-spacing": "-1px",
  "font-variant-numeric": "tabular-nums",
} as const;
const subSize = {
  color: "#6b7280",
  "font-size": "11px",
  "font-family": "SF Mono, monospace",
  "margin-bottom": "20px",
} as const;
const statBlock = { "margin-bottom": "20px" } as const;
const actions = {
  display: "flex",
  "flex-direction": "column",
  gap: "8px",
} as const;
const btnBase = {
  padding: "9px 14px",
  "border-radius": "6px",
  "font-size": "12px",
  "font-weight": 600,
  cursor: "pointer",
  border: "none",
  width: "100%",
} as const;
const btnSecondary = {
  ...btnBase,
  background: "#13131a",
  color: "#e5e7eb",
  border: "1px solid #1a1a22",
} as const;
const btnDanger = {
  ...btnBase,
  background: "#dc2626",
  color: "#fff",
} as const;
const errBox = {
  "margin-top": "12px",
  padding: "10px",
  background: "#3a0a0a",
  border: "1px solid #7f1d1d",
  "border-radius": "6px",
  color: "#fca5a5",
  "font-size": "11px",
} as const;
