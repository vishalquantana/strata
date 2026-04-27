//! Owns the background-thread machinery for running a scan and emitting
//! progress events to the WebView.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use strata_scan::progress::ProgressEvent;
use strata_scan::{run, ScanOptions};

use crate::persist;

/// Spawns the scan on a background thread. Emits `scan-progress` events
/// for each progress update, and a single `scan-complete` event with the
/// JSON-serialized tree at the end.
pub fn start_scan(app: AppHandle, path: PathBuf) {
    eprintln!("[strata-app] start_scan called for {}", path.display());
    let app = Arc::new(app);
    let source_path = path.to_string_lossy().to_string();
    thread::spawn(move || {
        eprintln!("[strata-app] scan thread started for {}", path.display());
        let opts = ScanOptions::defaults();
        let app_for_progress = app.clone();
        let cb_app = Arc::new(Mutex::new(app_for_progress));
        let mut emit_count: u64 = 0;
        let source_for_cb = source_path.clone();
        let result = run(&path, opts, move |ev| {
            // Persist mid-scan snapshots so a window-close mid-scan still
            // leaves the user with their last treemap on next launch.
            if let ProgressEvent::WalkSnapshot {
                top_dirs,
                biggest_files,
            } = ev
            {
                persist::save(&source_for_cb, top_dirs, biggest_files, false);
            }
            if let Ok(a) = cb_app.lock() {
                match a.emit("scan-progress", ev) {
                    Ok(_) => {
                        emit_count += 1;
                        if emit_count <= 3 || emit_count % 50 == 0 {
                            eprintln!("[strata-app] emitted scan-progress #{emit_count}");
                        }
                    }
                    Err(e) => eprintln!("[strata-app] emit failed: {e}"),
                }
            }
        });

        match result {
            Ok(tree) => {
                eprintln!(
                    "[strata-app] scan complete: {} nodes",
                    tree.nodes.len()
                );
                // Mark the persisted snapshot as complete so the resume
                // card on next launch can label it correctly. We re-use
                // the latest mid-walk snapshot (already on disk); just
                // overwrite with is_complete=true and an empty payload —
                // the actual tree is in memory and will be replaced when
                // the user clicks Rescan. Simplest: leave existing data,
                // flip flag.
                if let Some(prev) = persist::load() {
                    persist::save(
                        &prev.source_path,
                        &prev.top_dirs,
                        &prev.biggest_files,
                        true,
                    );
                }
                if let Err(e) = app.emit("scan-complete", &tree) {
                    eprintln!("[strata-app] scan-complete emit failed: {e}");
                }
            }
            Err(e) => {
                eprintln!("[strata-app] scan error: {e}");
                let _ = app.emit("scan-error", e.to_string());
            }
        }
    });
}
