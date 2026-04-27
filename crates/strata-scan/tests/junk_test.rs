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
