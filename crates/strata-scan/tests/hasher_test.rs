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
