import type { ProgressEvent } from "../types";

interface Props {
  event: ProgressEvent | null;
  active: boolean;
}

export default function ProgressBar(props: Props) {
  if (!props.active) return null;
  const label = props.event ? labelFor(props.event) : "Starting…";
  return (
    <div style={wrap}>
      <div style={bar}>
        <div style={fill} />
      </div>
      <span style={text}>{label}</span>
    </div>
  );
}

function labelFor(ev: ProgressEvent): string {
  switch (ev.event) {
    case "walk_started": return "Walking filesystem…";
    case "walk_completed": return `Walked ${ev.node_count.toLocaleString()} folders`;
    case "probe_started": return `Probe: ${ev.kind}…`;
    case "probe_completed": return `${ev.kind} done`;
    case "scan_finished": return "Done";
    case "error": return "Error";
    default: return "Working…";
  }
}

const wrap = { display: "flex", "align-items": "center", gap: "10px" } as const;
const bar = {
  width: "80px", height: "3px",
  background: "#1a1a22",
  "border-radius": "2px",
  overflow: "hidden",
  position: "relative",
} as const;
const fill = {
  position: "absolute", inset: "0",
  background: "#6c8cff",
  animation: "stratapulse 1.2s ease-in-out infinite",
  width: "40%",
} as const;
const text = {
  "font-size": "11px",
  color: "#6b7280",
  "font-family": "SF Mono, monospace",
} as const;
