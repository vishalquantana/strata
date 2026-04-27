//! Progress event channel and types.
//!
//! Events are emitted by the orchestrator during scanning and consumed
//! either as JSON Lines on stdout (CLI mode) or via channel send (Tauri mode).

use crate::model::CloudProvider;
use serde::{Deserialize, Serialize};

/// One of the largest files discovered so far. Emitted as part of `WalkSnapshot`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BigFile {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    /// Cloud provider syncing this file (iCloud / Google Drive / OneDrive /
    /// Dropbox / Box) or None if local-only. `#[serde(default)]` so older
    /// snapshot consumers ignore the field.
    #[serde(default)]
    pub cloud_provider: Option<CloudProvider>,
    /// True iff this file is a dataless placeholder (allocated blocks far
    /// below logical size — typical of cloud-only / "Optimize Storage" files).
    #[serde(default)]
    pub is_dehydrated: bool,
}

/// Running size of a top-level (depth-1) directory under the scan root.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopDir {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum ProgressEvent {
    WalkStarted {
        root: String,
    },
    WalkProgress {
        dirs_seen: u64,
        files_seen: u64,
        bytes_seen: u64,
    },
    /// Periodic mid-walk snapshot of "what's biggest so far". Sent during
    /// Pass 2 of the walker every few seconds. The lists are sorted by
    /// `size_bytes` descending and capped at a small number.
    WalkSnapshot {
        top_dirs: Vec<TopDir>,
        biggest_files: Vec<BigFile>,
    },
    WalkCompleted {
        node_count: usize,
    },
    ProbeStarted {
        kind: String,
    },
    ProbeCompleted {
        kind: String,
        applied: usize,
    },
    ScanFinished,
    Error {
        message: String,
    },
}
