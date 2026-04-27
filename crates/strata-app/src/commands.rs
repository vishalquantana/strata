//! Tauri command handlers exposed to the WebView.

use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::scan_runner;

/// Open a folder-picker dialog. Returns the selected path or None.
#[tauri::command]
pub async fn pick_directory(app: AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |chosen| {
        let resolved = chosen
            .and_then(|fp| fp.into_path().ok())
            .map(|p| p.to_string_lossy().into_owned());
        let _ = tx.send(resolved);
    });
    rx.await.unwrap_or(None)
}

/// Start a scan of the given path. Returns immediately; events stream via
/// `scan-progress`, `scan-complete`, and `scan-error`.
#[tauri::command]
pub fn start_scan(app: AppHandle, path: String) {
    scan_runner::start_scan(app, PathBuf::from(path));
}
