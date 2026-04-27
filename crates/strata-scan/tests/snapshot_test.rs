use std::fs;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use strata_scan::{run, ScanOptions};
use tempfile::tempdir;

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

    let cancel = Arc::new(AtomicBool::new(false));
    let tree = run(dir.path(), opts, cancel, |_| {}).unwrap();

    // Assert structural facts (timestamps and tempdir paths are not stable).
    let root = &tree.nodes[tree.root_id as usize];
    assert_eq!(root.size_bytes, 3 + 5 + 2);
    assert_eq!(root.file_count, 3);
    assert_eq!(root.children.len(), 2);

    let nm = tree
        .nodes
        .iter()
        .find(|n| n.name == "node_modules")
        .unwrap();
    assert!(nm.signals.is_known_junk);
    assert_eq!(nm.size_bytes, 2);

    let sub = tree.nodes.iter().find(|n| n.name == "sub").unwrap();
    assert!(!sub.signals.is_known_junk);
    assert_eq!(sub.size_bytes, 5);
}
