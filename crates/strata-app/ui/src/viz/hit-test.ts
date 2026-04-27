import type { Rect } from "./layout-treemap";

/// Linear scan; fine for ~500 visible rects per frame.
export function hitTest(rects: Rect[], x: number, y: number): number | null {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return r.id;
    }
  }
  return null;
}
