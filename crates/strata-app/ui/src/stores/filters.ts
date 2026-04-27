import { createSignal, createMemo } from "solid-js";
import type { DirNode } from "../types";

export type FilterKey = "stale" | "junk" | "dupes" | "tm_safe";

const [active, setActive] = createSignal<Set<FilterKey>>(new Set());

export function filterStore() {
  return {
    active,
    toggle(key: FilterKey) {
      const cur = new Set<FilterKey>(active());
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      setActive(cur);
    },
    clear() { setActive(new Set<FilterKey>()); },
  };
}

/// Returns a function that, given a DirNode, decides whether it matches the
/// current active filter set. With NO filters active, every node matches.
export function makeMatcher() {
  return createMemo(() => {
    const set = active();
    if (set.size === 0) return (_n: DirNode) => true;
    return (n: DirNode) => {
      if (set.has("stale") && !isStale(n)) return false;
      if (set.has("junk") && !n.signals.is_known_junk) return false;
      if (set.has("dupes") && n.signals.duplicate_group_id === null) return false;
      if (set.has("tm_safe") && !(isStale(n) && n.signals.is_backed_up_tm)) return false;
      return true;
    };
  });
}

function isStale(n: DirNode): boolean {
  const lu = n.signals.last_used_at ? new Date(n.signals.last_used_at).getTime() : 0;
  const lm = new Date(n.signals.last_modified_at).getTime();
  const ageDays = (Date.now() - Math.max(lu, lm)) / 86_400_000;
  return ageDays > 180;
}
