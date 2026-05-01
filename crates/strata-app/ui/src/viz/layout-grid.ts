import type { HierarchyNode } from "d3-hierarchy";
import type { DirNode } from "../types";
import type { Rect } from "./layout-treemap";

/// Lays out the immediate children of the root as equal-sized grid cells.
/// Every child gets the same area regardless of size — useful for seeing
/// all folders at a glance without large ones dwarfing small ones.
export function computeGrid(
  root: HierarchyNode<DirNode>,
  width: number,
  height: number,
): Rect[] {
  const kids = root.children ?? [];
  if (kids.length === 0) return [];

  const cols = Math.ceil(Math.sqrt(kids.length * (width / height)));
  const rows = Math.ceil(kids.length / cols);
  const cellW = width / cols;
  const cellH = height / rows;
  const pad = 2;

  return kids.map((child, i) => ({
    id: child.data.id,
    x: (i % cols) * cellW + pad,
    y: Math.floor(i / cols) * cellH + pad,
    w: cellW - pad * 2,
    h: cellH - pad * 2,
    depth: 1,
  }));
}
