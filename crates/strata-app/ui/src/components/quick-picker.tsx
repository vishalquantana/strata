import { createSignal, onMount, For } from "solid-js";
import { homeDir } from "../ipc";

interface Props {
  onPick: (path: string) => void;
  onCustom: () => void;
}

interface Preset {
  label: string;
  subtitle: string;
  emoji: string;
  build: (home: string) => string;
}

const PRESETS: Preset[] = [
  { label: "Macintosh HD", subtitle: "/",                emoji: "💽", build: () => "/" },
  { label: "Home",         subtitle: "~",                emoji: "🏠", build: (h) => h },
  { label: "Documents",    subtitle: "~/Documents",      emoji: "📄", build: (h) => `${h}/Documents` },
  { label: "Downloads",    subtitle: "~/Downloads",      emoji: "📥", build: (h) => `${h}/Downloads` },
  { label: "Desktop",      subtitle: "~/Desktop",        emoji: "🖥️", build: (h) => `${h}/Desktop` },
  { label: "Library",      subtitle: "~/Library",        emoji: "📚", build: (h) => `${h}/Library` },
];

export default function QuickPicker(props: Props) {
  const [home, setHome] = createSignal<string | null>(null);

  onMount(async () => {
    try { setHome(await homeDir()); } catch { setHome(""); }
  });

  return (
    <div style={wrap}>
      <h2 style={title}>Welcome to Strata</h2>
      <p style={subtitle}>Pick a folder to see what's eating your disk.</p>
      <div style={grid}>
        <For each={PRESETS}>
          {(p) => (
            <button
              class="qp-card"
              style={card}
              onClick={() => {
                const h = home();
                if (h === null) return;
                props.onPick(p.build(h));
              }}
              disabled={home() === null}
              title={p.subtitle}
            >
              <div style={icon}>{p.emoji}</div>
              <div style={cardLabel}>{p.label}</div>
              <div style={cardSub}>{p.subtitle}</div>
            </button>
          )}
        </For>
        <button class="qp-card" style={cardCustom} onClick={props.onCustom}>
          <div style={icon}>📂</div>
          <div style={cardLabel}>Custom…</div>
          <div style={cardSub}>Choose any folder</div>
        </button>
      </div>
    </div>
  );
}

const wrap = {
  flex: 1,
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  "justify-content": "center",
  padding: "32px",
} as const;

const title = {
  margin: "0 0 8px",
  "font-weight": 600,
  "letter-spacing": "-0.5px",
} as const;

const subtitle = {
  margin: "0 0 32px",
  color: "#6b7280",
  "font-size": "14px",
} as const;

const grid = {
  display: "grid",
  "grid-template-columns": "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "16px",
  width: "100%",
  "max-width": "720px",
} as const;

const card = {
  background: "#13131a",
  border: "1px solid #1a1a22",
  "border-radius": "10px",
  padding: "20px 16px",
  cursor: "pointer",
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  gap: "6px",
  color: "#e5e7eb",
  transition: "border-color 120ms, background 120ms, transform 120ms",
} as const;

const cardCustom = {
  ...card,
  "border-style": "dashed",
  background: "transparent",
} as const;

const icon = {
  "font-size": "36px",
  "line-height": 1,
  "margin-bottom": "4px",
} as const;

const cardLabel = {
  "font-size": "13px",
  "font-weight": 600,
} as const;

const cardSub = {
  "font-size": "11px",
  color: "#6b7280",
} as const;
