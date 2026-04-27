#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod scan_runner;
mod volumes;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::pick_directory,
            commands::start_scan,
            commands::list_volumes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Strata");
}
