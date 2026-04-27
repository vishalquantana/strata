export type VizMode = "treemap" | "sunburst";

interface Props {
  mode: VizMode;
  onChange: (mode: VizMode) => void;
}

export default function Toggle(props: Props) {
  return (
    <div style={wrap}>
      <button
        style={{ ...pill, ...(props.mode === "sunburst" ? on : off) }}
        onClick={() => props.onChange("sunburst")}
      >&#9678; Sunburst</button>
      <button
        style={{ ...pill, ...(props.mode === "treemap" ? on : off) }}
        onClick={() => props.onChange("treemap")}
      >&#9638; Treemap</button>
    </div>
  );
}

const wrap = {
  position: "absolute",
  top: "12px", left: "50%", transform: "translateX(-50%)",
  display: "flex",
  background: "rgba(13,13,18,0.85)",
  "backdrop-filter": "blur(8px)",
  border: "1px solid #1a1a22",
  "border-radius": "100px",
  padding: "3px",
  gap: "0",
} as const;

const pill = {
  border: "none",
  padding: "5px 12px",
  "border-radius": "100px",
  "font-size": "11px",
  "font-weight": 600,
  cursor: "pointer",
  transition: "all 0.15s ease",
} as const;

const on = { background: "#6c8cff", color: "#fff" } as const;
const off = { background: "transparent", color: "#9ca3af" } as const;
