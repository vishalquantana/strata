//! Known-junk pattern matching.
//!
//! Two kinds of rules:
//!  1. Basename match: dir whose name is in `JUNK_BASENAMES`.
//!  2. Path-prefix match: path that starts with one of `JUNK_PATH_PREFIXES`,
//!     resolved relative to the user's home directory at runtime.

use std::path::Path;

/// Directory basenames that are unconditionally junk.
/// Keep this conservative — false positives are worse than false negatives,
/// because users may want to delete based on this signal.
const JUNK_BASENAMES: &[&str] = &[
    "node_modules",
    ".next",
    "dist",
    "build",
    "target", // Rust
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    ".pytest_cache",
    ".gradle",
    ".cargo-cache",
];

/// Path-suffix patterns under the user's home directory. Stored as
/// `Library/...` (without leading `~/`) so we can match by path-contains.
const JUNK_PATH_SUFFIXES: &[&str] = &[
    "Library/Caches",
    "Library/Developer/Xcode/DerivedData",
    "Library/Developer/CoreSimulator",
    "Library/Logs",
    "Library/Application Support/CrashReporter",
];

pub fn is_known_junk(path: &Path) -> bool {
    if let Some(basename) = path.file_name().and_then(|s| s.to_str()) {
        if JUNK_BASENAMES.contains(&basename) {
            return true;
        }
    }

    // Path suffix check: only meaningful for absolute paths.
    let path_str = path.to_string_lossy();
    for suffix in JUNK_PATH_SUFFIXES {
        // Match either exactly ".../Library/Caches" or anything beneath it.
        if path_str.contains(&format!("/{suffix}"))
            && (path_str.ends_with(suffix) || path_str.contains(&format!("/{suffix}/")))
        {
            return true;
        }
    }

    false
}
