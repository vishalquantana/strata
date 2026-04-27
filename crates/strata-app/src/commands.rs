//! Tauri command handlers exposed to the WebView.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::permissions::{check as check_fda, FdaStatus};
use crate::persist::{self, PersistedSnapshot};
use crate::scan_runner;
use crate::volumes::{list_volumes as list_volumes_impl, Volume};

/// Enumerate mounted disks for the disk-picker UI.
#[tauri::command]
pub fn list_volumes() -> Vec<Volume> {
    list_volumes_impl()
}

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

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    Command::new("open")
        .arg("-R")
        .arg(&path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to invoke open: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| format!("Failed to trash {path}: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn check_full_disk_access() -> FdaStatus {
    check_fda()
}

/// Return the user's HOME directory so the WebView can build preset paths
/// like ~/Documents and ~/Downloads without needing the dialog.
#[tauri::command]
pub fn home_dir() -> Result<String, String> {
    std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))
}

/// Read the last persisted snapshot from disk so the welcome screen can
/// offer a "Resume last view" card on cold start. Returns `None` if no
/// previous scan ran or the file is missing/corrupt.
#[tauri::command]
pub fn load_last_snapshot() -> Option<PersistedSnapshot> {
    persist::load()
}

/// Delete the persisted snapshot. Called when the user dismisses the resume
/// card or starts a fresh scan they don't want to roll back to.
#[tauri::command]
pub fn clear_last_snapshot() -> Result<(), String> {
    persist::clear();
    Ok(())
}

#[tauri::command]
pub fn open_fda_settings() -> Result<(), String> {
    Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to open Settings: {e}"))?;
    Ok(())
}
