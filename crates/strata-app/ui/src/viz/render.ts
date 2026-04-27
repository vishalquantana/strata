import { colorForNode, outlineColor } from "../colors";
import type { DirNode } from "../types";
import type { Rect } from "./layout-treemap";

export interface RenderInput {
  rects: Rect[];
  nodesById: Map<number, DirNode>;
  hoveredId: number | null;
}

export function renderTreemap(
  ctx: CanvasRenderingContext2D,
  input: RenderInput,
) {
  for (const r of input.rects) {
    const node = input.nodesById.get(r.id)!;
    const fill = colorForNode(node);
    ctx.fillStyle = fill;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(r.x, r.y + r.h - Math.min(r.h * 0.25, 12), r.w, Math.min(r.h * 0.25, 12));

    if (r.w > 60 && r.h > 24) {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
      ctx.textBaseline = "top";
      const label = truncate(node.name, Math.floor(r.w / 7));
      ctx.fillText(label, r.x + 6, r.y + 6);
      if (r.h > 40) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "500 10px 'SF Mono', SFMono-Regular, monospace";
        ctx.fillText(formatBytes(node.size_bytes), r.x + 6, r.y + 22);
      }
    }

    if (input.hoveredId === r.id) {
      ctx.strokeStyle = outlineColor(fill);
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}

function formatBytes(b: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}
