import { createSignal, onMount, onCleanup } from "solid-js";
import { checkFullDiskAccess, openFdaSettings, type FdaStatus } from "../ipc";

interface Props {
  onGranted: () => void;
}

export default function Onboarding(props: Props) {
  const [status, setStatus] = createSignal<FdaStatus>("unknown");
  let timer: number | undefined;

  async function refresh() {
    const s = await checkFullDiskAccess();
    setStatus(s);
    if (s === "granted") props.onGranted();
  }

  onMount(() => {
    refresh();
    timer = window.setInterval(refresh, 1500);
  });
  onCleanup(() => {
    if (timer !== undefined) clearInterval(timer);
  });

  return (
    <div style={wrap}>
      <div style={card}>
        <h2 style={title}>Strata needs Full Disk Access</h2>
        <p style={para}>
          To find the folders you've forgotten, Strata needs to read your
          entire home directory — including system caches, app data, and
          hidden files where bloat usually hides.
        </p>
        <p style={paraSmall}>
          We never send anything off your machine. There's no telemetry,
          no analytics, no cloud sync. Everything stays local.
        </p>
        <div style={steps}>
          <ol style={ol}>
            <li>Click "Open System Settings" below.</li>
            <li>Find <strong>Strata</strong> in the list and toggle it on.</li>
            <li>Strata will detect the change automatically.</li>
          </ol>
        </div>
        <div style={actions}>
          <button onClick={openFdaSettings} style={btnPrimary}>Open System Settings…</button>
          <button onClick={refresh} style={btnSecondary}>I've granted it</button>
        </div>
        <div style={statusLine}>
          {status() === "granted" && <span style={{ color: "#10b981" }}>✓ Granted — loading…</span>}
          {status() === "denied" && <span style={{ color: "#ef4444" }}>Not yet granted</span>}
          {status() === "unknown" && <span style={{ color: "#6b7280" }}>Checking…</span>}
        </div>
      </div>
    </div>
  );
}

const wrap = {
  flex: 1,
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  background: "#08080b",
} as const;
const card = {
  "max-width": "460px",
  padding: "32px",
  background: "#0d0d12",
  border: "1px solid #1a1a22",
  "border-radius": "12px",
} as const;
const title = {
  margin: "0 0 12px",
  "font-size": "20px",
  "font-weight": 700,
  "letter-spacing": "-0.4px",
  color: "#fff",
} as const;
const para = {
  margin: "0 0 12px",
  color: "#9ca3af",
  "font-size": "13px",
  "line-height": 1.55,
} as const;
const paraSmall = {
  margin: "0 0 20px",
  color: "#6b7280",
  "font-size": "12px",
  "line-height": 1.55,
} as const;
const steps = {
  background: "#0a0a0e",
  border: "1px solid #1a1a22",
  "border-radius": "8px",
  padding: "12px 16px 12px 32px",
  "margin-bottom": "20px",
} as const;
const ol = {
  margin: 0, padding: 0,
  color: "#9ca3af",
  "font-size": "13px",
  "line-height": 1.7,
} as const;
const actions = {
  display: "flex",
  gap: "8px",
  "margin-bottom": "16px",
} as const;
const btnBase = {
  padding: "8px 14px",
  "border-radius": "6px",
  "font-size": "12px",
  "font-weight": 600,
  cursor: "pointer",
  border: "none",
} as const;
const btnPrimary = {
  ...btnBase,
  background: "#6c8cff",
  color: "#fff",
} as const;
const btnSecondary = {
  ...btnBase,
  background: "#13131a",
  color: "#e5e7eb",
  border: "1px solid #1a1a22",
} as const;
const statusLine = {
  "font-size": "11px",
  "font-family": "SF Mono, monospace",
} as const;
