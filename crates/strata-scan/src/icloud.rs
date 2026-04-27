//! Cloud-storage detection (iCloud + third-party providers).
//!
//! Two signals combined:
//!  1. Path-based: known sync-root locations under the user's home. iCloud
//!     uses `Library/Mobile Documents/com~apple~CloudDocs` (and optionally
//!     mirrors `Desktop` / `Documents`). macOS 12.3+ funnels third-party
//!     providers (Google Drive, OneDrive, Dropbox, Box) through the
//!     `Library/CloudStorage/<Provider>-...` FileProvider directory.
//!  2. xattr-based: presence of `com.apple.cloud.docs` extended attribute
//!     on the path (set by the iCloud sync agent).
//!
//! `is_in_icloud_path` is preserved for the existing iCloud-only probe and
//! for backwards-compat with serialized snapshots; `detect_cloud_provider`
//! is the broader version used by the walker to fill the new
//! `Signals::cloud_provider` field.

use crate::model::CloudProvider;
use std::path::Path;

const ICLOUD_DOCS_REL: &str = "Library/Mobile Documents/com~apple~CloudDocs";

/// Detect which cloud provider (if any) syncs the given path. Path-only
/// (no syscalls), so safe to call on every file in the hot loop.
pub fn detect_cloud_provider(home: &str, path: &str) -> Option<CloudProvider> {
    // iCloud Drive root.
    let icloud_root = format!("{home}/{ICLOUD_DOCS_REL}");
    if path == icloud_root || path.starts_with(&format!("{icloud_root}/")) {
        return Some(CloudProvider::ICloud);
    }
    // Per-app iCloud containers also live under Mobile Documents.
    let mobile_docs = format!("{home}/Library/Mobile Documents/");
    if path.starts_with(&mobile_docs) {
        return Some(CloudProvider::ICloud);
    }

    // Modern third-party providers all funnel through CloudStorage/.
    let cloud_storage = format!("{home}/Library/CloudStorage/");
    if let Some(rest) = path.strip_prefix(&cloud_storage) {
        // The first path component is "<Provider>-<account>" or just "<Provider>".
        let first = rest.split('/').next().unwrap_or("");
        if first.starts_with("GoogleDrive") {
            return Some(CloudProvider::GoogleDrive);
        }
        if first.starts_with("OneDrive") {
            return Some(CloudProvider::OneDrive);
        }
        if first.starts_with("Dropbox") {
            return Some(CloudProvider::Dropbox);
        }
        if first.starts_with("Box") {
            return Some(CloudProvider::Box);
        }
    }

    // Legacy direct-in-home folders for older installs that pre-date
    // FileProvider funneling.
    for (prefix, prov) in &[
        ("Google Drive", CloudProvider::GoogleDrive),
        ("Dropbox", CloudProvider::Dropbox),
        ("OneDrive", CloudProvider::OneDrive),
    ] {
        let p = format!("{home}/{prefix}");
        if path == p || path.starts_with(&format!("{p}/")) {
            return Some(*prov);
        }
    }

    None
}

/// Heuristic: a file is "dehydrated" (cloud-only placeholder) when its
/// allocated blocks are well below its logical length. macOS reports
/// `st_blocks` in 512-byte units. Skip tiny files (≤ 4 KiB) where one
/// block already covers the whole content.
pub fn is_file_dehydrated(blocks: u64, size: u64) -> bool {
    if size <= 4096 {
        return false;
    }
    // Allow a ~50 % slack so sparsely-stored small files aren't flagged.
    blocks.saturating_mul(512).saturating_mul(2) < size
}

/// Path-based iCloud match. Cheaper than xattr lookup; enough for v1.
pub fn is_in_icloud_path(home: &str, path: &str) -> bool {
    let icloud_root = format!("{home}/{ICLOUD_DOCS_REL}");
    if path == icloud_root || path.starts_with(&format!("{icloud_root}/")) {
        return true;
    }
    // Desktop & Documents may be iCloud-mirrored when iCloud Drive option
    // is enabled. We optimistically treat them as such; the orchestrator
    // gates on iCloud Drive being installed.
    for sub in &["Desktop", "Documents"] {
        let p = format!("{home}/{sub}");
        if path == p || path.starts_with(&format!("{p}/")) {
            return true;
        }
    }
    false
}

/// Returns true iff the path has the `com.apple.cloud.docs` xattr.
/// Best-effort — returns false on any error.
#[cfg(target_os = "macos")]
pub fn has_cloud_docs_xattr(path: &Path) -> bool {
    matches!(xattr::get(path, "com.apple.cloud.docs"), Ok(Some(_)))
}

#[cfg(not(target_os = "macos"))]
pub fn has_cloud_docs_xattr(_path: &Path) -> bool {
    false
}

/// Returns true iff iCloud Drive appears to be enabled on this machine
/// (the Mobile Documents directory exists). The orchestrator should call
/// this once at scan-start and skip path-based matches if false.
pub fn icloud_drive_enabled(home: &str) -> bool {
    Path::new(&format!("{home}/{ICLOUD_DOCS_REL}")).is_dir()
}
