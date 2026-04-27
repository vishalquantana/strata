//! Phase-1 parallel directory walk.
//!
//! Walks a directory tree using `jwalk` (work-stealing parallel walker),
//! producing a flat `Vec<DirNode>` with parent/child links and aggregate sizes.
//!
//! This phase ONLY collects filesystem-cheap signals: size, file count,
//! mtime, ctime, and the junk-pattern flag. Spotlight, Time Machine, iCloud,
//! and hashing are all separate later passes.

use crate::junk::is_known_junk;
use crate::model::{DirNode, NodeId, ScanTree, Signals};
use crate::progress::{BigFile, ProgressEvent, TopDir};
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use jwalk::WalkDir;
use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::time::{Duration, Instant};

/// Minimum wall-clock interval between `WalkProgress` emissions.
const THROTTLE_INTERVAL: Duration = Duration::from_millis(250);
/// Minimum number of nodes processed between `WalkProgress` emissions.
/// On tiny/fast scans the final flush is sufficient; this gate suppresses
/// spurious mid-walk events.
const THROTTLE_MIN_NODES: u64 = 1000;
/// How often to emit a mid-walk `WalkSnapshot` event during Pass 2 after the
/// first one has been sent.
const SNAPSHOT_INTERVAL: Duration = Duration::from_secs(30);
/// Delay before the very first snapshot, so the UI shows a treemap quickly
/// rather than waiting a full SNAPSHOT_INTERVAL.
const SNAPSHOT_FIRST_DELAY: Duration = Duration::from_secs(5);
/// How many biggest files to track and report in each snapshot.
const SNAPSHOT_TOP_FILES: usize = 30;
/// How many top-level directories to report in each snapshot.
const SNAPSHOT_TOP_DIRS: usize = 12;
/// Files smaller than this are not considered for the "biggest files" list
/// (saves heap churn during fast scans of tiny-file directories).
const SNAPSHOT_FILE_MIN_BYTES: u64 = 1024 * 1024;

/// Walk the given root and return the populated scan tree.
///
/// `progress_cb` is called with `WalkProgress` events throttled to roughly
/// once per 250 ms (and at least 1 000 nodes between emissions).  A final
/// flush is emitted immediately before the function returns so the UI always
/// shows consistent totals.
pub fn walk(root: &Path, progress_cb: &mut impl FnMut(&ProgressEvent)) -> Result<ScanTree> {
    let scanned_at = Utc::now();
    let canonical = root
        .canonicalize()
        .with_context(|| format!("failed to canonicalize {}", root.display()))?;

    // Get the device ID of the root so we can skip cross-device mount points.
    // On macOS with APFS, scanning `/` would otherwise descend into every
    // sub-volume under `/System/Volumes/` and loop forever via
    // `/Volumes/Macintosh HD -> /`.
    let root_dev: u64 = std::fs::metadata(&canonical)
        .with_context(|| format!("failed to stat {}", canonical.display()))?
        .dev();

    // Throttle state — shared across both passes.
    let mut dirs_seen: u64 = 0;
    let mut files_seen: u64 = 0;
    let mut bytes_seen: u64 = 0;
    let mut nodes_since_last_emit: u64 = 0;
    let mut last_emit = Instant::now();

    // Emit an initial zeroed WalkProgress so the UI shows counters immediately.
    progress_cb(&ProgressEvent::WalkProgress {
        dirs_seen: 0,
        files_seen: 0,
        bytes_seen: 0,
    });

    // Emits a WalkProgress event when both throttle gates open (≥ THROTTLE_MIN_NODES
    // nodes processed AND ≥ THROTTLE_INTERVAL elapsed since last emit). Resets
    // `nodes_since_last_emit` and `last_emit` internally on emit.
    macro_rules! maybe_emit {
        ($cb:expr) => {{
            if nodes_since_last_emit >= THROTTLE_MIN_NODES
                && last_emit.elapsed() >= THROTTLE_INTERVAL
            {
                $cb(&ProgressEvent::WalkProgress {
                    dirs_seen,
                    files_seen,
                    bytes_seen,
                });
                last_emit = Instant::now();
                nodes_since_last_emit = 0;
            }
        }};
    }

    // First pass: enumerate every directory, build flat node list, capture
    // each dir's own metadata. Use parallel walk for speed; sort within dirs
    // for deterministic snapshot tests.
    let mut nodes: Vec<DirNode> = Vec::new();
    // Map full path -> NodeId so we can wire up parent/child relationships.
    let mut path_to_id: HashMap<String, NodeId> = HashMap::new();

    // Single-threaded enumeration of directories (jwalk gives parallelism for
    // descent but we want deterministic order while assigning ids).
    for entry in WalkDir::new(&canonical)
        .sort(true)
        .skip_hidden(false)
        .process_read_dir(move |_depth, _path, _state, children| {
            // Prevent descent into directories that live on a different
            // filesystem device (e.g. APFS sub-volumes under /System/Volumes,
            // or network mounts). Setting read_children_path = None stops
            // jwalk from enumerating those subtrees entirely.
            // TODO: no automated test for cross-device boundary; requires a real mount (APFS/tmpfs)
            children.iter_mut().for_each(|child_result| {
                if let Ok(child) = child_result {
                    if child.file_type().is_dir() {
                        let on_same_device = child
                            .metadata()
                            .map(|m| m.dev() == root_dev)
                            .unwrap_or(true); // on error, assume same and let natural errors surface
                        if !on_same_device {
                            eprintln!(
                                "[strata-scan] skipping cross-device mount: {}",
                                child.path().display()
                            );
                            child.read_children_path = None;
                        }
                    }
                }
            });
        })
        .into_iter()
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // permission denied etc — skip silently
        };
        if !entry.file_type().is_dir() {
            continue;
        }
        // Skip entries that are on a different device (the process_read_dir
        // callback above prevents descent; this check skips the entry itself).
        if let Some(dev) = entry.metadata().ok().map(|m| m.dev()) {
            if dev != root_dev {
                continue;
            }
        }

        let path = entry.path();
        let path_str = path.to_string_lossy().to_string();
        let id = nodes.len() as NodeId;
        let parent_path = path.parent().map(|p| p.to_string_lossy().to_string());
        let parent_id = parent_path.and_then(|p| path_to_id.get(&p).copied());

        let depth = if let Some(pid) = parent_id {
            // Look up parent's depth + 1
            let parent = &nodes[pid as usize];
            parent.depth + 1
        } else {
            0
        };

        let metadata = entry.metadata().ok();
        let (created_at, modified_at) = metadata
            .as_ref()
            .map(|m| {
                (
                    m.created()
                        .ok()
                        .map(DateTime::<Utc>::from)
                        .unwrap_or_else(epoch),
                    m.modified()
                        .ok()
                        .map(DateTime::<Utc>::from)
                        .unwrap_or_else(epoch),
                )
            })
            .unwrap_or_else(|| (epoch(), epoch()));

        let signals = Signals {
            last_used_at: None,
            last_modified_at: modified_at,
            created_at,
            is_backed_up_tm: false,
            is_in_icloud: false,
            is_known_junk: is_known_junk(&path),
            duplicate_group_id: None,
        };

        let node = DirNode {
            id,
            parent_id,
            path: path_str.clone(),
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone()),
            depth,
            size_bytes: 0,
            file_count: 0,
            signals,
            children: Vec::new(),
        };

        path_to_id.insert(path_str, id);
        nodes.push(node);

        // Wire up to parent
        if let Some(pid) = parent_id {
            nodes[pid as usize].children.push(id);
        }

        // Update running counters for Pass 1 (directory accepted).
        dirs_seen += 1;
        nodes_since_last_emit += 1;
        maybe_emit!(progress_cb);
    }

    if nodes.is_empty() {
        anyhow::bail!("scan root produced no entries");
    }

    // Snapshot state: track running totals for depth-1 dirs (children of the
    // scan root) so we can emit a "what's biggest so far" view mid-walk.
    let root_id_opt: Option<NodeId> = path_to_id
        .get(&canonical.to_string_lossy().to_string())
        .copied();
    // Map every node to its depth-1 ancestor (or itself if depth == 1). Built
    // by walking up parent_id once per node — O(N · max_depth).
    let mut depth1_ancestor: HashMap<NodeId, NodeId> = HashMap::new();
    for n in &nodes {
        if n.depth == 1 {
            depth1_ancestor.insert(n.id, n.id);
        } else if n.depth > 1 {
            let mut cur = n.id;
            loop {
                let parent = nodes[cur as usize].parent_id;
                match parent {
                    Some(p) => {
                        if nodes[p as usize].depth == 1 {
                            depth1_ancestor.insert(n.id, p);
                            break;
                        }
                        cur = p;
                    }
                    None => break,
                }
            }
        }
    }
    // Running size totals keyed by depth-1 NodeId.
    let mut top_dir_sizes: HashMap<NodeId, u64> = HashMap::new();
    // Min-heap of (size, path, name) capped at SNAPSHOT_TOP_FILES so we always
    // have the largest files seen so far. Reverse<u64> makes it a min-heap.
    let mut biggest_files_heap: BinaryHeap<Reverse<(u64, String, String)>> = BinaryHeap::new();
    let mut last_snapshot_emit = Instant::now();
    let mut first_snapshot_sent = false;

    // Second pass: tally file sizes & counts INTO the immediate parent dir.
    // We accumulate from leaves up by sorting by depth descending, but for
    // file-level data we need a separate walk that reports files.
    for entry in WalkDir::new(&canonical)
        .sort(true)
        .skip_hidden(false)
        .process_read_dir(move |_depth, _path, _state, children| {
            children.iter_mut().for_each(|child_result| {
                if let Ok(child) = child_result {
                    if child.file_type().is_dir() {
                        let on_same_device = child
                            .metadata()
                            .map(|m| m.dev() == root_dev)
                            .unwrap_or(true); // on error, assume same and let natural errors surface
                        if !on_same_device {
                            eprintln!(
                                "[strata-scan] skipping cross-device mount: {}",
                                child.path().display()
                            );
                            child.read_children_path = None;
                        }
                    }
                }
            });
        })
        .into_iter()
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let parent = match entry.path().parent() {
            Some(p) => p.to_string_lossy().to_string(),
            None => continue,
        };
        let parent_id = match path_to_id.get(&parent) {
            Some(id) => *id,
            None => continue,
        };
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

        let node = &mut nodes[parent_id as usize];
        node.size_bytes += size;
        node.file_count += 1;

        // Roll mtime up: take max of own mtime and the file's mtime.
        if let Ok(meta) = entry.metadata() {
            if let Ok(mt) = meta.modified() {
                let mt_dt: DateTime<Utc> = mt.into();
                if mt_dt > node.signals.last_modified_at {
                    node.signals.last_modified_at = mt_dt;
                }
            }
        }

        // Update running counters for Pass 2 (file accepted).
        files_seen += 1;
        bytes_seen += size;
        nodes_since_last_emit += 1;
        maybe_emit!(progress_cb);

        // --- Snapshot tracking ---
        // Track top-level (depth-1) dir running size by attributing this
        // file's bytes to its depth-1 ancestor.
        if let Some(d1) = depth1_ancestor.get(&parent_id) {
            *top_dir_sizes.entry(*d1).or_insert(0) += size;
        } else if let Some(rid) = root_id_opt {
            // File directly under scan root: account it against the root.
            if parent_id == rid {
                *top_dir_sizes.entry(rid).or_insert(0) += size;
            }
        }

        // Track biggest files (only ≥ SNAPSHOT_FILE_MIN_BYTES to skip churn).
        if size >= SNAPSHOT_FILE_MIN_BYTES {
            let path_str = entry.path().to_string_lossy().to_string();
            let name = entry
                .path()
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone());
            if biggest_files_heap.len() < SNAPSHOT_TOP_FILES {
                biggest_files_heap.push(Reverse((size, path_str, name)));
            } else if let Some(Reverse((min_size, _, _))) = biggest_files_heap.peek() {
                if size > *min_size {
                    biggest_files_heap.pop();
                    biggest_files_heap.push(Reverse((size, path_str, name)));
                }
            }
        }

        // Periodic snapshot emit. First one fires after SNAPSHOT_FIRST_DELAY
        // so the user sees a treemap quickly; subsequent ones use the
        // (longer) SNAPSHOT_INTERVAL.
        let due_at = if first_snapshot_sent {
            SNAPSHOT_INTERVAL
        } else {
            SNAPSHOT_FIRST_DELAY
        };
        if last_snapshot_emit.elapsed() >= due_at {
            emit_snapshot(progress_cb, &nodes, &top_dir_sizes, &biggest_files_heap);
            last_snapshot_emit = Instant::now();
            first_snapshot_sent = true;
        }
    }

    // Final flush: emit current totals right before returning so the UI always
    // sees consistent numbers regardless of throttle timing.
    progress_cb(&ProgressEvent::WalkProgress {
        dirs_seen,
        files_seen,
        bytes_seen,
    });

    // Final snapshot too, so the UI shows the most up-to-date "biggest finds"
    // right before the visualization replaces the scanning view.
    emit_snapshot(progress_cb, &nodes, &top_dir_sizes, &biggest_files_heap);

    // Third pass: roll subtree totals up. Process leaves before parents.
    let mut order: Vec<NodeId> = (0..nodes.len() as NodeId).collect();
    order.sort_by_key(|id| std::cmp::Reverse(nodes[*id as usize].depth));
    for id in order {
        let id = id as usize;
        let (size, files, latest_mtime) = {
            let n = &nodes[id];
            let mut s = n.size_bytes;
            let mut f = n.file_count;
            let mut m = n.signals.last_modified_at;
            for &c in &n.children {
                let child = &nodes[c as usize];
                s += child.size_bytes;
                f += child.file_count;
                if child.signals.last_modified_at > m {
                    m = child.signals.last_modified_at;
                }
            }
            (s, f, m)
        };
        let n = &mut nodes[id];
        n.size_bytes = size;
        n.file_count = files;
        n.signals.last_modified_at = latest_mtime;
    }

    let root_id = path_to_id
        .get(&canonical.to_string_lossy().to_string())
        .copied()
        .context("root path missing from node map")?;

    Ok(ScanTree {
        root_id,
        nodes,
        scanned_at,
        source_path: canonical.to_string_lossy().to_string(),
    })
}

fn epoch() -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(0, 0).unwrap()
}

/// Build and emit a `WalkSnapshot` from the current Pass-2 running state.
fn emit_snapshot(
    progress_cb: &mut impl FnMut(&ProgressEvent),
    nodes: &[DirNode],
    top_dir_sizes: &HashMap<NodeId, u64>,
    biggest_files_heap: &BinaryHeap<Reverse<(u64, String, String)>>,
) {
    // Top-level dirs sorted by running size desc.
    let mut top_dirs: Vec<TopDir> = top_dir_sizes
        .iter()
        .filter_map(|(id, sz)| {
            let n = nodes.get(*id as usize)?;
            Some(TopDir {
                path: n.path.clone(),
                name: n.name.clone(),
                size_bytes: *sz,
            })
        })
        .collect();
    top_dirs.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    top_dirs.truncate(SNAPSHOT_TOP_DIRS);

    // Biggest files sorted by size desc. Heap is min-heap of size, so just
    // collect and sort.
    let mut biggest_files: Vec<BigFile> = biggest_files_heap
        .iter()
        .map(|Reverse((sz, path, name))| BigFile {
            path: path.clone(),
            name: name.clone(),
            size_bytes: *sz,
        })
        .collect();
    biggest_files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

    progress_cb(&ProgressEvent::WalkSnapshot {
        top_dirs,
        biggest_files,
    });
}
