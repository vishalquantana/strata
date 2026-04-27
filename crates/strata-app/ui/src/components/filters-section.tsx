import { filterStore, type FilterKey } from "../stores/filters";

const FILTERS: { key: FilterKey; name: string; color: string }[] = [
  { key: "stale", name: "Stale", color: "#f59e0b" },
  { key: "junk", name: "Junk", color: "#10b981" },
  { key: "dupes", name: "Duplicates", color: "#ec4899" },
  { key: "tm_safe", name: "Backed-up safe", color: "#3b82f6" },
];

export default function FiltersSection() {
  const store = filterStore();
  return (
    <div style={section}>
      <div style={label}>Filters</div>
      {FILTERS.map((f) => {
        const isOn = () => store.active().has(f.key);
        return (
          <div
            onClick={() => store.toggle(f.key)}
            style={{
              ...row,
              ...(isOn() ? rowOn : {}),
            }}
          >
            <span style={{ display: "flex", "align-items": "center", gap: "8px" }}>
              <span style={{ ...dot, background: f.color, opacity: isOn() ? "1" : "0.4" }} />
              {f.name}
            </span>
            <span style={{ color: "#4b5563", "font-size": "11px" }}>
              {isOn() ? "✓" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const section = { padding: "4px 12px 12px" } as const;
const label = {
  color: "#4b5563",
  "font-size": "10px",
  "text-transform": "uppercase",
  "letter-spacing": "1.5px",
  "margin": "12px 0 8px",
} as const;
const row = {
  display: "flex", "justify-content": "space-between", "align-items": "center",
  padding: "5px 8px",
  "border-radius": "5px",
  cursor: "pointer",
  "font-size": "12px",
  color: "#9ca3af",
  transition: "all 0.15s ease",
} as const;
const rowOn = {
  background: "#13131a",
  color: "#e5e7eb",
} as const;
const dot = {
  width: "8px", height: "8px", "border-radius": "50%",
  display: "inline-block",
} as const;
