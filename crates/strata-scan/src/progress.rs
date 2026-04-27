//! Progress event channel and types.
//!
//! Events are emitted by the orchestrator during scanning and consumed
//! either as JSON Lines on stdout (CLI mode) or via channel send (Tauri mode).

use serde::{Deserialize, Serialize};

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
