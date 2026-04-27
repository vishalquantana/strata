//! Strata scanner — disk-tree walker with signal collection.

pub mod aggregate;
pub mod hasher;
pub mod icloud;
pub mod junk;
pub mod model;
pub mod output;
pub mod progress;
pub mod spotlight;
pub mod timemachine;
pub mod walker;

use crate::aggregate::{apply_probes, ProbeResults};
use crate::hasher::find_duplicates;
use crate::icloud::{has_cloud_docs_xattr, icloud_drive_enabled, is_in_icloud_path};
use crate::model::ScanTree;
use crate::progress::ProgressEvent;
use crate::spotlight::SpotlightProbe;
use crate::timemachine::TmChecker;
use anyhow::Result;
use jwalk::WalkDir;
use std::collections::HashMap;
use std::os::unix::fs::MetadataExt;
use std::path::Path;

/// Knobs that disable expensive probes (used by tests and `--no-*` CLI flags).
#[derive(Debug, Clone, Copy, Default)]
pub struct ScanOptions {
    pub disable_spotlight: bool,
    pub disable_tm: bool,
    pub disable_icloud: bool,
    pub disable_hash: bool,
    /// Minimum file size to consider for dupe hashing.
    pub hash_min_bytes: u64,
}

impl ScanOptions {
    pub fn defaults() -> Self {
        Self {
            disable_spotlight: false,
            disable_tm: false,
            disable_icloud: false,
            disable_hash: false,
            hash_min_bytes: 50 * 1024 * 1024,
        }
    }
}

/// Run a full scan. `progress_cb` is invoked for each progress event.
pub fn run(
    root: &Path,
    options: ScanOptions,
    mut progress_cb: impl FnMut(&ProgressEvent),
) -> Result<ScanTree> {
    progress_cb(&ProgressEvent::WalkStarted {
        root: root.to_string_lossy().to_string(),
    });
    let mut tree = walker::walk(root)?;
    progress_cb(&ProgressEvent::WalkCompleted {
        node_count: tree.nodes.len(),
    });

    let home = std::env::var("HOME").unwrap_or_default();

    // --- TM probe ---
    let mut tm_status: HashMap<String, bool> = HashMap::new();
    if !options.disable_tm {
        progress_cb(&ProgressEvent::ProbeStarted { kind: "tm".into() });
        let checker = TmChecker::real();
        // Cheap-but-coarse: query each top-level dir under root and inherit.
        for n in &tree.nodes {
            if n.depth <= 1 {
                tm_status.insert(n.path.clone(), checker.is_backed_up(&n.path));
            }
        }
        progress_cb(&ProgressEvent::ProbeCompleted {
            kind: "tm".into(),
            applied: tm_status.len(),
        });
    }

    // --- iCloud probe ---
    let mut icloud_status: HashMap<String, bool> = HashMap::new();
    if !options.disable_icloud && icloud_drive_enabled(&home) {
        progress_cb(&ProgressEvent::ProbeStarted {
            kind: "icloud".into(),
        });
        for n in &tree.nodes {
            let by_path = is_in_icloud_path(&home, &n.path);
            let by_xattr = has_cloud_docs_xattr(Path::new(&n.path));
            if by_path || by_xattr {
                icloud_status.insert(n.path.clone(), true);
            }
        }
        progress_cb(&ProgressEvent::ProbeCompleted {
            kind: "icloud".into(),
            applied: icloud_status.len(),
        });
    }

    // --- Spotlight probe ---
    let mut last_used: HashMap<String, chrono::DateTime<chrono::Utc>> = HashMap::new();
    if !options.disable_spotlight {
        progress_cb(&ProgressEvent::ProbeStarted {
            kind: "spotlight".into(),
        });
        let probe = SpotlightProbe::real();
        // Sample by directory: query each dir's last-used-date directly. This is
        // an approximation — real per-file rollup is deferred to a later version.
        let paths: Vec<String> = tree.nodes.iter().map(|n| n.path.clone()).collect();
        let answers = probe.last_used_for_paths(&paths);
        for (p, a) in paths.iter().zip(answers) {
            if let Some(t) = a {
                last_used.insert(p.clone(), t);
            }
        }
        progress_cb(&ProgressEvent::ProbeCompleted {
            kind: "spotlight".into(),
            applied: last_used.len(),
        });
    }

    // --- Hashing probe ---
    let mut dupe_groups: HashMap<String, u64> = HashMap::new();
    if !options.disable_hash {
        progress_cb(&ProgressEvent::ProbeStarted {
            kind: "hash".into(),
        });
        // Walk the root once more to enumerate large files.
        // Use the same device-boundary guard as the walker to avoid crossing
        // into APFS sub-volumes or network mounts.
        let root_dev: u64 = std::fs::metadata(root).map(|m| m.dev()).unwrap_or(0);
        let mut large_files = Vec::new();
        for entry in WalkDir::new(root)
            .skip_hidden(false)
            .process_read_dir(move |_depth, _path, _state, children| {
                children.iter_mut().for_each(|child_result| {
                    if let Ok(child) = child_result {
                        if child.file_type().is_dir() {
                            let on_same_device = child
                                .metadata()
                                .map(|m| m.dev() == root_dev)
                                .unwrap_or(true);
                            if !on_same_device {
                                child.read_children_path = None;
                            }
                        }
                    }
                });
            })
            .into_iter()
            .flatten()
        {
            if !entry.file_type().is_file() {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                if meta.len() >= options.hash_min_bytes {
                    large_files.push(entry.path().to_string_lossy().to_string());
                }
            }
        }
        // Cap to avoid pathological cases.
        large_files.truncate(10_000);
        let groups = find_duplicates(&large_files, options.hash_min_bytes)?;
        // The dupe map is keyed by file path, but our nodes are dirs. We
        // attach a duplicate_group_id to a directory if it contains any file
        // from any group; the UI distinguishes "directory contains dupes"
        // from "directory IS a dupe".
        for (file_path, gid) in &groups {
            if let Some(parent) = Path::new(file_path).parent() {
                let parent_str = parent.to_string_lossy().to_string();
                dupe_groups.insert(parent_str, *gid);
            }
        }
        progress_cb(&ProgressEvent::ProbeCompleted {
            kind: "hash".into(),
            applied: dupe_groups.len(),
        });
    }

    apply_probes(
        &mut tree,
        ProbeResults {
            tm_status,
            icloud_status,
            last_used,
            dupe_groups,
        },
    );

    progress_cb(&ProgressEvent::ScanFinished);
    Ok(tree)
}
