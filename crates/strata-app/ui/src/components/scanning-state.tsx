import type { ProgressEvent } from "../types";

interface Props {
  path: string | null;
  event: ProgressEvent | null;
  onCancel: () => void;
}

export default function ScanningState(props: Props) {
  return (
    <div style={wrap}>
      <div class="scan-stage">
        <div class="scan-ring scan-ring-1" />
        <div class="scan-ring scan-ring-2" />
        <div class="scan-ring scan-ring-3" />
        <div class="scan-core" />
      </div>
      <h2 style={title}>Scanning…</h2>
      <p style={pathStyle}>{props.path ?? ""}</p>
      <p style={status}>{statusFor(props.event)}</p>
      <button onClick={props.onCancel} style={cancelBtn}>Cancel</button>
    </div>
  );
}

function statusFor(ev: ProgressEvent | null): string {
  if (!ev) return "Starting…";
  switch (ev.event) {
    case "walk_started":
      return "Walking filesystem…";
    case "walk_progress":
      return `${ev.dirs_seen.toLocaleString()} folders · ${ev.files_seen.toLocaleString()} files · ${formatBytes(ev.bytes_seen)}`;
    case "walk_completed":
      return `Walked ${ev.node_count.toLocaleString()} folders`;
    case "probe_started":
      return `Probe: ${ev.kind}…`;
    case "probe_completed":
      return `${ev.kind} done`;
    case "scan_finished":
      return "Done";
    case "error":
      return `Error: ${ev.message}`;
    default:
      return "Working…";
  }
}

function formatBytes(b: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

const wrap = {
  flex: 1,
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  "justify-content": "center",
  gap: "12px",
  padding: "32px",
} as const;

const title = {
  margin: "16px 0 0",
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
  "text-align": "center",
} as const;

const status = {
  margin: 0,
  color: "#6b7280",
  "font-size": "12px",
  "font-family": "SF Mono, monospace",
} as const;

const cancelBtn = {
  "margin-top": "12px",
  background: "transparent",
  border: "1px solid #2a2a32",
  color: "#9ca3af",
  padding: "6px 16px",
  "border-radius": "6px",
  "font-size": "12px",
  cursor: "pointer",
} as const;
