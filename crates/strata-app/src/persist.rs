//! Persist the latest mid-scan snapshot to disk so the user sees their
//! previous treemap + biggest-files immediately on next launch, even after
//! closing the window mid-scan.
//!
//! We do NOT persist the full ScanTree — only the lightweight WalkSnapshot
//! payload (top dirs + biggest files) plus the path that was being scanned
//! and a UTC timestamp. This is "last known state", not a true resume.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use strata_scan::progress::{BigFile, TopDir};

/// What we write to disk on each snapshot tick.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedSnapshot {
    pub source_path: String,
    /// Unix epoch seconds when this snapshot was captured.
    pub captured_at: u64,
    /// Whether the scan that produced this snapshot completed normally
    /// (`true`) or was interrupted by app/window close (`false`). The
    /// frontend uses this to label the resume card.
    pub is_complete: bool,
    pub top_dirs: Vec<TopDir>,
    pub biggest_files: Vec<BigFile>,
}

/// Resolve the JSON file location: `~/Library/Application Support/Strata/last-scan.json`.
fn snapshot_path() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let dir = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("Strata");
    Some(dir.join("last-scan.json"))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Write the snapshot to disk. Best-effort; logs but does not bubble up
/// errors so a failed write never crashes the scan.
pub fn save(
    source_path: &str,
    top_dirs: &[TopDir],
    biggest_files: &[BigFile],
    is_complete: bool,
) {
    let Some(path) = snapshot_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            eprintln!("[strata-app/persist] mkdir failed: {e}");
            return;
        }
    }
    let payload = PersistedSnapshot {
        source_path: source_path.to_string(),
        captured_at: now_secs(),
        is_complete,
        top_dirs: top_dirs.to_vec(),
        biggest_files: biggest_files.to_vec(),
    };
    match serde_json::to_vec(&payload) {
        Ok(bytes) => {
            if let Err(e) = fs::write(&path, bytes) {
                eprintln!("[strata-app/persist] write failed: {e}");
            }
        }
        Err(e) => eprintln!("[strata-app/persist] serialize failed: {e}"),
    }
}

/// Read the last snapshot if one exists.
pub fn load() -> Option<PersistedSnapshot> {
    let path = snapshot_path()?;
    let bytes = fs::read(&path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Delete the persisted snapshot (called when the user explicitly dismisses
/// the resume card or starts a fresh scan).
pub fn clear() {
    if let Some(path) = snapshot_path() {
        let _ = fs::remove_file(path);
    }
}
