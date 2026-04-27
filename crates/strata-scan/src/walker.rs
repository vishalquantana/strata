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
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use jwalk::WalkDir;
use std::collections::HashMap;
use std::os::unix::fs::MetadataExt;
use std::path::Path;

/// Walk the given root and return the populated scan tree.
pub fn walk(root: &Path) -> Result<ScanTree> {
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
    }

    if nodes.is_empty() {
        anyhow::bail!("scan root produced no entries");
    }

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
    }

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
