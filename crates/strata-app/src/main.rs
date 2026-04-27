#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod fs_watcher;
mod permissions;
mod scan_runner;
mod volumes;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(fs_watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            commands::pick_directory,
            commands::start_scan,
            commands::list_volumes,
            commands::reveal_in_finder,
            commands::move_to_trash,
            commands::check_full_disk_access,
            commands::open_fda_settings,
            commands::home_dir,
            fs_watcher::start_watching,
            fs_watcher::stop_watching,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Strata");
}
