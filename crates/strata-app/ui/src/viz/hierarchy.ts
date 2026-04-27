import { hierarchy, type HierarchyNode } from "d3-hierarchy";
import type { DirNode, ScanTree } from "../types";

/// Builds a d3 hierarchy from the flat ScanTree, rooted at `rootId`.
export function buildHierarchy(tree: ScanTree, rootId = tree.root_id): HierarchyNode<DirNode> {
  const byId = new Map<number, DirNode>();
  for (const n of tree.nodes) byId.set(n.id, n);

  type Wrap = { node: DirNode; children?: Wrap[] };
  function wrap(id: number): Wrap {
    const n = byId.get(id)!;
    const w: Wrap = { node: n };
    if (n.children.length > 0) {
      w.children = n.children.map(wrap);
    }
    return w;
  }
  const root = wrap(rootId);

  const h = hierarchy<DirNode>(
    root.node,
    (d) => byId.get(d.id)!.children.map((cid) => byId.get(cid)!),
  );
  h.sum((d) => (d.children.length === 0 ? d.size_bytes : 0));
  h.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return h;
}
