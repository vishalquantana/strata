import { createEffect, createSignal, onMount, onCleanup, Show } from "solid-js";
import type { DirNode, ScanTree } from "../types";
import { setupCanvas, clear } from "./canvas";
import { buildHierarchy } from "./hierarchy";
import { computeTreemap, type Rect } from "./layout-treemap";
import { computeSunburst, type Arc } from "./layout-sunburst";
import { render, type Shape } from "./render";
import { hitTestRects, hitTestArcs } from "./hit-test";
import { buildMorphShapes, easeInOutCubic } from "./morph";
import Toggle, { type VizMode } from "../components/toggle";
import HoverPeek from "../components/hover-peek";
import { makeMatcher } from "../stores/filters";
import { selectionStore } from "../stores/selection";
import { revealInFinder, moveToTrash } from "../ipc";

// Module-level context menu state (so app.tsx can dismiss it on ESC).
const [ctxMenu, setCtxMenu] = createSignal<{ x: number; y: number; nodeId: number } | null>(null);
export function dismissCtxMenu() { setCtxMenu(null); }
export function ctxMenuOpen(): boolean { return ctxMenu() !== null; }

interface Props {
  tree: ScanTree;
  initialRootId: number;
  onZoomChange: (id: number) => void;
}

const MORPH_DURATION_MS = 600;

export default function Viz(props: Props) {
  let canvasRef: HTMLCanvasElement | undefined;
  const [hoveredId, setHoveredId] = createSignal<number | null>(null);
  const [cursor, setCursor] = createSignal<{ x: number; y: number } | null>(null);
  const [zoomRoot, setZoomRoot] = createSignal<number>(props.initialRootId);
  const [mode, setMode] = createSignal<VizMode>("treemap");
  const matcher = makeMatcher();
  const sel = selectionStore();

  let rects: Rect[] = [];
  let arcs: Arc[] = [];
  let nodesById = new Map<number, DirNode>();
  let ctx: CanvasRenderingContext2D | null = null;
  let cssWidth = 0;
  let cssHeight = 0;

  let morphFrom: VizMode | null = null;
  let morphStart = 0;
  let rafId: number | null = null;

  function relayout() {
    if (!canvasRef || !ctx) return;
    const r = canvasRef.getBoundingClientRect();
    cssWidth = r.width;
    cssHeight = r.height;
    nodesById = new Map(props.tree.nodes.map((n) => [n.id, n]));
    const h = buildHierarchy(props.tree, zoomRoot());
    rects = computeTreemap(h, cssWidth, cssHeight);
    arcs = computeSunburst(h, cssWidth, cssHeight);
    drawCurrent();
  }

  function shapesForMode(m: VizMode): Shape[] {
    if (m === "treemap") {
      return rects.map((r) => ({ kind: "rect" as const, rect: r, id: r.id }));
    }
    return arcs.map((a) => ({ kind: "arc" as const, arc: a, id: a.id }));
  }

  function drawCurrent() {
    if (!ctx) return;
    clear(ctx, cssWidth, cssHeight);
    render(ctx, {
      shapes: shapesForMode(mode()),
      nodesById,
      hoveredId: hoveredId(),
      selectedId: sel.selectedId(),
      isMatched: matcher(),
    });
  }

  function startMorph(to: VizMode) {
    if (mode() === to) return;
    morphFrom = mode();
    morphStart = performance.now();
    if (rafId !== null) cancelAnimationFrame(rafId);
    const tick = (now: number) => {
      const elapsed = now - morphStart;
      const tRaw = Math.min(1, elapsed / MORPH_DURATION_MS);
      const t = easeInOutCubic(tRaw);
      const tDirected = morphFrom === "treemap" ? t : 1 - t;
      if (!ctx) return;
      clear(ctx, cssWidth, cssHeight);
      const shapes = buildMorphShapes(rects, arcs, tDirected);
      render(ctx, {
        shapes,
        nodesById,
        hoveredId: null,
        selectedId: sel.selectedId(),
        isMatched: matcher(),
      });
      if (tRaw < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setMode(to);
        morphFrom = null;
        rafId = null;
        drawCurrent();
      }
    };
    rafId = requestAnimationFrame(tick);
  }

  onMount(() => {
    if (!canvasRef) return;
    ctx = setupCanvas(canvasRef);
    relayout();
    const ro = new ResizeObserver(() => {
      if (!canvasRef || !ctx) return;
      ctx = setupCanvas(canvasRef);
      relayout();
    });
    ro.observe(canvasRef);
    onCleanup(() => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    });
  });

  createEffect(() => {
    if (ctxMenu() === null) return;
    const onWindowClick = (e: MouseEvent) => {
      // Dismiss only if click target is NOT inside the menu div.
      const target = e.target as HTMLElement | null;
      if (target && target.closest("[data-ctx-menu]")) return;
      setCtxMenu(null);
    };
    // Defer attach to next tick so the right-click that opened the menu
    // doesn't immediately close it.
    const id = window.setTimeout(() => {
      window.addEventListener("click", onWindowClick);
    }, 0);
    onCleanup(() => {
      window.clearTimeout(id);
      window.removeEventListener("click", onWindowClick);
    });
  });

  createEffect(() => {
    hoveredId();
    sel.selectedId();
    matcher();
    if (morphFrom === null) drawCurrent();
  });
  createEffect(() => {
    zoomRoot();
    relayout();
  });
  createEffect(() => {
    props.onZoomChange(zoomRoot());
  });
  createEffect(() => {
    if (props.initialRootId !== zoomRoot()) {
      setZoomRoot(props.initialRootId);
    }
  });

  function onMove(e: MouseEvent) {
    if (!canvasRef || morphFrom !== null) return;
    const r = canvasRef.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const id = mode() === "treemap" ? hitTestRects(rects, x, y) : hitTestArcs(arcs, x, y);
    setHoveredId(id);
    setCursor({ x: e.clientX, y: e.clientY });
  }

  function onClick() {
    if (ctxMenu() !== null) { setCtxMenu(null); return; }
    const id = hoveredId();
    if (id === null) {
      sel.select(null);
      return;
    }
    sel.select(id);
    const node = nodesById.get(id);
    if (!node || node.children.length === 0) return;
    setZoomRoot(id);
  }

  function zoomOut() {
    const cur = zoomRoot();
    const node = nodesById.get(cur);
    if (node && node.parent_id !== null) setZoomRoot(node.parent_id);
  }

  return (
    <div style={{ position: "relative", flex: 1, "min-height": 0 }}>
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => { setHoveredId(null); setCursor(null); }}
        onClick={onClick}
        oncontextmenu={(e) => {
          e.preventDefault();
          const id = hoveredId();
          if (id === null) { setCtxMenu(null); return; }
          setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: id });
        }}
        style={{ width: "100%", height: "100%", display: "block", cursor: "pointer" }}
      />
      <Toggle mode={mode()} onChange={startMorph} />
      {zoomRoot() !== props.tree.root_id && (
        <button onClick={zoomOut} style={zoomBtn}>← Back</button>
      )}
      {hoveredId() !== null && cursor() && (
        <HoverPeek
          node={nodesById.get(hoveredId()!) ?? null}
          x={cursor()!.x}
          y={cursor()!.y}
        />
      )}
      <Show when={ctxMenu()}>
        {(m) => {
          const node = nodesById.get(m().nodeId);
          if (!node) return null;
          return (
            <div
              data-ctx-menu
              style={{
                position: "fixed",
                left: `${m().x}px`,
                top: `${m().y}px`,
                background: "#0d0d12",
                border: "1px solid #1a1a22",
                padding: "4px 0",
                "border-radius": "6px",
                "box-shadow": "0 8px 24px rgba(0,0,0,0.5)",
                "z-index": 100,
                "min-width": "180px",
              }}
              onMouseLeave={() => setCtxMenu(null)}
            >
              <button class="ctx-item" onClick={() => { revealInFinder(node.path); setCtxMenu(null); }}>Reveal in Finder</button>
              <button class="ctx-item" onClick={async () => { await moveToTrash(node.path); setCtxMenu(null); }}>Move to Trash…</button>
              <button class="ctx-item" onClick={() => { navigator.clipboard.writeText(node.path); setCtxMenu(null); }}>Copy path</button>
            </div>
          );
        }}
      </Show>
    </div>
  );
}

const zoomBtn = {
  position: "absolute", top: "12px", left: "12px",
  background: "rgba(13,13,18,0.85)",
  border: "1px solid #1a1a22",
  color: "#e5e7eb",
  padding: "6px 12px",
  "border-radius": "100px",
  "backdrop-filter": "blur(8px)",
  cursor: "pointer",
  "font-size": "12px",
} as const;
