import type { JSX } from "solid-js";

interface Props {
  label: string;
  value: JSX.Element | string;
  emphasis?: boolean;
}

export default function StatRow(props: Props) {
  return (
    <div style={row}>
      <span style={lbl}>{props.label}</span>
      <span style={{ ...val, ...(props.emphasis ? { color: "#fff", "font-weight": 600 } : {}) }}>
        {props.value}
      </span>
    </div>
  );
}

const row = {
  display: "flex",
  "justify-content": "space-between",
  "align-items": "center",
  padding: "8px 0",
  "border-bottom": "1px solid #1a1a22",
  "font-size": "12px",
} as const;
const lbl = { color: "#6b7280" } as const;
const val = {
  color: "#d1d5db",
  "font-family": "SF Mono, monospace",
  "font-size": "11px",
} as const;
