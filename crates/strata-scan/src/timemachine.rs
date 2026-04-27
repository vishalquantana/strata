//! Time Machine backup status.
//!
//! On macOS, queries `tmutil isexcluded <path>` to learn whether a directory
//! would be included in Time Machine backups. Note: this does NOT verify a
//! backup actually happened — just that it's eligible.
//!
//! Includes a stub backend for unit testing without invoking the real tmutil.

use std::collections::HashMap;
use std::process::Command;
use std::sync::Mutex;

/// Result of a `tmutil isexcluded` query.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TmStatus {
    /// Path is included in Time Machine backups.
    Included,
    /// Path is excluded from Time Machine backups.
    Excluded,
    /// Could not determine (tmutil missing, error, etc).
    Unknown,
}

enum Backend {
    Real,
    Stub(TmStatus),
}

pub struct TmChecker {
    backend: Backend,
    cache: Mutex<HashMap<String, TmStatus>>,
}

impl TmChecker {
    /// Create a real checker that shells out to `tmutil`.
    pub fn real() -> Self {
        Self {
            backend: Backend::Real,
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// Create a stub for testing — returns the configured status for every query.
    pub fn stub(status: TmStatus) -> Self {
        Self {
            backend: Backend::Stub(status),
            cache: Mutex::new(HashMap::new()),
        }
    }

    /// Returns true iff the path appears to be backed up by Time Machine.
    /// Cached per path within this checker's lifetime.
    pub fn is_backed_up(&self, path: &str) -> bool {
        match self.lookup(path) {
            TmStatus::Included => true,
            TmStatus::Excluded | TmStatus::Unknown => false,
        }
    }

    fn lookup(&self, path: &str) -> TmStatus {
        if let Some(cached) = self.cache.lock().unwrap().get(path) {
            return *cached;
        }
        let status = match &self.backend {
            Backend::Stub(s) => *s,
            Backend::Real => query_tmutil(path),
        };
        self.cache.lock().unwrap().insert(path.to_string(), status);
        status
    }
}

fn query_tmutil(path: &str) -> TmStatus {
    let output = Command::new("tmutil").arg("isexcluded").arg(path).output();
    match output {
        Ok(out) if out.status.success() => {
            let s = String::from_utf8_lossy(&out.stdout);
            // tmutil prints e.g. "[Excluded]    /path" or "[Included]    /path"
            if s.contains("[Excluded]") {
                TmStatus::Excluded
            } else if s.contains("[Included]") {
                TmStatus::Included
            } else {
                TmStatus::Unknown
            }
        }
        _ => TmStatus::Unknown,
    }
}
