use chrono::Utc;
use strata_scan::model::{DirNode, ScanTree, Signals};
use strata_scan::output::{render_progress_jsonl, render_tree_json};
use strata_scan::progress::ProgressEvent;

#[test]
fn renders_tree_as_json() {
    let tree = ScanTree {
        root_id: 0,
        scanned_at: Utc::now(),
        source_path: "/x".into(),
        nodes: vec![DirNode {
            id: 0,
            parent_id: None,
            path: "/x".into(),
            name: "x".into(),
            depth: 0,
            size_bytes: 100,
            file_count: 1,
            signals: Signals::default(),
            children: vec![],
            is_file: false,
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
