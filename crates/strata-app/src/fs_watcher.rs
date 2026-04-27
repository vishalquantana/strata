//! FSEvents-backed live filesystem watcher. Stub — implemented in Task 2.

#[tauri::command]
pub fn start_watching(_path: String) -> Result<(), String> { Ok(()) }
#[tauri::command]
pub fn stop_watching() -> Result<(), String> { Ok(()) }
