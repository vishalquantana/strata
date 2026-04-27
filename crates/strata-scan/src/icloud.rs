//! iCloud Drive detection.
//!
//! Two signals combined:
//!  1. Path-based: known iCloud-mirroring locations under the user's home
//!     (Mobile Documents, optionally Desktop and Documents when iCloud Drive
//!     is enabled with those toggled on).
//!  2. xattr-based: presence of `com.apple.cloud.docs` extended attribute on
//!     the directory itself (set by iCloud sync agent on synced items).
//!
//! Returning true means *the local copy is also in iCloud* — typically
//! safe-to-delete locally if storage optimization isn't on.

use std::path::Path;

const ICLOUD_DOCS_REL: &str = "Library/Mobile Documents/com~apple~CloudDocs";

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
    matches!(
        xattr::get(path, "com.apple.cloud.docs"),
        Ok(Some(_))
    )
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
