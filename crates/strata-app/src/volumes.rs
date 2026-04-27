//! Enumerate mounted disks for the disk-picker UI.

use serde::Serialize;
use std::collections::HashSet;
use sysinfo::Disks;

#[derive(Serialize)]
pub struct Volume {
    pub name: String,
    pub path: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub used_bytes: u64,
    pub is_removable: bool,
    pub is_internal: bool,
}

/// Returns user-meaningful mounted volumes. On macOS this is the boot
/// volume plus any externals under `/Volumes/`. APFS system volumes
/// (Recovery, Preboot, Update, VM) are filtered out.
pub fn list_volumes() -> Vec<Volume> {
    let disks = Disks::new_with_refreshed_list();
    let mut out: Vec<Volume> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for d in &disks {
        let mp = d.mount_point().to_string_lossy().to_string();

        // Only the root volume or things under /Volumes/.
        if mp != "/" && !mp.starts_with("/Volumes/") {
            continue;
        }

        // Filter known macOS system / hidden mounts.
        let mp_lc = mp.to_ascii_lowercase();
        if mp_lc.starts_with("/volumes/recovery")
            || mp_lc.starts_with("/volumes/update")
            || mp_lc.starts_with("/volumes/preboot")
            || mp_lc.starts_with("/volumes/vm")
            || mp_lc.starts_with("/volumes/.timemachine")
            || mp_lc.starts_with("/volumes/com.apple")
        {
            continue;
        }

        if !seen.insert(mp.clone()) {
            continue;
        }

        let total = d.total_space();
        let free = d.available_space();
        if total == 0 {
            continue;
        }

        let raw_name = d.name().to_string_lossy().to_string();
        let display_name = if raw_name.is_empty() || raw_name == "untitled" {
            if mp == "/" {
                "Macintosh HD".to_string()
            } else {
                mp.trim_start_matches("/Volumes/").to_string()
            }
        } else {
            raw_name
        };

        let is_removable = d.is_removable();
        out.push(Volume {
            name: display_name,
            path: mp,
            total_bytes: total,
            free_bytes: free,
            used_bytes: total.saturating_sub(free),
            is_removable,
            is_internal: !is_removable,
        });
    }

    // Internal first, then largest first.
    out.sort_by(|a, b| {
        b.is_internal
            .cmp(&a.is_internal)
            .then_with(|| b.total_bytes.cmp(&a.total_bytes))
    });

    out
}
