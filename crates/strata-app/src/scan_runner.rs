//! Owns the background-thread machinery for running a scan and emitting
//! progress events to the WebView.
//!
//! Scans run on a detached `std::thread`, but a single global slot tracks
//! the currently-active scan so that:
//!   - Starting a new scan cancels the previous one (cooperative
//!     `Arc<AtomicBool>` flag polled inside the walker).
//!   - The user can explicitly cancel via the Cancel button (calls
//!     [`cancel_current_scan`]).
//! Events from a cancelled scan are dropped at emit time so a stale
//! `scan-complete` from the old `/` walk can't clobber the new
//! `~/Downloads` view.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use strata_scan::progress::ProgressEvent;
use strata_scan::{run, ScanOptions};

use crate::persist;

/// Monotonic scan id; only the most recent scan's emits reach the WebView.
static SCAN_SEQ: AtomicU64 = AtomicU64::new(0);

/// Handle to the currently-running scan. `None` when no scan is in flight.
struct RunningScan {
    id: u64,
    cancel: Arc<AtomicBool>,
}

fn slot() -> &'static Mutex<Option<RunningScan>> {
    use std::sync::OnceLock;
    static SLOT: OnceLock<Mutex<Option<RunningScan>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// Cancel any running scan. Safe to call when no scan is active (no-op).
pub fn cancel_current_scan() {
    if let Ok(mut s) = slot().lock() {
        if let Some(running) = s.take() {
            eprintln!("[strata-app] cancelling scan id={}", running.id);
            running.cancel.store(true, Ordering::Relaxed);
        }
    }
}

/// Spawns the scan on a background thread. Cancels any previously-running
/// scan first so events from the stale walk don't clobber the new one.
pub fn start_scan(app: AppHandle, path: PathBuf) {
    eprintln!("[strata-app] start_scan called for {}", path.display());
    // Cancel any in-flight scan so its emits are dropped.
    cancel_current_scan();

    let id = SCAN_SEQ.fetch_add(1, Ordering::Relaxed) + 1;
    let cancel = Arc::new(AtomicBool::new(false));
    if let Ok(mut s) = slot().lock() {
        *s = Some(RunningScan {
            id,
            cancel: cancel.clone(),
        });
    }

    let app = Arc::new(app);
    let source_path = path.to_string_lossy().to_string();
    let cancel_for_thread = cancel.clone();
    thread::spawn(move || {
        eprintln!(
            "[strata-app] scan thread started id={} path={}",
            id,
            path.display()
        );
        let opts = ScanOptions::defaults();
        let app_for_progress = app.clone();
        let cb_app = Arc::new(Mutex::new(app_for_progress));
        let mut emit_count: u64 = 0;
        let source_for_cb = source_path.clone();
        let cancel_for_cb = cancel_for_thread.clone();
        let result = run(&path, opts, cancel_for_thread.clone(), move |ev| {
            // Drop stale emits if cancelled — UI might already be showing a new scan.
            if cancel_for_cb.load(Ordering::Relaxed) {
                return;
            }
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
                            eprintln!(
                                "[strata-app] emitted scan-progress id={id} #{emit_count}"
                            );
                        }
                    }
                    Err(e) => eprintln!("[strata-app] emit failed: {e}"),
                }
            }
        });

        // If we were cancelled, swallow the result entirely — a newer scan
        // may already be feeding the UI and we mustn't clobber it.
        let was_cancelled = cancel_for_thread.load(Ordering::Relaxed);
        if was_cancelled {
            eprintln!("[strata-app] scan id={id} cancelled — dropping result");
            return;
        }

        // Clear the slot only if this scan is still the active one. (A newer
        // scan may have replaced it before we finished — in that case our
        // cancel flag would already be true above.)
        if let Ok(mut s) = slot().lock() {
            if let Some(running) = s.as_ref() {
                if running.id == id {
                    *s = None;
                }
            }
        }

        match result {
            Ok(tree) => {
                eprintln!(
                    "[strata-app] scan id={} complete: {} nodes",
                    id,
                    tree.nodes.len()
                );
                // Mark the persisted snapshot as complete so the resume
                // card on next launch can label it correctly.
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
                eprintln!("[strata-app] scan id={id} error: {e}");
                let _ = app.emit("scan-error", e.to_string());
            }
        }
    });
}
