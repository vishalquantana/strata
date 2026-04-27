#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod fs_watcher;
mod permissions;
mod scan_runner;
mod volumes;

fn main() {
    // Redirect stderr to ~/Library/Logs/strata.log so Finder-launched
    // builds capture diagnostic output. Best-effort; failure is silent.
    if let Ok(home) = std::env::var("HOME") {
        let path = format!("{home}/Library/Logs/strata.log");
        if let Ok(file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            use std::os::unix::io::IntoRawFd;
            let fd = file.into_raw_fd();
            unsafe {
                libc::dup2(fd, 2); // redirect stderr
                libc::dup2(fd, 1); // redirect stdout too
                libc::close(fd);
            }
            let secs = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            eprintln!(
                "\n=== strata started epoch={} pid={} ===",
                secs,
                std::process::id()
            );
        }
    }

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
