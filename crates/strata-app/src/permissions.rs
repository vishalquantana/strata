//! Full Disk Access detection.
//!
//! macOS gates `~/Library/Application Support/com.apple.TCC` and similar
//! protected paths behind FDA. We probe by attempting to read a known
//! protected path; if it succeeds, FDA is granted.
//!
//! The check is best-effort. We use `~/Library/Mail` as the canary —
//! reading its directory listing requires FDA on modern macOS.

use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FdaStatus {
    Granted,
    Denied,
    Unknown,
}

pub fn check() -> FdaStatus {
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return FdaStatus::Unknown,
    };
    let canary = PathBuf::from(home).join("Library").join("Mail");
    if !canary.exists() {
        // No Mail directory at all (e.g., user never ran Mail.app). Try
        // ~/Library/Application Support/com.apple.TCC instead.
        return probe_tcc();
    }
    match fs::read_dir(&canary) {
        Ok(_) => FdaStatus::Granted,
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => FdaStatus::Denied,
        Err(_) => FdaStatus::Unknown,
    }
}

fn probe_tcc() -> FdaStatus {
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return FdaStatus::Unknown,
    };
    let tcc = PathBuf::from(home)
        .join("Library/Application Support/com.apple.TCC");
    match fs::read_dir(&tcc) {
        Ok(_) => FdaStatus::Granted,
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => FdaStatus::Denied,
        Err(_) => FdaStatus::Unknown,
    }
}
