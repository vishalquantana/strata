import { colorForNode, outlineColor } from "../colors";
import type { DirNode } from "../types";
import type { Rect } from "./layout-treemap";
import type { Arc } from "./layout-sunburst";

export interface Shape {
  kind: "rect" | "arc" | "morph";
  rect?: Rect;
  arc?: Arc;
  morphT?: number;
  rectFrom?: Rect;
  arcTo?: Arc;
  id: number;
}

export interface RenderInput {
  shapes: Shape[];
  nodesById: Map<number, DirNode>;
  hoveredId: number | null;
}

export function render(ctx: CanvasRenderingContext2D, input: RenderInput) {
  for (const s of input.shapes) {
    const node = input.nodesById.get(s.id)!;
    const fill = colorForNode(node);
    ctx.fillStyle = fill;
    if (s.kind === "rect" && s.rect) {
      drawRect(ctx, s.rect, fill, node, input.hoveredId === s.id);
    } else if (s.kind === "arc" && s.arc) {
      drawArc(ctx, s.arc, fill, input.hoveredId === s.id);
    } else if (s.kind === "morph" && s.rectFrom && s.arcTo && s.morphT !== undefined) {
      ctx.globalAlpha = 1 - s.morphT;
      drawRect(ctx, s.rectFrom, fill, node, false);
      ctx.globalAlpha = s.morphT;
      drawArc(ctx, s.arcTo, fill, false);
      ctx.globalAlpha = 1;
    }
  }
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  fill: string,
  node: DirNode,
  hovered: boolean,
) {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(r.x, r.y + r.h - Math.min(r.h * 0.25, 12), r.w, Math.min(r.h * 0.25, 12));

  if (r.w > 60 && r.h > 24) {
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(truncate(node.name, Math.floor(r.w / 7)), r.x + 6, r.y + 6);
    if (r.h > 40) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "500 10px 'SF Mono', SFMono-Regular, monospace";
      ctx.fillText(formatBytes(node.size_bytes), r.x + 6, r.y + 22);
    }
  }
  if (hovered) {
    ctx.strokeStyle = outlineColor(fill);
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  }
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  a: Arc,
  fill: string,
  hovered: boolean,
) {
  ctx.beginPath();
  ctx.arc(a.cx, a.cy, a.outerRadius, a.startAngle - Math.PI / 2, a.endAngle - Math.PI / 2);
  ctx.arc(a.cx, a.cy, a.innerRadius, a.endAngle - Math.PI / 2, a.startAngle - Math.PI / 2, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (hovered) {
    ctx.strokeStyle = outlineColor(fill);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}
function formatBytes(b: number): string {
  const u = ["B","KB","MB","GB","TB"];
  let i = 0; let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}
