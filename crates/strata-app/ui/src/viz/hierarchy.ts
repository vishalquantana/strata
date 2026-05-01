import { hierarchy, type HierarchyNode } from "d3-hierarchy";
import type { DirNode, ScanTree } from "../types";

export interface HierarchyOpts {
  hideCloud?: boolean;
}

/// Builds a d3 hierarchy from the flat ScanTree, rooted at `rootId`.
export function buildHierarchy(
  tree: ScanTree,
  rootId = tree.root_id,
  opts: HierarchyOpts = {},
): HierarchyNode<DirNode> {
  const byId = new Map<number, DirNode>();
  for (const n of tree.nodes) byId.set(n.id, n);

  const h = hierarchy<DirNode>(
    byId.get(rootId)!,
    (d) => {
      const kids = byId.get(d.id)!.children.map((cid) => byId.get(cid)!);
      if (opts.hideCloud) return kids.filter((c) => !c.signals.cloud_provider);
      return kids;
    },
  );
  h.sum((d) => (d.children.length === 0 ? d.size_bytes : 0));
  h.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return h;
}
