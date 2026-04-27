use std::fs;
use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use strata_scan::walker::walk;
use tempfile::tempdir;

fn no_cancel() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}

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
    let tree = walk(dir.path(), &mut |_| {}, no_cancel()).unwrap();

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
    let tree = walk(dir.path(), &mut |_| {}, no_cancel()).unwrap();

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
    let tree = walk(dir.path(), &mut |_| {}, no_cancel()).unwrap();

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
    let result = walk(
        std::path::Path::new("/tmp/definitely-does-not-exist-xyz123"),
        &mut |_| {},
        no_cancel(),
    );
    assert!(result.is_err());
}
