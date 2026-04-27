export type NodeId = number;

export type Stale = "hot" | "warm" | "stale" | "verystale";

export interface Signals {
  last_used_at: string | null;
  last_modified_at: string;
  created_at: string;
  is_backed_up_tm: boolean;
  is_in_icloud: boolean;
  is_known_junk: boolean;
  duplicate_group_id: number | null;
}

export interface DirNode {
  id: NodeId;
  parent_id: NodeId | null;
  path: string;
  name: string;
  depth: number;
  size_bytes: number;
  file_count: number;
  signals: Signals;
  children: NodeId[];
}

export interface ScanTree {
  root_id: NodeId;
  nodes: DirNode[];
  scanned_at: string;
  source_path: string;
}

export type ProgressEvent =
  | { event: "walk_started"; root: string }
  | { event: "walk_progress"; dirs_seen: number; files_seen: number; bytes_seen: number }
  | { event: "walk_completed"; node_count: number }
  | { event: "probe_started"; kind: string }
  | { event: "probe_completed"; kind: string; applied: number }
  | { event: "scan_finished" }
  | { event: "error"; message: string };
