import { partition, type HierarchyNode } from "d3-hierarchy";
import type { DirNode } from "../types";

export interface Arc {
  id: number;
  cx: number; cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  depth: number;
}

export function computeSunburst(
  root: HierarchyNode<DirNode>,
  width: number,
  height: number,
  visibleThreshold = 0.005,
): Arc[] {
  const radius = Math.min(width, height) / 2 - 8;
  const cx = width / 2;
  const cy = height / 2;

  const part = partition<DirNode>().size([2 * Math.PI, radius]);
  part(root);

  const arcs: Arc[] = [];
  const totalAngle = 2 * Math.PI;
  root.each((d) => {
    if (d.depth === 0) return;
    const p = d as unknown as { x0: number; x1: number; y0: number; y1: number };
    const angularSize = p.x1 - p.x0;
    if (angularSize / totalAngle < visibleThreshold) return;
    arcs.push({
      id: d.data.id,
      cx, cy,
      innerRadius: p.y0,
      outerRadius: p.y1,
      startAngle: p.x0,
      endAngle: p.x1,
      depth: d.depth,
    });
  });
  return arcs;
}
