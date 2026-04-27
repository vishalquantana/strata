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
    eprintln!("[strata-app] start_scan called for {}", path.display());
    let app = Arc::new(app);
    thread::spawn(move || {
        eprintln!("[strata-app] scan thread started for {}", path.display());
        let opts = ScanOptions::defaults();
        let app_for_progress = app.clone();
        let cb_app = Arc::new(Mutex::new(app_for_progress));
        let mut emit_count: u64 = 0;
        let result = run(&path, opts, move |ev| {
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
