import { rgb } from "d3-color";
import type { DirNode } from "./types";

/// Returns a hex color for a node based on its staleness + size.
/// Cool blue = hot, amber = warm, magenta = stale, deep red = very-stale-and-large.
/// Junk gets a desaturated grey-green tint regardless.
export function colorForNode(node: DirNode): string {
  if (node.signals.is_known_junk) {
    return "#3a4a3a";
  }
  const stale = staleness(node);
  switch (stale) {
    case "hot":       return "#3b82f6";  // blue-500
    case "warm":      return "#f59e0b";  // amber-500
    case "stale":     return "#ec4899";  // pink-500
    case "verystale":
      return node.size_bytes > 1_073_741_824 ? "#dc2626" : "#f87171";
  }
}

/// Returns a slightly brighter outline color (used for hover ring).
export function outlineColor(base: string): string {
  const c = rgb(base);
  return rgb(
    Math.min(255, c.r + 40),
    Math.min(255, c.g + 40),
    Math.min(255, c.b + 40),
  ).formatHex();
}

function staleness(node: DirNode): "hot" | "warm" | "stale" | "verystale" {
  const lu = node.signals.last_used_at ? new Date(node.signals.last_used_at).getTime() : 0;
  const lm = new Date(node.signals.last_modified_at).getTime();
  const fresh = Math.max(lu, lm);
  const ageDays = (Date.now() - fresh) / 86_400_000;
  if (ageDays <= 30) return "hot";
  if (ageDays <= 180) return "warm";
  if (ageDays <= 730) return "stale";
  return "verystale";
}
