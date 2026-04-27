//! Aggregation of child signals to parents.
//!
//! Inputs: a partially-populated ScanTree (sizes + mtime + junk are already
//! set by the walker) and a bundle of probe results keyed by path. Outputs:
//! the same tree with all per-path signals applied and rolled up.

use crate::model::{NodeId, ScanTree};
use chrono::{DateTime, Utc};
use std::collections::HashMap;

pub struct ProbeResults {
    /// Path → is-backed-up-by-TM.
    pub tm_status: HashMap<String, bool>,
    /// Path → is-in-iCloud.
    pub icloud_status: HashMap<String, bool>,
    /// Path → last-used-date (Spotlight).
    pub last_used: HashMap<String, DateTime<Utc>>,
    /// Path → duplicate-group-id (from hasher).
    pub dupe_groups: HashMap<String, u64>,
}

pub fn apply_probes(tree: &mut ScanTree, probes: ProbeResults) {
    // Step 1: apply per-node values directly.
    for node in tree.nodes.iter_mut() {
        if let Some(v) = probes.tm_status.get(&node.path) {
            node.signals.is_backed_up_tm = *v;
        }
        if let Some(v) = probes.icloud_status.get(&node.path) {
            node.signals.is_in_icloud = *v;
        }
        if let Some(v) = probes.last_used.get(&node.path) {
            node.signals.last_used_at = Some(*v);
        }
        if let Some(v) = probes.dupe_groups.get(&node.path) {
            node.signals.duplicate_group_id = Some(*v);
        }
    }

    // Step 2: roll signals up. Process leaves first (highest depth).
    let mut order: Vec<NodeId> = (0..tree.nodes.len() as NodeId).collect();
    order.sort_by_key(|id| std::cmp::Reverse(tree.nodes[*id as usize].depth));
    for id in order {
        let id = id as usize;
        let (max_used, any_tm, any_icloud) = {
            let n = &tree.nodes[id];
            let mut max_used = n.signals.last_used_at;
            let mut any_tm = n.signals.is_backed_up_tm;
            let mut any_icloud = n.signals.is_in_icloud;
            for &c in &n.children {
                let child = &tree.nodes[c as usize];
                if let Some(cu) = child.signals.last_used_at {
                    max_used = Some(match max_used {
                        Some(mu) => mu.max(cu),
                        None => cu,
                    });
                }
                // For TM: parent counts as backed-up if any descendant is.
                // (Inheritance from parent already applied above for explicit parent paths.)
                any_tm = any_tm || child.signals.is_backed_up_tm;
                any_icloud = any_icloud || child.signals.is_in_icloud;
            }
            (max_used, any_tm, any_icloud)
        };
        let n = &mut tree.nodes[id];
        n.signals.last_used_at = max_used;
        n.signals.is_backed_up_tm = any_tm;
        n.signals.is_in_icloud = any_icloud;
    }
}
