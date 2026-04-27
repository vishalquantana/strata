//! FSEvents-backed live filesystem watcher. Emits `fs-changed` events
//! containing the affected paths. Frontend coalesces and triggers
//! incremental re-scans.

use notify::{recommended_watcher, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatcherState(pub Mutex<Option<RecommendedWatcher>>);

#[derive(serde::Serialize, Clone)]
pub struct FsChange {
    pub path: String,
    pub kind: String,
}

#[tauri::command]
pub fn start_watching(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    // Build and verify the new watcher BEFORE touching the existing state.
    // This preserves the invariant: guard is None only if stop_watching was called.
    let app2 = app.clone();
    let mut watcher = recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            let kind = match ev.kind {
                EventKind::Create(_) => "create",
                EventKind::Modify(_) => "modify",
                EventKind::Remove(_) => "remove",
                _ => "other",
            };
            for p in ev.paths {
                let _ = app2.emit("fs-changed", FsChange {
                    path: p.to_string_lossy().to_string(),
                    kind: kind.to_string(),
                });
            }
        }
    })
    .map_err(|e| e.to_string())?;

    // Attempt to start watching; if this errors the old watcher is untouched.
    watcher
        .watch(&PathBuf::from(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Only now acquire the lock and atomically replace the old watcher.
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn stop_watching(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}
