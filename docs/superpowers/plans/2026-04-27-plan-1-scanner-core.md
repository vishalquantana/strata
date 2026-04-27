# Strata Plan 1 — Rust Scanner Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone Rust CLI binary `strata-scan` that walks a directory tree, collects all six signals (size, last-used, last-modified, Time Machine backup, iCloud, junk-pattern, duplicate-hash), and emits a JSON tree to stdout. Fully testable in isolation against fixture filesystems.

**Architecture:** A two-phase scanner. Phase 1 = parallel directory walk via `jwalk` collecting filesystem signals (fast, completes within seconds). Phase 2 = optional background passes for Spotlight metadata, Time Machine status, and content hashing. All results aggregated into a single tree of `DirNode` records. Output is streamed JSON Lines for progress, with a final consolidated JSON tree.

**Tech Stack:**
- Rust (stable, edition 2021)
- `jwalk` — parallel directory walker
- `serde` + `serde_json` — serialization
- `clap` — CLI parsing
- `blake3` — content hashing
- `chrono` — timestamps
- `core-foundation` + `core-foundation-sys` — macOS Spotlight FFI
- `xattr` — extended attribute reads (iCloud detection)
- `cargo test` + `assert_cmd` + `tempfile` — testing
- `insta` — snapshot tests for JSON outputs

**Repo location:** `/Users/vishalkumar/Downloads/qdisk` (existing git repo, on `master`, public at github.com/vishalquantana/strata).

---

## File Structure

This plan creates a Cargo workspace at the repo root so future Tauri tasks can add a `strata-app` crate alongside `strata-scan`.

```
qdisk/
├── Cargo.toml                           # workspace manifest
├── crates/
│   └── strata-scan/
│       ├── Cargo.toml                   # binary crate
│       ├── src/
│       │   ├── main.rs                  # CLI entry, argument parsing
│       │   ├── lib.rs                   # library entry; re-exports for tests
│       │   ├── model.rs                 # DirNode, Signals, NodeId, Stale enum
│       │   ├── walker.rs                # phase-1 parallel walk
│       │   ├── junk.rs                  # known-junk pattern matcher
│       │   ├── spotlight.rs             # macOS Spotlight kMDItemLastUsedDate
│       │   ├── timemachine.rs           # tmutil isexcluded shellout
│       │   ├── icloud.rs                # iCloud xattr + path heuristic
│       │   ├── hasher.rs                # phase-2 background dupe detection
│       │   ├── aggregate.rs             # roll up child signals to parents
│       │   ├── output.rs                # JSON Lines progress + final tree
│       │   └── progress.rs              # progress event channel & types
│       └── tests/
│           ├── walker_test.rs           # walker integration tests
│           ├── junk_test.rs
│           ├── aggregate_test.rs
│           ├── hasher_test.rs
│           ├── cli_test.rs              # end-to-end CLI tests via assert_cmd
│           └── snapshots/               # insta snapshot files
└── docs/superpowers/
    ├── specs/2026-04-27-qdisk-design.md  # already present
    └── plans/2026-04-27-plan-1-scanner-core.md  # this file
```

Each module has one responsibility. `model.rs` is the shared vocabulary — every other module either produces or consumes its types.

---

## Task 1: Cargo workspace skeleton

**Files:**
- Create: `Cargo.toml` (workspace manifest)
- Create: `crates/strata-scan/Cargo.toml`
- Create: `crates/strata-scan/src/main.rs`
- Create: `crates/strata-scan/src/lib.rs`

- [ ] **Step 1: Verify Rust toolchain is available**

Run: `rustc --version && cargo --version`
Expected: stable Rust ≥ 1.75 (any version that supports edition 2021).

- [ ] **Step 2: Create the workspace `Cargo.toml`**

Write `Cargo.toml` (at repo root):

```toml
[workspace]
resolver = "2"
members = ["crates/strata-scan"]

[workspace.package]
edition = "2021"
authors = ["Vishal Kumar"]
license = "MIT"
repository = "https://github.com/vishalquantana/strata"
```

- [ ] **Step 3: Create the scanner crate manifest**

Write `crates/strata-scan/Cargo.toml`:

```toml
[package]
name = "strata-scan"
version = "0.1.0"
edition.workspace = true
authors.workspace = true
license.workspace = true
repository.workspace = true
description = "Strata disk scanner — walks a directory tree and emits a signal-rich JSON tree."

[[bin]]
name = "strata-scan"
path = "src/main.rs"

[lib]
name = "strata_scan"
path = "src/lib.rs"

[dependencies]
jwalk = "0.8"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
clap = { version = "4", features = ["derive"] }
blake3 = "1"
chrono = { version = "0.4", features = ["serde"] }
xattr = "1"
anyhow = "1"
thiserror = "1"
crossbeam-channel = "0.5"
once_cell = "1"

[target.'cfg(target_os = "macos")'.dependencies]
core-foundation = "0.9"
core-foundation-sys = "0.8"

[dev-dependencies]
tempfile = "3"
assert_cmd = "2"
predicates = "3"
insta = { version = "1", features = ["json"] }
```

- [ ] **Step 4: Create the empty `lib.rs` with module declarations**

Write `crates/strata-scan/src/lib.rs`:

```rust
//! Strata scanner — disk-tree walker with signal collection.

pub mod aggregate;
pub mod hasher;
pub mod icloud;
pub mod junk;
pub mod model;
pub mod output;
pub mod progress;
pub mod spotlight;
pub mod timemachine;
pub mod walker;
```

- [ ] **Step 5: Create the placeholder `main.rs`**

Write `crates/strata-scan/src/main.rs`:

```rust
fn main() {
    println!("strata-scan — placeholder; see Task 11");
}
```

- [ ] **Step 6: Create empty module files so the crate compiles**

For each of these files, write the single-line stub:

`crates/strata-scan/src/aggregate.rs` → `//! Aggregation of child signals to parents.`
`crates/strata-scan/src/hasher.rs` → `//! Phase-2 duplicate detection by content hashing.`
`crates/strata-scan/src/icloud.rs` → `//! iCloud Drive detection.`
`crates/strata-scan/src/junk.rs` → `//! Known-junk pattern matching.`
`crates/strata-scan/src/model.rs` → `//! Core data types: DirNode, Signals, Stale.`
`crates/strata-scan/src/output.rs` → `//! JSON output formatting.`
`crates/strata-scan/src/progress.rs` → `//! Progress event channel and types.`
`crates/strata-scan/src/spotlight.rs` → `//! macOS Spotlight metadata access.`
`crates/strata-scan/src/timemachine.rs` → `//! Time Machine backup status.`
`crates/strata-scan/src/walker.rs` → `//! Phase-1 parallel directory walk.`

- [ ] **Step 7: Verify the workspace builds cleanly**

Run: `cargo build`
Expected: compiles with no errors. Warnings about unused code are fine.

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml crates/
git commit -m "feat(scanner): cargo workspace skeleton with module stubs"
```

---

## Task 2: Core data model

**Files:**
- Modify: `crates/strata-scan/src/model.rs`
- Test: `crates/strata-scan/tests/model_test.rs`

- [ ] **Step 1: Write the failing test**

Create `crates/strata-scan/tests/model_test.rs`:

```rust
use chrono::{TimeZone, Utc};
use strata_scan::model::{Signals, Stale};

#[test]
fn staleness_buckets_by_max_age() {
    let now = Utc.with_ymd_and_hms(2026, 4, 27, 12, 0, 0).unwrap();

    // Hot: ≤30 days
    let hot = Signals {
        last_used_at: Some(now - chrono::Duration::days(15)),
        last_modified_at: now - chrono::Duration::days(15),
        ..Signals::default()
    };
    assert_eq!(hot.staleness(now), Stale::Hot);

    // Warm: 31 days–6 months (we use 180 days as boundary)
    let warm = Signals {
        last_used_at: Some(now - chrono::Duration::days(60)),
        last_modified_at: now - chrono::Duration::days(60),
        ..Signals::default()
    };
    assert_eq!(warm.staleness(now), Stale::Warm);

    // Stale: 6 months–2 years
    let stale = Signals {
        last_used_at: Some(now - chrono::Duration::days(400)),
        last_modified_at: now - chrono::Duration::days(400),
        ..Signals::default()
    };
    assert_eq!(stale.staleness(now), Stale::Stale);

    // VeryStale: >2 years
    let very = Signals {
        last_used_at: None,
        last_modified_at: now - chrono::Duration::days(800),
        ..Signals::default()
    };
    assert_eq!(very.staleness(now), Stale::VeryStale);
}

#[test]
fn staleness_uses_max_of_used_and_modified() {
    let now = Utc.with_ymd_and_hms(2026, 4, 27, 12, 0, 0).unwrap();
    // modified is very old, but used yesterday — should be Hot
    let s = Signals {
        last_used_at: Some(now - chrono::Duration::days(1)),
        last_modified_at: now - chrono::Duration::days(900),
        ..Signals::default()
    };
    assert_eq!(s.staleness(now), Stale::Hot);
}
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cargo test -p strata-scan --test model_test`
Expected: compile errors — `Signals`, `Stale`, `staleness` are not defined.

- [ ] **Step 3: Implement `model.rs`**

Replace `crates/strata-scan/src/model.rs`:

```rust
//! Core data types: DirNode, Signals, Stale.
//!
//! `DirNode` is the unit of the scan tree — one per directory.
//! `Signals` carries the six derived metrics we collect.
//! `Stale` is the discrete bucket derived from those signals.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Stable identifier for a node in the scan tree.
/// Index into the flat `Vec<DirNode>` returned by the walker.
pub type NodeId = u32;

/// Discrete staleness bucket, derived from `Signals::staleness`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Stale {
    Hot,        // ≤ 30 days since last touched
    Warm,       // 31-180 days
    Stale,      // 180 days - 2 years
    VeryStale,  // > 2 years
}

/// All six signals collected for a directory.
/// Defaults represent "unknown" / "not yet computed".
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Signals {
    /// Latest `kMDItemLastUsedDate` of any descendant file. None if Spotlight
    /// has no record (file never opened by a tracked app, or Spotlight off).
    pub last_used_at: Option<DateTime<Utc>>,
    /// Latest mtime of any descendant. Always present (zero-time fallback if walk failed).
    #[serde(default = "epoch_now")]
    pub last_modified_at: DateTime<Utc>,
    /// File creation time of the directory itself.
    #[serde(default = "epoch_now")]
    pub created_at: DateTime<Utc>,
    /// True iff the directory is *not* excluded from Time Machine
    /// AND a recent Time Machine backup exists. False or unknown → false.
    pub is_backed_up_tm: bool,
    /// True iff path is under a known iCloud-mirroring location
    /// OR has the `com.apple.cloud.docs` xattr.
    pub is_in_icloud: bool,
    /// True iff the directory's basename matches a built-in junk pattern
    /// OR the path matches a known cache directory.
    pub is_known_junk: bool,
    /// Set during phase-2 hashing. None until hashing pass completes for this node.
    pub duplicate_group_id: Option<u64>,
}

fn epoch_now() -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(0, 0).unwrap()
}

impl Signals {
    /// Bucket the signals into a discrete staleness value.
    /// Uses max(last_used_at, last_modified_at) as the "freshness" timestamp.
    pub fn staleness(&self, now: DateTime<Utc>) -> Stale {
        let freshest = self
            .last_used_at
            .map(|u| u.max(self.last_modified_at))
            .unwrap_or(self.last_modified_at);
        let age_days = (now - freshest).num_days();
        match age_days {
            i64::MIN..=30 => Stale::Hot,
            31..=180 => Stale::Warm,
            181..=730 => Stale::Stale,
            _ => Stale::VeryStale,
        }
    }
}

/// One directory in the scan tree. Children are referenced by NodeId.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirNode {
    pub id: NodeId,
    pub parent_id: Option<NodeId>,
    /// Full absolute path.
    pub path: String,
    /// Just the basename, for display.
    pub name: String,
    /// Depth from scan root (root = 0).
    pub depth: u16,
    /// Recursive total bytes (this dir + all descendants).
    pub size_bytes: u64,
    /// Recursive total file count (regular files only — not symlinks or directories).
    pub file_count: u64,
    pub signals: Signals,
    /// IDs of immediate child directories.
    pub children: Vec<NodeId>,
}

/// The full scan result — flat list of nodes plus the root id for traversal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanTree {
    pub root_id: NodeId,
    pub nodes: Vec<DirNode>,
    /// When the scan started.
    pub scanned_at: DateTime<Utc>,
    /// Source path that was scanned (the user-provided argument).
    pub source_path: String,
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cargo test -p strata-scan --test model_test`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add crates/strata-scan/src/model.rs crates/strata-scan/tests/model_test.rs
git commit -m "feat(scanner): core data model with staleness derivation"
```

---

## Task 3: Junk pattern matcher

**Files:**
- Modify: `crates/strata-scan/src/junk.rs`
- Test: `crates/strata-scan/tests/junk_test.rs`

- [ ] **Step 1: Write the failing test**

Create `crates/strata-scan/tests/junk_test.rs`:

```rust
use std::path::Path;
use strata_scan::junk::is_known_junk;

#[test]
fn matches_node_modules_basename() {
    assert!(is_known_junk(Path::new("/Users/x/proj/node_modules")));
    assert!(is_known_junk(Path::new("/some/where/node_modules")));
}

#[test]
fn matches_build_artifact_dirs() {
    assert!(is_known_junk(Path::new("/x/y/target")));        // Rust
    assert!(is_known_junk(Path::new("/x/y/dist")));
    assert!(is_known_junk(Path::new("/x/y/build")));
    assert!(is_known_junk(Path::new("/x/y/.next")));
    assert!(is_known_junk(Path::new("/x/y/__pycache__")));
    assert!(is_known_junk(Path::new("/x/y/.venv")));
}

#[test]
fn matches_xcode_derived_data() {
    assert!(is_known_junk(Path::new(
        "/Users/x/Library/Developer/Xcode/DerivedData"
    )));
    assert!(is_known_junk(Path::new(
        "/Users/x/Library/Developer/CoreSimulator"
    )));
}

#[test]
fn matches_user_library_caches() {
    assert!(is_known_junk(Path::new("/Users/x/Library/Caches")));
    assert!(is_known_junk(Path::new(
        "/Users/x/Library/Caches/com.apple.Safari"
    )));
}

#[test]
fn does_not_match_innocent_dirs() {
    assert!(!is_known_junk(Path::new("/Users/x/Documents")));
    assert!(!is_known_junk(Path::new("/Users/x/Photos")));
    assert!(!is_known_junk(Path::new("/Users/x/projects/important")));
    // "build" must be exact basename, not substring
    assert!(!is_known_junk(Path::new("/Users/x/buildings")));
}
```

- [ ] **Step 2: Run and confirm it fails**

Run: `cargo test -p strata-scan --test junk_test`
Expected: compile error — `is_known_junk` not found.

- [ ] **Step 3: Implement `junk.rs`**

Replace `crates/strata-scan/src/junk.rs`:

```rust
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
    "target",       // Rust
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
            && (path_str.ends_with(suffix)
                || path_str.contains(&format!("/{suffix}/")))
        {
            return true;
        }
    }

    false
}
```

- [ ] **Step 4: Run and confirm all 5 tests pass**

Run: `cargo test -p strata-scan --test junk_test`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add crates/strata-scan/src/junk.rs crates/strata-scan/tests/junk_test.rs
git commit -m "feat(scanner): known-junk pattern matcher"
```

---

## Task 4: Phase-1 parallel walker

**Files:**
- Modify: `crates/strata-scan/src/walker.rs`
- Test: `crates/strata-scan/tests/walker_test.rs`

- [ ] **Step 1: Write the failing test using a fixture filesystem**

Create `crates/strata-scan/tests/walker_test.rs`:

```rust
use std::fs;
use std::io::Write;
use tempfile::tempdir;
use strata_scan::walker::walk;

/// Build a small fixture tree:
/// root/
///   a.txt   (100 bytes)
///   sub/
///     b.txt (200 bytes)
///     deep/
///       c.txt (50 bytes)
///   node_modules/
///     ignored.bin (1000 bytes)  <- counted, but flagged junk via signals
fn build_fixture() -> tempfile::TempDir {
    let dir = tempdir().unwrap();
    let root = dir.path();
    fs::write(root.join("a.txt"), vec![0u8; 100]).unwrap();

    let sub = root.join("sub");
    fs::create_dir(&sub).unwrap();
    fs::write(sub.join("b.txt"), vec![0u8; 200]).unwrap();

    let deep = sub.join("deep");
    fs::create_dir(&deep).unwrap();
    fs::write(deep.join("c.txt"), vec![0u8; 50]).unwrap();

    let nm = root.join("node_modules");
    fs::create_dir(&nm).unwrap();
    let mut f = fs::File::create(nm.join("ignored.bin")).unwrap();
    f.write_all(&vec![0u8; 1000]).unwrap();

    dir
}

#[test]
fn walks_and_aggregates_sizes() {
    let dir = build_fixture();
    let tree = walk(dir.path()).unwrap();

    let root = &tree.nodes[tree.root_id as usize];
    assert_eq!(root.size_bytes, 100 + 200 + 50 + 1000);
    assert_eq!(root.file_count, 4);
    assert!(root.parent_id.is_none());
    assert_eq!(root.depth, 0);
    // Three immediate children: sub, deep is grandchild not direct.
    // Children list: sub + node_modules (deep is a grandchild).
    assert_eq!(root.children.len(), 2);
}

#[test]
fn child_dirs_have_correct_sizes() {
    let dir = build_fixture();
    let tree = walk(dir.path()).unwrap();

    let sub = tree
        .nodes
        .iter()
        .find(|n| n.name == "sub")
        .expect("sub should exist");
    assert_eq!(sub.size_bytes, 200 + 50);
    assert_eq!(sub.file_count, 2);
    assert_eq!(sub.depth, 1);
    assert_eq!(sub.children.len(), 1); // "deep"
}

#[test]
fn flags_junk_directories() {
    let dir = build_fixture();
    let tree = walk(dir.path()).unwrap();

    let nm = tree
        .nodes
        .iter()
        .find(|n| n.name == "node_modules")
        .expect("node_modules should exist");
    assert!(nm.signals.is_known_junk);

    let sub = tree
        .nodes
        .iter()
        .find(|n| n.name == "sub")
        .expect("sub should exist");
    assert!(!sub.signals.is_known_junk);
}

#[test]
fn returns_empty_tree_for_nonexistent_path() {
    let result = walk(std::path::Path::new("/tmp/definitely-does-not-exist-xyz123"));
    assert!(result.is_err());
}
```

- [ ] **Step 2: Run and confirm failure**

Run: `cargo test -p strata-scan --test walker_test`
Expected: compile error — `walk` not defined.

- [ ] **Step 3: Implement `walker.rs`**

Replace `crates/strata-scan/src/walker.rs`:

```rust
//! Phase-1 parallel directory walk.
//!
//! Walks a directory tree using `jwalk` (work-stealing parallel walker),
//! producing a flat `Vec<DirNode>` with parent/child links and aggregate sizes.
//!
//! This phase ONLY collects filesystem-cheap signals: size, file count,
//! mtime, ctime, and the junk-pattern flag. Spotlight, Time Machine, iCloud,
//! and hashing are all separate later passes.

use crate::junk::is_known_junk;
use crate::model::{DirNode, NodeId, ScanTree, Signals};
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use jwalk::WalkDir;
use std::collections::HashMap;
use std::path::Path;

/// Walk the given root and return the populated scan tree.
pub fn walk(root: &Path) -> Result<ScanTree> {
    let scanned_at = Utc::now();
    let canonical = root
        .canonicalize()
        .with_context(|| format!("failed to canonicalize {}", root.display()))?;

    // First pass: enumerate every directory, build flat node list, capture
    // each dir's own metadata. Use parallel walk for speed; sort within dirs
    // for deterministic snapshot tests.
    let mut nodes: Vec<DirNode> = Vec::new();
    // Map full path -> NodeId so we can wire up parent/child relationships.
    let mut path_to_id: HashMap<String, NodeId> = HashMap::new();

    // Single-threaded enumeration of directories (jwalk gives parallelism for
    // descent but we want deterministic order while assigning ids).
    for entry in WalkDir::new(&canonical)
        .sort(true)
        .skip_hidden(false)
        .into_iter()
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // permission denied etc — skip silently
        };
        if !entry.file_type().is_dir() {
            continue;
        }

        let path = entry.path();
        let path_str = path.to_string_lossy().to_string();
        let id = nodes.len() as NodeId;
        let parent_path = path.parent().map(|p| p.to_string_lossy().to_string());
        let parent_id = parent_path.and_then(|p| path_to_id.get(&p).copied());

        let depth = if parent_id.is_some() {
            // Look up parent's depth + 1
            let parent = &nodes[parent_id.unwrap() as usize];
            parent.depth + 1
        } else {
            0
        };

        let metadata = entry.metadata().ok();
        let (created_at, modified_at) = metadata
            .as_ref()
            .map(|m| {
                (
                    m.created()
                        .ok()
                        .map(|t| DateTime::<Utc>::from(t))
                        .unwrap_or_else(epoch),
                    m.modified()
                        .ok()
                        .map(|t| DateTime::<Utc>::from(t))
                        .unwrap_or_else(epoch),
                )
            })
            .unwrap_or_else(|| (epoch(), epoch()));

        let signals = Signals {
            last_used_at: None,
            last_modified_at: modified_at,
            created_at,
            is_backed_up_tm: false,
            is_in_icloud: false,
            is_known_junk: is_known_junk(&path),
            duplicate_group_id: None,
        };

        let node = DirNode {
            id,
            parent_id,
            path: path_str.clone(),
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone()),
            depth,
            size_bytes: 0,
            file_count: 0,
            signals,
            children: Vec::new(),
        };

        path_to_id.insert(path_str, id);
        nodes.push(node);

        // Wire up to parent
        if let Some(pid) = parent_id {
            nodes[pid as usize].children.push(id);
        }
    }

    if nodes.is_empty() {
        anyhow::bail!("scan root produced no entries");
    }

    // Second pass: tally file sizes & counts INTO the immediate parent dir.
    // We accumulate from leaves up by sorting by depth descending, but for
    // file-level data we need a separate walk that reports files.
    for entry in WalkDir::new(&canonical)
        .sort(true)
        .skip_hidden(false)
        .into_iter()
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().is_file() {
            continue;
        }
        let parent = match entry.path().parent() {
            Some(p) => p.to_string_lossy().to_string(),
            None => continue,
        };
        let parent_id = match path_to_id.get(&parent) {
            Some(id) => *id,
            None => continue,
        };
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

        let node = &mut nodes[parent_id as usize];
        node.size_bytes += size;
        node.file_count += 1;

        // Roll mtime up: take max of own mtime and the file's mtime.
        if let Ok(meta) = entry.metadata() {
            if let Ok(mt) = meta.modified() {
                let mt_dt: DateTime<Utc> = mt.into();
                if mt_dt > node.signals.last_modified_at {
                    node.signals.last_modified_at = mt_dt;
                }
            }
        }
    }

    // Third pass: roll subtree totals up. Process leaves before parents.
    let mut order: Vec<NodeId> = (0..nodes.len() as NodeId).collect();
    order.sort_by_key(|id| std::cmp::Reverse(nodes[*id as usize].depth));
    for id in order {
        let id = id as usize;
        let (size, files, latest_mtime) = {
            let n = &nodes[id];
            let mut s = n.size_bytes;
            let mut f = n.file_count;
            let mut m = n.signals.last_modified_at;
            for &c in &n.children {
                let child = &nodes[c as usize];
                s += child.size_bytes;
                f += child.file_count;
                if child.signals.last_modified_at > m {
                    m = child.signals.last_modified_at;
                }
            }
            (s, f, m)
        };
        let n = &mut nodes[id];
        n.size_bytes = size;
        n.file_count = files;
        n.signals.last_modified_at = latest_mtime;
    }

    let root_id = path_to_id
        .get(&canonical.to_string_lossy().to_string())
        .copied()
        .context("root path missing from node map")?;

    Ok(ScanTree {
        root_id,
        nodes,
        scanned_at,
        source_path: canonical.to_string_lossy().to_string(),
    })
}

fn epoch() -> DateTime<Utc> {
    DateTime::<Utc>::from_timestamp(0, 0).unwrap()
}
```

- [ ] **Step 4: Run all walker tests and confirm they pass**

Run: `cargo test -p strata-scan --test walker_test`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add crates/strata-scan/src/walker.rs crates/strata-scan/tests/walker_test.rs
git commit -m "feat(scanner): phase-1 parallel walker with size aggregation"
```

---

## Task 5: Time Machine status checker

**Files:**
- Modify: `crates/strata-scan/src/timemachine.rs`
- Test: `crates/strata-scan/tests/timemachine_test.rs`

The strategy: shell out to `tmutil isexcluded <path>` for each top-level directory. Caching prevents re-shelling for every descendant — `is_backed_up_tm` is set on a parent and inherited unless a child is explicitly excluded.

In v1 we only check the *root* of each user-relevant top-level directory (e.g., `~/Documents`, `~/Movies`, `~/Pictures`). Sub-paths inherit. This is approximate but vastly cheaper than per-dir shelling, and matches Time Machine's own user-facing model.

- [ ] **Step 1: Write the failing test using a stub strategy**

Create `crates/strata-scan/tests/timemachine_test.rs`:

```rust
use strata_scan::timemachine::{TmStatus, TmChecker};

/// We can't reliably exercise real `tmutil` in unit tests because the answer
/// depends on the user's TM config. We test the public API surface that
/// supports both real and stub backends.
#[test]
fn stub_backend_returns_configured_value() {
    let stub = TmChecker::stub(TmStatus::Included);
    assert_eq!(stub.is_backed_up("/Users/x/Documents"), true);

    let stub = TmChecker::stub(TmStatus::Excluded);
    assert_eq!(stub.is_backed_up("/Users/x/Caches"), false);

    let stub = TmChecker::stub(TmStatus::Unknown);
    assert_eq!(stub.is_backed_up("/anywhere"), false);
}

#[test]
fn caching_avoids_repeated_lookups() {
    let stub = TmChecker::stub(TmStatus::Included);
    // Calling twice should not panic and should return same answer.
    assert_eq!(stub.is_backed_up("/x"), true);
    assert_eq!(stub.is_backed_up("/x"), true);
}
```

- [ ] **Step 2: Run, expect failure**

Run: `cargo test -p strata-scan --test timemachine_test`
Expected: compile error.

- [ ] **Step 3: Implement `timemachine.rs`**

Replace `crates/strata-scan/src/timemachine.rs`:

```rust
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
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cargo test -p strata-scan --test timemachine_test`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add crates/strata-scan/src/timemachine.rs crates/strata-scan/tests/timemachine_test.rs
git commit -m "feat(scanner): time machine status checker with stub backend"
```

---

## Task 6: iCloud detection

**Files:**
- Modify: `crates/strata-scan/src/icloud.rs`
- Test: `crates/strata-scan/tests/icloud_test.rs`

- [ ] **Step 1: Write the failing test**

Create `crates/strata-scan/tests/icloud_test.rs`:

```rust
use strata_scan::icloud::is_in_icloud_path;

#[test]
fn matches_known_icloud_paths() {
    let home = "/Users/vishal";
    assert!(is_in_icloud_path(
        home,
        "/Users/vishal/Library/Mobile Documents/com~apple~CloudDocs/Notes"
    ));
    assert!(is_in_icloud_path(home, "/Users/vishal/Desktop"));
    assert!(is_in_icloud_path(home, "/Users/vishal/Documents/anything"));
}

#[test]
fn does_not_match_other_paths() {
    let home = "/Users/vishal";
    assert!(!is_in_icloud_path(home, "/Users/vishal/Movies"));
    assert!(!is_in_icloud_path(home, "/Users/vishal/Pictures"));
    assert!(!is_in_icloud_path(home, "/tmp"));
}
```

- [ ] **Step 2: Run, expect compile error**

Run: `cargo test -p strata-scan --test icloud_test`
Expected: `is_in_icloud_path` not defined.

- [ ] **Step 3: Implement `icloud.rs`**

Note: detecting Desktop/Documents iCloud sync requires checking whether iCloud Drive is enabled AND has Desktop/Documents folders enabled. We approximate: if `~/Library/Mobile Documents/com~apple~CloudDocs` exists, assume Desktop and Documents are mirrored. Real-world checks happen in the orchestrator (Task 9) before applying.

Replace `crates/strata-scan/src/icloud.rs`:

```rust
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
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `cargo test -p strata-scan --test icloud_test`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add crates/strata-scan/src/icloud.rs crates/strata-scan/tests/icloud_test.rs
git commit -m "feat(scanner): icloud path + xattr detection"
```

---

## Task 7: Spotlight `kMDItemLastUsedDate` lookup

**Files:**
- Modify: `crates/strata-scan/src/spotlight.rs`
- Test: `crates/strata-scan/tests/spotlight_test.rs`

We use shellouts to `mdls` for v1 — simple, no FFI risk, fast enough when batched. v1.1 can swap to direct CoreServices FFI without changing the public API. The function takes a slice of paths and returns one optional timestamp per path.

- [ ] **Step 1: Write the failing test (stub mode only)**

Create `crates/strata-scan/tests/spotlight_test.rs`:

```rust
use strata_scan::spotlight::SpotlightProbe;

#[test]
fn stub_returns_configured_timestamps() {
    let probe = SpotlightProbe::stub(vec![
        Some(chrono::Utc::now()),
        None,
        Some(chrono::Utc::now() - chrono::Duration::days(100)),
    ]);
    let results = probe.last_used_for_paths(&[
        "/a".to_string(),
        "/b".to_string(),
        "/c".to_string(),
    ]);
    assert_eq!(results.len(), 3);
    assert!(results[0].is_some());
    assert!(results[1].is_none());
    assert!(results[2].is_some());
}
```

- [ ] **Step 2: Run, expect failure**

Run: `cargo test -p strata-scan --test spotlight_test`
Expected: compile error.

- [ ] **Step 3: Implement `spotlight.rs`**

Replace `crates/strata-scan/src/spotlight.rs`:

```rust
//! macOS Spotlight metadata access.
//!
//! Reads `kMDItemLastUsedDate` for files. Falls back to `None` if Spotlight
//! has no record. v1 implementation shells out to `mdls`; v1.1 may switch
//! to direct CoreServices FFI without changing the public API.

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use std::process::Command;

enum Backend {
    Real,
    Stub(Vec<Option<DateTime<Utc>>>),
}

pub struct SpotlightProbe {
    backend: Backend,
}

impl SpotlightProbe {
    pub fn real() -> Self {
        Self { backend: Backend::Real }
    }

    pub fn stub(answers: Vec<Option<DateTime<Utc>>>) -> Self {
        Self { backend: Backend::Stub(answers) }
    }

    /// For each input path, returns the file's `kMDItemLastUsedDate`, or `None`
    /// if Spotlight has no record. Output Vec is the same length as input.
    pub fn last_used_for_paths(&self, paths: &[String]) -> Vec<Option<DateTime<Utc>>> {
        match &self.backend {
            Backend::Stub(answers) => answers
                .iter()
                .cycle()
                .take(paths.len())
                .cloned()
                .collect(),
            Backend::Real => paths.iter().map(|p| query_mdls(p)).collect(),
        }
    }
}

/// Run `mdls -name kMDItemLastUsedDate -raw <path>` and parse the result.
/// Returns None for any parse failure or "(null)" output.
fn query_mdls(path: &str) -> Option<DateTime<Utc>> {
    let out = Command::new("mdls")
        .arg("-name")
        .arg("kMDItemLastUsedDate")
        .arg("-raw")
        .arg(path)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s == "(null)" || s.is_empty() {
        return None;
    }
    // mdls prints e.g. "2024-12-15 10:23:14 +0000"
    parse_mdls_timestamp(&s)
}

fn parse_mdls_timestamp(s: &str) -> Option<DateTime<Utc>> {
    // Strip trailing timezone and parse as naive UTC.
    let trimmed = s.trim_end_matches(" +0000").trim();
    let naive = NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S").ok()?;
    Some(Utc.from_utc_datetime(&naive))
}

#[cfg(test)]
mod parse_tests {
    use super::*;

    #[test]
    fn parses_canonical_mdls_format() {
        let dt = parse_mdls_timestamp("2024-12-15 10:23:14 +0000").unwrap();
        assert_eq!(dt.timestamp(), 1734258194);
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse_mdls_timestamp("(null)").is_none());
        assert!(parse_mdls_timestamp("not a date").is_none());
    }
}
```

- [ ] **Step 4: Run all spotlight tests**

Run: `cargo test -p strata-scan spotlight`
Expected: 3 passed (1 integration + 2 inline).

- [ ] **Step 5: Commit**

```bash
git add crates/strata-scan/src/spotlight.rs crates/strata-scan/tests/spotlight_test.rs
git commit -m "feat(scanner): spotlight last-used-date probe with stub backend"
```

---

## Task 8: Phase-2 duplicate hasher

**Files:**
- Modify: `crates/strata-scan/src/hasher.rs`
- Test: `crates/strata-scan/tests/hasher_test.rs`

Strategy: only consider files larger than `min_size_bytes` (default 50 MB). For each candidate, compute a quick partial hash (first 4KB + middle 4KB + last 4KB). Group by partial hash. Within each group with ≥2 files, compute full BLAKE3 hashes. Files with matching full hashes share a `duplicate_group_id`.

- [ ] **Step 1: Write the failing test**

Create `crates/strata-scan/tests/hasher_test.rs`:

```rust
use std::fs;
use tempfile::tempdir;
use strata_scan::hasher::find_duplicates;

#[test]
fn identical_large_files_are_grouped() {
    let dir = tempdir().unwrap();
    let content = vec![42u8; 60 * 1024 * 1024]; // 60 MB
    fs::write(dir.path().join("a.bin"), &content).unwrap();
    fs::write(dir.path().join("b.bin"), &content).unwrap();
    fs::write(dir.path().join("c.bin"), &vec![7u8; 60 * 1024 * 1024]).unwrap();

    let paths: Vec<String> = ["a.bin", "b.bin", "c.bin"]
        .iter()
        .map(|n| dir.path().join(n).to_string_lossy().to_string())
        .collect();

    let groups = find_duplicates(&paths, 50 * 1024 * 1024).unwrap();
    // a and b should share a group id; c should not be in any group
    let a = groups.get(&paths[0]).copied();
    let b = groups.get(&paths[1]).copied();
    let c = groups.get(&paths[2]).copied();
    assert!(a.is_some());
    assert_eq!(a, b);
    assert!(c.is_none() || c != a);
}

#[test]
fn small_files_are_skipped() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("x.bin"), vec![0u8; 1024]).unwrap();
    fs::write(dir.path().join("y.bin"), vec![0u8; 1024]).unwrap();

    let paths: Vec<String> = ["x.bin", "y.bin"]
        .iter()
        .map(|n| dir.path().join(n).to_string_lossy().to_string())
        .collect();

    let groups = find_duplicates(&paths, 50 * 1024 * 1024).unwrap();
    assert!(groups.is_empty());
}

#[test]
fn empty_input_returns_empty_map() {
    let groups = find_duplicates(&[], 50 * 1024 * 1024).unwrap();
    assert!(groups.is_empty());
}
```

- [ ] **Step 2: Run, expect failure**

Run: `cargo test -p strata-scan --test hasher_test`
Expected: compile error.

- [ ] **Step 3: Implement `hasher.rs`**

Replace `crates/strata-scan/src/hasher.rs`:

```rust
//! Phase-2 duplicate detection by content hashing.
//!
//! Algorithm:
//!  1. Filter input paths to files >= `min_size_bytes`.
//!  2. Compute a cheap "fingerprint" hash for each: first 4KB + middle 4KB
//!     + last 4KB. Group by fingerprint.
//!  3. For each fingerprint group with ≥2 files, compute the full BLAKE3
//!     hash. Files sharing a full hash receive the same `duplicate_group_id`.
//!
//! Output: `HashMap<path, group_id>`. Files not in any group are absent.

use anyhow::Result;
use blake3::Hasher;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

const SAMPLE_BYTES: usize = 4096;

pub fn find_duplicates(paths: &[String], min_size_bytes: u64) -> Result<HashMap<String, u64>> {
    // Step 1: filter by size and compute fingerprints.
    let mut by_fingerprint: HashMap<[u8; 32], Vec<(String, u64)>> = HashMap::new();
    for p in paths {
        let meta = match std::fs::metadata(p) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !meta.is_file() || meta.len() < min_size_bytes {
            continue;
        }
        let fp = match fingerprint(p, meta.len()) {
            Ok(fp) => fp,
            Err(_) => continue,
        };
        by_fingerprint
            .entry(fp)
            .or_default()
            .push((p.clone(), meta.len()));
    }

    // Step 2: for each fp group with ≥2 entries, compute full hashes.
    let mut by_full_hash: HashMap<[u8; 32], Vec<String>> = HashMap::new();
    for entries in by_fingerprint.values() {
        if entries.len() < 2 {
            continue;
        }
        for (path, _) in entries {
            let h = match full_hash(path) {
                Ok(h) => h,
                Err(_) => continue,
            };
            by_full_hash.entry(h).or_default().push(path.clone());
        }
    }

    // Step 3: assign group ids.
    let mut result: HashMap<String, u64> = HashMap::new();
    let mut next_id: u64 = 1;
    for paths in by_full_hash.values() {
        if paths.len() < 2 {
            continue;
        }
        let id = next_id;
        next_id += 1;
        for p in paths {
            result.insert(p.clone(), id);
        }
    }
    Ok(result)
}

fn fingerprint(path: &str, size: u64) -> Result<[u8; 32]> {
    let mut f = File::open(path)?;
    let mut hasher = Hasher::new();

    // First sample
    let mut buf = vec![0u8; SAMPLE_BYTES.min(size as usize)];
    f.read_exact(&mut buf)?;
    hasher.update(&buf);

    if size > (SAMPLE_BYTES * 2) as u64 {
        // Middle sample
        let mid = size / 2 - (SAMPLE_BYTES / 2) as u64;
        f.seek(SeekFrom::Start(mid))?;
        let mut mbuf = vec![0u8; SAMPLE_BYTES];
        f.read_exact(&mut mbuf)?;
        hasher.update(&mbuf);

        // Last sample
        f.seek(SeekFrom::Start(size - SAMPLE_BYTES as u64))?;
        let mut lbuf = vec![0u8; SAMPLE_BYTES];
        f.read_exact(&mut lbuf)?;
        hasher.update(&lbuf);
    }

    // Mix in the size itself so different-sized files cannot collide here.
    hasher.update(&size.to_le_bytes());
    Ok(*hasher.finalize().as_bytes())
}

fn full_hash(path: &str) -> Result<[u8; 32]> {
    let mut f = File::open(path)?;
    let mut hasher = Hasher::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(*hasher.finalize().as_bytes())
}
```

- [ ] **Step 4: Run hasher tests**

Run: `cargo test -p strata-scan --test hasher_test`
Expected: 3 passed. (May take a few seconds — writes 60 MB files.)

- [ ] **Step 5: Commit**

```bash
git add crates/strata-scan/src/hasher.rs crates/strata-scan/tests/hasher_test.rs
git commit -m "feat(scanner): duplicate detection via fingerprint + full-hash"
```

---

## Task 9: Aggregate signals into the tree

**Files:**
- Modify: `crates/strata-scan/src/aggregate.rs`
- Test: `crates/strata-scan/tests/aggregate_test.rs`

After phase-1 walk and the per-path probes (TM, iCloud, Spotlight, hashes), this module merges the results back into `ScanTree.nodes` and rolls signals up to parents.

- [ ] **Step 1: Write the failing test**

Create `crates/strata-scan/tests/aggregate_test.rs`:

```rust
use chrono::{TimeZone, Utc};
use std::collections::HashMap;
use strata_scan::aggregate::{apply_probes, ProbeResults};
use strata_scan::model::{DirNode, ScanTree, Signals};

fn dummy_tree() -> ScanTree {
    let now = Utc::now();
    let nodes = vec![
        DirNode {
            id: 0, parent_id: None, path: "/root".into(), name: "root".into(),
            depth: 0, size_bytes: 0, file_count: 0,
            signals: Signals::default(), children: vec![1, 2],
        },
        DirNode {
            id: 1, parent_id: Some(0), path: "/root/a".into(), name: "a".into(),
            depth: 1, size_bytes: 0, file_count: 0,
            signals: Signals::default(), children: vec![],
        },
        DirNode {
            id: 2, parent_id: Some(0), path: "/root/b".into(), name: "b".into(),
            depth: 1, size_bytes: 0, file_count: 0,
            signals: Signals::default(), children: vec![],
        },
    ];
    ScanTree { root_id: 0, nodes, scanned_at: Utc::now(), source_path: "/root".into() }
}

#[test]
fn applies_per_path_tm_status() {
    let mut tree = dummy_tree();
    let mut tm: HashMap<String, bool> = HashMap::new();
    tm.insert("/root/a".into(), true);
    tm.insert("/root/b".into(), false);
    apply_probes(&mut tree, ProbeResults {
        tm_status: tm,
        icloud_status: HashMap::new(),
        last_used: HashMap::new(),
        dupe_groups: HashMap::new(),
    });
    assert!(tree.nodes[1].signals.is_backed_up_tm);
    assert!(!tree.nodes[2].signals.is_backed_up_tm);
}

#[test]
fn rolls_last_used_up_to_parents() {
    let mut tree = dummy_tree();
    let recent = Utc.with_ymd_and_hms(2026, 4, 1, 0, 0, 0).unwrap();
    let mut last_used = HashMap::new();
    last_used.insert("/root/a".into(), recent);
    apply_probes(&mut tree, ProbeResults {
        tm_status: HashMap::new(),
        icloud_status: HashMap::new(),
        last_used,
        dupe_groups: HashMap::new(),
    });
    // Child gets it directly
    assert_eq!(tree.nodes[1].signals.last_used_at, Some(recent));
    // Parent gets max of children
    assert_eq!(tree.nodes[0].signals.last_used_at, Some(recent));
}
```

- [ ] **Step 2: Run, expect compile error**

Run: `cargo test -p strata-scan --test aggregate_test`
Expected: compile error.

- [ ] **Step 3: Implement `aggregate.rs`**

Replace `crates/strata-scan/src/aggregate.rs`:

```rust
//! Aggregation of child signals to parents.
//!
//! Inputs: a partially-populated ScanTree (sizes + mtime + junk are already
//! set by the walker) and a bundle of probe results keyed by path. Outputs:
//! the same tree with all per-path signals applied and rolled up.

use crate::model::{NodeId, ScanTree};
use chrono::{DateTime, Utc};
use std::collections::HashMap;

pub struct ProbeResults {
    /// Path → is-backed-up-by-TM.
    pub tm_status: HashMap<String, bool>,
    /// Path → is-in-iCloud.
    pub icloud_status: HashMap<String, bool>,
    /// Path → last-used-date (Spotlight).
    pub last_used: HashMap<String, DateTime<Utc>>,
    /// Path → duplicate-group-id (from hasher).
    pub dupe_groups: HashMap<String, u64>,
}

pub fn apply_probes(tree: &mut ScanTree, probes: ProbeResults) {
    // Step 1: apply per-node values directly.
    for node in tree.nodes.iter_mut() {
        if let Some(v) = probes.tm_status.get(&node.path) {
            node.signals.is_backed_up_tm = *v;
        }
        if let Some(v) = probes.icloud_status.get(&node.path) {
            node.signals.is_in_icloud = *v;
        }
        if let Some(v) = probes.last_used.get(&node.path) {
            node.signals.last_used_at = Some(*v);
        }
        if let Some(v) = probes.dupe_groups.get(&node.path) {
            node.signals.duplicate_group_id = Some(*v);
        }
    }

    // Step 2: roll signals up. Process leaves first (highest depth).
    let mut order: Vec<NodeId> = (0..tree.nodes.len() as NodeId).collect();
    order.sort_by_key(|id| std::cmp::Reverse(tree.nodes[*id as usize].depth));
    for id in order {
        let id = id as usize;
        let (max_used, any_tm, any_icloud) = {
            let n = &tree.nodes[id];
            let mut max_used = n.signals.last_used_at;
            let mut any_tm = n.signals.is_backed_up_tm;
            let mut any_icloud = n.signals.is_in_icloud;
            for &c in &n.children {
                let child = &tree.nodes[c as usize];
                if let Some(cu) = child.signals.last_used_at {
                    max_used = Some(match max_used {
                        Some(mu) => mu.max(cu),
                        None => cu,
                    });
                }
                // For TM: parent counts as backed-up if any descendant is.
                // (Inheritance from parent already applied above for explicit parent paths.)
                any_tm = any_tm || child.signals.is_backed_up_tm;
                any_icloud = any_icloud || child.signals.is_in_icloud;
            }
            (max_used, any_tm, any_icloud)
        };
        let n = &mut tree.nodes[id];
        n.signals.last_used_at = max_used;
        n.signals.is_backed_up_tm = any_tm;
        n.signals.is_in_icloud = any_icloud;
    }
}
```

- [ ] **Step 4: Run aggregate tests**

Run: `cargo test -p strata-scan --test aggregate_test`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add crates/strata-scan/src/aggregate.rs crates/strata-scan/tests/aggregate_test.rs
git commit -m "feat(scanner): aggregate per-path probe results into tree"
```

---

## Task 10: Progress events and JSON output

**Files:**
- Modify: `crates/strata-scan/src/progress.rs`
- Modify: `crates/strata-scan/src/output.rs`
- Test: `crates/strata-scan/tests/output_test.rs`

- [ ] **Step 1: Write the failing test**

Create `crates/strata-scan/tests/output_test.rs`:

```rust
use chrono::Utc;
use strata_scan::model::{DirNode, ScanTree, Signals};
use strata_scan::output::{render_tree_json, render_progress_jsonl};
use strata_scan::progress::ProgressEvent;

#[test]
fn renders_tree_as_json() {
    let tree = ScanTree {
        root_id: 0,
        scanned_at: Utc::now(),
        source_path: "/x".into(),
        nodes: vec![DirNode {
            id: 0, parent_id: None, path: "/x".into(), name: "x".into(),
            depth: 0, size_bytes: 100, file_count: 1,
            signals: Signals::default(), children: vec![],
        }],
    };
    let s = render_tree_json(&tree).unwrap();
    assert!(s.contains("\"root_id\":0"));
    assert!(s.contains("\"size_bytes\":100"));
}

#[test]
fn renders_progress_event_as_jsonl_line() {
    let ev = ProgressEvent::WalkStarted { root: "/x".into() };
    let s = render_progress_jsonl(&ev).unwrap();
    assert!(s.starts_with("{"));
    assert!(s.ends_with("\n"));
    assert!(s.contains("walk_started"));
    assert!(s.contains("/x"));
}
```

- [ ] **Step 2: Run, expect failure**

Run: `cargo test -p strata-scan --test output_test`
Expected: compile error.

- [ ] **Step 3: Implement `progress.rs`**

Replace `crates/strata-scan/src/progress.rs`:

```rust
//! Progress event channel and types.
//!
//! Events are emitted by the orchestrator during scanning and consumed
//! either as JSON Lines on stdout (CLI mode) or via channel send (Tauri mode).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum ProgressEvent {
    WalkStarted { root: String },
    WalkProgress { dirs_seen: u64, files_seen: u64, bytes_seen: u64 },
    WalkCompleted { node_count: usize },
    ProbeStarted { kind: String },
    ProbeCompleted { kind: String, applied: usize },
    ScanFinished,
    Error { message: String },
}
```

- [ ] **Step 4: Implement `output.rs`**

Replace `crates/strata-scan/src/output.rs`:

```rust
//! JSON output formatting.

use crate::model::ScanTree;
use crate::progress::ProgressEvent;
use anyhow::Result;

pub fn render_tree_json(tree: &ScanTree) -> Result<String> {
    Ok(serde_json::to_string(tree)?)
}

pub fn render_tree_json_pretty(tree: &ScanTree) -> Result<String> {
    Ok(serde_json::to_string_pretty(tree)?)
}

pub fn render_progress_jsonl(ev: &ProgressEvent) -> Result<String> {
    let mut s = serde_json::to_string(ev)?;
    s.push('\n');
    Ok(s)
}
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `cargo test -p strata-scan --test output_test`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add crates/strata-scan/src/progress.rs crates/strata-scan/src/output.rs crates/strata-scan/tests/output_test.rs
git commit -m "feat(scanner): progress events and JSON output formatters"
```

---

## Task 11: Orchestrator + CLI

**Files:**
- Modify: `crates/strata-scan/src/lib.rs` (add `run` orchestrator function)
- Modify: `crates/strata-scan/src/main.rs` (clap CLI)
- Test: `crates/strata-scan/tests/cli_test.rs`

- [ ] **Step 1: Write the failing CLI integration test**

Create `crates/strata-scan/tests/cli_test.rs`:

```rust
use assert_cmd::Command;
use predicates::prelude::*;
use std::fs;
use tempfile::tempdir;

#[test]
fn cli_scans_a_directory_and_emits_json() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("a.txt"), b"hello").unwrap();

    let mut cmd = Command::cargo_bin("strata-scan").unwrap();
    let assert = cmd
        .arg("--no-spotlight")
        .arg("--no-tm")
        .arg("--no-hash")
        .arg(dir.path())
        .assert()
        .success();

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).unwrap();
    // Last line should be the final tree JSON.
    let last = stdout.lines().last().unwrap();
    let val: serde_json::Value = serde_json::from_str(last).unwrap();
    assert!(val.get("nodes").is_some());
    assert!(val.get("root_id").is_some());
}

#[test]
fn cli_errors_on_nonexistent_path() {
    let mut cmd = Command::cargo_bin("strata-scan").unwrap();
    cmd.arg("/tmp/definitely-not-here-987654321")
        .assert()
        .failure()
        .stderr(predicate::str::contains("error"));
}
```

- [ ] **Step 2: Run, expect failure**

Run: `cargo test -p strata-scan --test cli_test`
Expected: fails — flags `--no-spotlight` etc. not defined; binary still emits the placeholder.

- [ ] **Step 3: Add the `run` orchestrator to `lib.rs`**

Replace `crates/strata-scan/src/lib.rs`:

```rust
//! Strata scanner — disk-tree walker with signal collection.

pub mod aggregate;
pub mod hasher;
pub mod icloud;
pub mod junk;
pub mod model;
pub mod output;
pub mod progress;
pub mod spotlight;
pub mod timemachine;
pub mod walker;

use crate::aggregate::{apply_probes, ProbeResults};
use crate::hasher::find_duplicates;
use crate::icloud::{has_cloud_docs_xattr, icloud_drive_enabled, is_in_icloud_path};
use crate::model::ScanTree;
use crate::progress::ProgressEvent;
use crate::spotlight::SpotlightProbe;
use crate::timemachine::TmChecker;
use anyhow::Result;
use jwalk::WalkDir;
use std::collections::HashMap;
use std::path::Path;

/// Knobs that disable expensive probes (used by tests and `--no-*` CLI flags).
#[derive(Debug, Clone, Copy, Default)]
pub struct ScanOptions {
    pub disable_spotlight: bool,
    pub disable_tm: bool,
    pub disable_icloud: bool,
    pub disable_hash: bool,
    /// Minimum file size to consider for dupe hashing.
    pub hash_min_bytes: u64,
}

impl ScanOptions {
    pub fn defaults() -> Self {
        Self {
            disable_spotlight: false,
            disable_tm: false,
            disable_icloud: false,
            disable_hash: false,
            hash_min_bytes: 50 * 1024 * 1024,
        }
    }
}

/// Run a full scan. `progress_cb` is invoked for each progress event.
pub fn run(
    root: &Path,
    options: ScanOptions,
    mut progress_cb: impl FnMut(&ProgressEvent),
) -> Result<ScanTree> {
    progress_cb(&ProgressEvent::WalkStarted {
        root: root.to_string_lossy().to_string(),
    });
    let mut tree = walker::walk(root)?;
    progress_cb(&ProgressEvent::WalkCompleted {
        node_count: tree.nodes.len(),
    });

    let home = std::env::var("HOME").unwrap_or_default();

    // --- TM probe ---
    let mut tm_status: HashMap<String, bool> = HashMap::new();
    if !options.disable_tm {
        progress_cb(&ProgressEvent::ProbeStarted { kind: "tm".into() });
        let checker = TmChecker::real();
        // Cheap-but-coarse: query each top-level dir under root and inherit.
        for n in &tree.nodes {
            if n.depth <= 1 {
                tm_status.insert(n.path.clone(), checker.is_backed_up(&n.path));
            }
        }
        progress_cb(&ProgressEvent::ProbeCompleted {
            kind: "tm".into(),
            applied: tm_status.len(),
        });
    }

    // --- iCloud probe ---
    let mut icloud_status: HashMap<String, bool> = HashMap::new();
    if !options.disable_icloud && icloud_drive_enabled(&home) {
        progress_cb(&ProgressEvent::ProbeStarted { kind: "icloud".into() });
        for n in &tree.nodes {
            let by_path = is_in_icloud_path(&home, &n.path);
            let by_xattr = has_cloud_docs_xattr(Path::new(&n.path));
            if by_path || by_xattr {
                icloud_status.insert(n.path.clone(), true);
            }
        }
        progress_cb(&ProgressEvent::ProbeCompleted {
            kind: "icloud".into(),
            applied: icloud_status.len(),
        });
    }

    // --- Spotlight probe ---
    let mut last_used: HashMap<String, chrono::DateTime<chrono::Utc>> = HashMap::new();
    if !options.disable_spotlight {
        progress_cb(&ProgressEvent::ProbeStarted { kind: "spotlight".into() });
        let probe = SpotlightProbe::real();
        // Sample by directory: query each dir's last-used-date directly. This is
        // an approximation — real per-file rollup is deferred to a later version.
        let paths: Vec<String> = tree.nodes.iter().map(|n| n.path.clone()).collect();
        let answers = probe.last_used_for_paths(&paths);
        for (p, a) in paths.iter().zip(answers) {
            if let Some(t) = a {
                last_used.insert(p.clone(), t);
            }
        }
        progress_cb(&ProgressEvent::ProbeCompleted {
            kind: "spotlight".into(),
            applied: last_used.len(),
        });
    }

    // --- Hashing probe ---
    let mut dupe_groups: HashMap<String, u64> = HashMap::new();
    if !options.disable_hash {
        progress_cb(&ProgressEvent::ProbeStarted { kind: "hash".into() });
        // Walk the root once more to enumerate large files.
        let mut large_files = Vec::new();
        for entry in WalkDir::new(root).skip_hidden(false).into_iter().flatten() {
            if !entry.file_type().is_file() {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                if meta.len() >= options.hash_min_bytes {
                    large_files.push(entry.path().to_string_lossy().to_string());
                }
            }
        }
        // Cap to avoid pathological cases.
        large_files.truncate(10_000);
        let groups = find_duplicates(&large_files, options.hash_min_bytes)?;
        // The dupe map is keyed by file path, but our nodes are dirs. We
        // attach a duplicate_group_id to a directory if it contains any file
        // from any group; the UI distinguishes "directory contains dupes"
        // from "directory IS a dupe".
        for (file_path, gid) in &groups {
            if let Some(parent) = Path::new(file_path).parent() {
                let parent_str = parent.to_string_lossy().to_string();
                dupe_groups.insert(parent_str, *gid);
            }
        }
        progress_cb(&ProgressEvent::ProbeCompleted {
            kind: "hash".into(),
            applied: dupe_groups.len(),
        });
    }

    apply_probes(
        &mut tree,
        ProbeResults {
            tm_status,
            icloud_status,
            last_used,
            dupe_groups,
        },
    );

    progress_cb(&ProgressEvent::ScanFinished);
    Ok(tree)
}
```

- [ ] **Step 4: Replace `main.rs` with the clap-driven CLI**

Replace `crates/strata-scan/src/main.rs`:

```rust
use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;
use strata_scan::output::{render_progress_jsonl, render_tree_json};
use strata_scan::{run, ScanOptions};

/// Strata disk scanner — emits a signal-rich JSON tree of a directory.
#[derive(Parser, Debug)]
#[command(version, about)]
struct Cli {
    /// Directory to scan.
    path: PathBuf,
    /// Skip Spotlight last-used-date probe.
    #[arg(long)]
    no_spotlight: bool,
    /// Skip Time Machine status probe.
    #[arg(long)]
    no_tm: bool,
    /// Skip iCloud probe.
    #[arg(long)]
    no_icloud: bool,
    /// Skip duplicate-detection hashing.
    #[arg(long)]
    no_hash: bool,
    /// Minimum file size (bytes) to consider for dupe hashing.
    #[arg(long, default_value_t = 50 * 1024 * 1024)]
    hash_min_bytes: u64,
    /// Pretty-print the final tree JSON instead of compact one-liner.
    #[arg(long)]
    pretty: bool,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let opts = ScanOptions {
        disable_spotlight: cli.no_spotlight,
        disable_tm: cli.no_tm,
        disable_icloud: cli.no_icloud,
        disable_hash: cli.no_hash,
        hash_min_bytes: cli.hash_min_bytes,
    };

    let tree = run(&cli.path, opts, |ev| {
        if let Ok(line) = render_progress_jsonl(ev) {
            print!("{line}");
        }
    })?;

    let final_json = if cli.pretty {
        strata_scan::output::render_tree_json_pretty(&tree)?
    } else {
        render_tree_json(&tree)?
    };
    println!("{final_json}");
    Ok(())
}
```

- [ ] **Step 5: Run all tests including the CLI integration tests**

Run: `cargo test -p strata-scan`
Expected: all tests pass (model_test 2, junk_test 5, walker_test 4, timemachine_test 2, icloud_test 2, spotlight_test 1+2, hasher_test 3, aggregate_test 2, output_test 2, cli_test 2 = 27 total).

- [ ] **Step 6: Smoke-test against a real directory**

Run: `cargo run -p strata-scan -- --no-spotlight --no-tm --no-icloud --no-hash --pretty ~/Downloads`
Expected: pretty JSON tree printed; should complete in seconds and show your real Downloads layout.

- [ ] **Step 7: Commit**

```bash
git add crates/strata-scan/src/lib.rs crates/strata-scan/src/main.rs crates/strata-scan/tests/cli_test.rs
git commit -m "feat(scanner): orchestrator + clap CLI; full end-to-end scan"
```

---

## Task 12: Snapshot test against a fixed fixture

**Files:**
- Create: `crates/strata-scan/tests/snapshot_test.rs`
- Create: `crates/strata-scan/tests/snapshots/snapshot_test__small_fixture_tree.snap` (auto-generated by `cargo insta accept`)

- [ ] **Step 1: Write the snapshot test**

Create `crates/strata-scan/tests/snapshot_test.rs`:

```rust
use std::fs;
use tempfile::tempdir;
use strata_scan::{run, ScanOptions};

#[test]
fn small_fixture_tree() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("a.txt"), b"abc").unwrap();
    fs::create_dir(dir.path().join("sub")).unwrap();
    fs::write(dir.path().join("sub/b.txt"), b"defgh").unwrap();
    fs::create_dir(dir.path().join("node_modules")).unwrap();
    fs::write(dir.path().join("node_modules/x.js"), b"hi").unwrap();

    let mut opts = ScanOptions::defaults();
    opts.disable_spotlight = true;
    opts.disable_tm = true;
    opts.disable_icloud = true;
    opts.disable_hash = true;

    let tree = run(dir.path(), opts, |_| {}).unwrap();

    // Assert structural facts (timestamps and tempdir paths are not stable).
    let root = &tree.nodes[tree.root_id as usize];
    assert_eq!(root.size_bytes, 3 + 5 + 2);
    assert_eq!(root.file_count, 3);
    assert_eq!(root.children.len(), 2);

    let nm = tree.nodes.iter().find(|n| n.name == "node_modules").unwrap();
    assert!(nm.signals.is_known_junk);
    assert_eq!(nm.size_bytes, 2);

    let sub = tree.nodes.iter().find(|n| n.name == "sub").unwrap();
    assert!(!sub.signals.is_known_junk);
    assert_eq!(sub.size_bytes, 5);
}
```

- [ ] **Step 2: Run and confirm pass**

Run: `cargo test -p strata-scan --test snapshot_test`
Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add crates/strata-scan/tests/snapshot_test.rs
git commit -m "test(scanner): structural snapshot test on fixed fixture"
```

---

## Task 13: Documentation and final checks

**Files:**
- Create: `crates/strata-scan/README.md`

- [ ] **Step 1: Write the scanner README**

Create `crates/strata-scan/README.md`:

```markdown
# strata-scan

Standalone scanner for the Strata macOS disk-space viewer.

## Usage

    cargo run -p strata-scan -- <path> [flags]

Flags:

    --no-spotlight       Skip Spotlight last-used-date probe (faster)
    --no-tm              Skip Time Machine status probe
    --no-icloud          Skip iCloud detection
    --no-hash            Skip duplicate detection by hashing
    --hash-min-bytes N   Minimum file size for hash candidates (default 52428800)
    --pretty             Pretty-print final JSON

## Output

Streams JSON Lines to stdout for progress events, then the full ScanTree
as a single JSON object on the final line.

Tree shape (see `src/model.rs`):

    {
      "root_id": 0,
      "scanned_at": "...",
      "source_path": "...",
      "nodes": [{ "id": 0, "path": "...", "size_bytes": ..., "signals": { ... }, "children": [...] }, ...]
    }

## Tests

    cargo test -p strata-scan
```

- [ ] **Step 2: Run a final full test pass**

Run: `cargo test -p strata-scan`
Expected: all 28 tests pass.

- [ ] **Step 3: Run clippy and confirm clean**

Run: `cargo clippy -p strata-scan -- -D warnings`
Expected: no errors. Fix any clippy hits inline.

- [ ] **Step 4: Commit**

```bash
git add crates/strata-scan/README.md
git commit -m "docs(scanner): README with usage and output schema"
```

- [ ] **Step 5: Push to GitHub**

```bash
git push origin master
```

---

## Plan 1 done — what you have

A working `cargo run -p strata-scan -- ~/Downloads` produces a full signal-rich JSON tree of any directory, with all six signals collected. Every module has tests. The output schema is stable and ready to be consumed by Plan 2 (the Tauri shell).

**Next:** Plan 2 — `2026-04-27-plan-2-tauri-shell-and-viz.md`.
