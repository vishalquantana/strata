import { treemap, treemapSquarify, type HierarchyNode } from "d3-hierarchy";
import type { DirNode } from "../types";

export interface Rect {
  id: number;
  x: number; y: number;
  w: number; h: number;
  depth: number;
}

/// Lays out the hierarchy as a treemap into the given pixel rect.
/// Returns one Rect per non-root node (we don't draw the root background).
export function computeTreemap(
  root: HierarchyNode<DirNode>,
  width: number,
  height: number,
  visibleThreshold = 0.005,
): Rect[] {
  const layout = treemap<DirNode>()
    .tile(treemapSquarify.ratio(1.4))
    .size([width, height])
    .padding(1)
    .round(true);
  layout(root);

  const totalArea = width * height;
  const rects: Rect[] = [];
  root.each((d) => {
    if (d.depth === 0) return;
    const r = d as unknown as { x0: number; y0: number; x1: number; y1: number };
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    if (w * h < totalArea * visibleThreshold) return;
    rects.push({ id: d.data.id, x: r.x0, y: r.y0, w, h, depth: d.depth });
  });
  return rects;
}
