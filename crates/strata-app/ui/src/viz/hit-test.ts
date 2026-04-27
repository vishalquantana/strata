import type { Rect } from "./layout-treemap";
import type { Arc } from "./layout-sunburst";

export function hitTestRects(rects: Rect[], x: number, y: number): number | null {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return r.id;
    }
  }
  return null;
}

export function hitTestArcs(arcs: Arc[], x: number, y: number): number | null {
  for (let i = arcs.length - 1; i >= 0; i--) {
    const a = arcs[i];
    const dx = x - a.cx;
    const dy = y - a.cy;
    const r = Math.hypot(dx, dy);
    if (r < a.innerRadius || r > a.outerRadius) continue;
    let ang = Math.atan2(dx, -dy);
    if (ang < 0) ang += 2 * Math.PI;
    if (ang >= a.startAngle && ang < a.endAngle) {
      return a.id;
    }
  }
  return null;
}
