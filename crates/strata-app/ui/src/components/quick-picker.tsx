import { createSignal, onMount, For, Show } from "solid-js";
import { clearLastSnapshot, homeDir, loadLastSnapshot, type PersistedSnapshot } from "../ipc";

interface Props {
  onPick: (path: string) => void;
  onCustom: () => void;
  onResume: (snap: PersistedSnapshot) => void;
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
  const [lastSnap, setLastSnap] = createSignal<PersistedSnapshot | null>(null);

  onMount(async () => {
    try { setHome(await homeDir()); } catch { setHome(""); }
    try { setLastSnap(await loadLastSnapshot()); } catch { /* ignore */ }
  });

  const dismissResume = async () => {
    setLastSnap(null);
    try { await clearLastSnapshot(); } catch { /* ignore */ }
  };

  return (
    <div style={wrap}>
      <h2 style={title}>Welcome to Strata</h2>
      <p style={subtitle}>Pick a folder to see what's eating your disk.</p>

      <Show when={lastSnap()}>
        {(snap) => (
          <div style={resumeCard}>
            <div style={resumeText}>
              <div style={resumeLabel}>
                {snap().is_complete ? "Last scan" : "Resume last view"}
              </div>
              <div style={resumePath}>{snap().source_path}</div>
              <div style={resumeMeta}>
                {snap().top_dirs.length} folders · {snap().biggest_files.length} big files ·{" "}
                {timeAgo(snap().captured_at)}
              </div>
            </div>
            <div style={resumeActions}>
              <button style={resumeBtn} onClick={() => props.onResume(snap())}>
                Open
              </button>
              <button style={resumeDismiss} onClick={dismissResume} title="Dismiss">
                ×
              </button>
            </div>
          </div>
        )}
      </Show>

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

// ─── resume card (only shown if a previous snapshot exists) ───
const resumeCard = {
  display: "flex",
  "align-items": "center",
  gap: "16px",
  padding: "14px 16px",
  background: "#101019",
  border: "1px solid #2a2a3a",
  "border-radius": "10px",
  width: "100%",
  "max-width": "720px",
  "margin-bottom": "20px",
} as const;

const resumeText = {
  flex: 1,
  display: "flex",
  "flex-direction": "column",
  gap: "2px",
  "min-width": "0",
} as const;

const resumeLabel = {
  "font-size": "10px",
  "text-transform": "uppercase",
  "letter-spacing": "1.2px",
  color: "#7c8aa3",
} as const;

const resumePath = {
  "font-size": "13px",
  "font-family": "SF Mono, monospace",
  color: "#e5e7eb",
  overflow: "hidden",
  "text-overflow": "ellipsis",
  "white-space": "nowrap",
} as const;

const resumeMeta = {
  "font-size": "11px",
  color: "#6b7280",
} as const;

const resumeActions = {
  display: "flex",
  "align-items": "center",
  gap: "6px",
} as const;

const resumeBtn = {
  background: "#1e3a8a",
  border: "1px solid #2a4ba8",
  color: "#dbeafe",
  padding: "6px 14px",
  "border-radius": "6px",
  "font-size": "12px",
  "font-weight": 600,
  cursor: "pointer",
} as const;

const resumeDismiss = {
  background: "transparent",
  border: "1px solid #2a2a32",
  color: "#9ca3af",
  width: "26px",
  height: "26px",
  "border-radius": "6px",
  cursor: "pointer",
  "font-size": "16px",
  "line-height": 1,
} as const;

function timeAgo(unixSecs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - unixSecs);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
