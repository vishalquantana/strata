//! Owns the background-thread machinery for running a scan and emitting
//! progress events to the WebView.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use strata_scan::{run, ScanOptions};

/// Spawns the scan on a background thread. Emits `scan-progress` events
/// for each progress update, and a single `scan-complete` event with the
/// JSON-serialized tree at the end.
pub fn start_scan(app: AppHandle, path: PathBuf) {
    let app = Arc::new(app);
    thread::spawn(move || {
        let opts = ScanOptions::defaults();
        let app_for_progress = app.clone();
        // strata_scan::run takes FnMut(&ProgressEvent); wrap in Mutex so the
        // closure can be called mutably from a single thread.
        let cb_app = Arc::new(Mutex::new(app_for_progress));
        let result = run(&path, opts, move |ev| {
            if let Ok(a) = cb_app.lock() {
                let _ = a.emit("scan-progress", ev);
            }
        });

        match result {
            Ok(tree) => {
                let _ = app.emit("scan-complete", &tree);
            }
            Err(e) => {
                let _ = app.emit("scan-error", e.to_string());
            }
        }
    });
}
