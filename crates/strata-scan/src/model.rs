//! Core data types: DirNode, Signals, Stale.
//!
//! `DirNode` is the unit of the scan tree — one per directory.
//! `Signals` carries the six derived metrics we collect.
//! `Stale` is the discrete bucket derived from those signals.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Stable identifier for a node in the scan tree.
/// Index into the flat `Vec<DirNode>` returned by the walker.
pub type NodeId = u32;

/// Discrete staleness bucket, derived from `Signals::staleness`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Stale {
    Hot,       // ≤ 30 days since last touched
    Warm,      // 31-180 days
    Stale,     // 180 days - 2 years
    VeryStale, // > 2 years
}

/// Cloud-storage provider syncing this path. Detected via path-prefix during
/// the walk; macOS 12.3+ unifies third-party providers under
/// `~/Library/CloudStorage/<Provider>-...`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CloudProvider {
    ICloud,
    GoogleDrive,
    OneDrive,
    Dropbox,
    Box,
}

/// All six signals collected for a directory.
/// Defaults represent "unknown" / "not yet computed".
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Signals {
    /// Latest `kMDItemLastUsedDate` of any descendant file. None if Spotlight
    /// has no record (file never opened by a tracked app, or Spotlight off).
    pub last_used_at: Option<DateTime<Utc>>,
    /// Latest mtime of any descendant. Always present (zero-time fallback if walk failed).
    #[serde(default = "epoch_now")]
    pub last_modified_at: DateTime<Utc>,
    /// File creation time of the directory itself.
    #[serde(default = "epoch_now")]
    pub created_at: DateTime<Utc>,
    /// True iff the directory is *not* excluded from Time Machine
    /// AND a recent Time Machine backup exists. False or unknown → false.
    pub is_backed_up_tm: bool,
    /// True iff path is under a known iCloud-mirroring location
    /// OR has the `com.apple.cloud.docs` xattr.
    pub is_in_icloud: bool,
    /// True iff the directory's basename matches a built-in junk pattern
    /// OR the path matches a known cache directory.
    pub is_known_junk: bool,
    /// Set during phase-2 hashing. None until hashing pass completes for this node.
    pub duplicate_group_id: Option<u64>,
    /// Cloud provider syncing this path, or None if not under any known
    /// sync root. Set during the walk via path-prefix lookup.
    #[serde(default)]
    pub cloud_provider: Option<CloudProvider>,
    /// True iff the file's allocated blocks are far below its logical size
    /// — i.e. the file is a dataless placeholder and downloads on demand.
    /// Computed from `st_blocks` vs `st_size` during the walk for file leaves.
    #[serde(default)]
    pub is_dehydrated: bool,
}

fn epoch_now() -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(0, 0).unwrap()
}

impl Signals {
    /// Bucket the signals into a discrete staleness value.
    /// Uses max(last_used_at, last_modified_at) as the "freshness" timestamp.
    pub fn staleness(&self, now: DateTime<Utc>) -> Stale {
        let freshest = self
            .last_used_at
            .map(|u| u.max(self.last_modified_at))
            .unwrap_or(self.last_modified_at);
        let age_days = (now - freshest).num_days();
        match age_days {
            i64::MIN..=30 => Stale::Hot,
            31..=180 => Stale::Warm,
            181..=730 => Stale::Stale,
            _ => Stale::VeryStale,
        }
    }
}

/// One node in the scan tree. Despite the legacy name, a node can be either
/// a directory or an individual file (large files ≥ FILE_NODE_MIN_BYTES are
/// promoted to leaf nodes so the treemap can render them as distinct tiles).
/// Files are leaves: `children` is empty and `is_file` is true.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirNode {
    pub id: NodeId,
    pub parent_id: Option<NodeId>,
    /// Full absolute path.
    pub path: String,
    /// Just the basename, for display.
    pub name: String,
    /// Depth from scan root (root = 0).
    pub depth: u16,
    /// For dirs: recursive total bytes (this dir's small-files lump + all
    /// descendant dirs and big-file leaf nodes).
    /// For files: this file's own size.
    pub size_bytes: u64,
    /// Recursive total file count (regular files only — not symlinks or directories).
    pub file_count: u64,
    pub signals: Signals,
    /// IDs of immediate child nodes (dirs and big-file leaves).
    pub children: Vec<NodeId>,
    /// True iff this node represents an individual file leaf, false for dirs.
    /// Defaults to false so older serialized trees deserialize cleanly.
    #[serde(default)]
    pub is_file: bool,
}

/// The full scan result — flat list of nodes plus the root id for traversal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanTree {
    pub root_id: NodeId,
    pub nodes: Vec<DirNode>,
    /// When the scan started.
    pub scanned_at: DateTime<Utc>,
    /// Source path that was scanned (the user-provided argument).
    pub source_path: String,
}
