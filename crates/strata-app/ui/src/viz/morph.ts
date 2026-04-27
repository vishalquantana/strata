import type { Rect } from "./layout-treemap";
import type { Arc } from "./layout-sunburst";
import type { Shape } from "./render";

export function buildMorphShapes(rects: Rect[], arcs: Arc[], t: number): Shape[] {
  const rectById = new Map(rects.map((r) => [r.id, r]));
  const arcById = new Map(arcs.map((a) => [a.id, a]));
  const allIds = new Set<number>([...rectById.keys(), ...arcById.keys()]);
  const out: Shape[] = [];
  for (const id of allIds) {
    const r = rectById.get(id);
    const a = arcById.get(id);
    if (r && a) {
      out.push({ kind: "morph", id, rectFrom: r, arcTo: a, morphT: t });
    } else if (r) {
      out.push({ kind: "morph", id, rectFrom: r, arcTo: { id, cx: 0, cy: 0, innerRadius: 0, outerRadius: 0, startAngle: 0, endAngle: 0, depth: r.depth }, morphT: t });
    } else if (a) {
      out.push({ kind: "morph", id, rectFrom: { id, x: 0, y: 0, w: 0, h: 0, depth: a.depth }, arcTo: a, morphT: t });
    }
  }
  return out;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
