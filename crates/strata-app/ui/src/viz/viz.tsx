import { createEffect, createSignal, onMount, onCleanup } from "solid-js";
import type { DirNode, ScanTree } from "../types";
import { setupCanvas, clear } from "./canvas";
import { buildHierarchy } from "./hierarchy";
import { computeTreemap, type Rect } from "./layout-treemap";
import { renderTreemap } from "./render";
import { hitTest } from "./hit-test";

interface Props {
  tree: ScanTree;
}

export default function Viz(props: Props) {
  let canvasRef: HTMLCanvasElement | undefined;
  const [hoveredId, setHoveredId] = createSignal<number | null>(null);
  const [zoomRoot, setZoomRoot] = createSignal<number>(props.tree.root_id);

  let rects: Rect[] = [];
  let nodesById = new Map<number, DirNode>();
  let ctx: CanvasRenderingContext2D | null = null;
  let cssWidth = 0;
  let cssHeight = 0;

  function relayout() {
    if (!canvasRef || !ctx) return;
    const rect = canvasRef.getBoundingClientRect();
    cssWidth = rect.width;
    cssHeight = rect.height;
    nodesById = new Map(props.tree.nodes.map((n) => [n.id, n]));
    const h = buildHierarchy(props.tree, zoomRoot());
    rects = computeTreemap(h, cssWidth, cssHeight);
    draw();
  }

  function draw() {
    if (!ctx) return;
    clear(ctx, cssWidth, cssHeight);
    renderTreemap(ctx, { rects, nodesById, hoveredId: hoveredId() });
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
    onCleanup(() => ro.disconnect());
  });

  createEffect(() => {
    hoveredId();
    draw();
  });

  createEffect(() => {
    zoomRoot();
    relayout();
  });

  function onMove(e: MouseEvent) {
    if (!canvasRef) return;
    const r = canvasRef.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const id = hitTest(rects, x, y);
    setHoveredId(id);
  }

  function onClick() {
    const id = hoveredId();
    if (id === null) return;
    const node = nodesById.get(id);
    if (!node) return;
    if (node.children.length > 0) {
      setZoomRoot(id);
    }
  }

  function zoomOut() {
    const cur = zoomRoot();
    const node = nodesById.get(cur);
    if (node && node.parent_id !== null) {
      setZoomRoot(node.parent_id);
    }
  }

  return (
    <div style={{ position: "relative", flex: 1, "min-height": 0 }}>
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHoveredId(null)}
        onClick={onClick}
        style={{ width: "100%", height: "100%", display: "block", cursor: "pointer" }}
      />
      {zoomRoot() !== props.tree.root_id && (
        <button onClick={zoomOut} style={zoomBtn}>← Back</button>
      )}
    </div>
  );
}

const zoomBtn = {
  position: "absolute",
  top: "12px",
  left: "12px",
  background: "rgba(13,13,18,0.85)",
  border: "1px solid #1a1a22",
  color: "#e5e7eb",
  padding: "6px 12px",
  "border-radius": "100px",
  "backdrop-filter": "blur(8px)",
  cursor: "pointer",
  "font-size": "12px",
} as const;
