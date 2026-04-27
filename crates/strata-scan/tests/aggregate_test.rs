use chrono::{TimeZone, Utc};
use std::collections::HashMap;
use strata_scan::aggregate::{apply_probes, ProbeResults};
use strata_scan::model::{DirNode, ScanTree, Signals};

fn dummy_tree() -> ScanTree {
    let nodes = vec![
        DirNode {
            id: 0,
            parent_id: None,
            path: "/root".into(),
            name: "root".into(),
            depth: 0,
            size_bytes: 0,
            file_count: 0,
            signals: Signals::default(),
            children: vec![1, 2],
            is_file: false,
        },
        DirNode {
            id: 1,
            parent_id: Some(0),
            path: "/root/a".into(),
            name: "a".into(),
            depth: 1,
            size_bytes: 0,
            file_count: 0,
            signals: Signals::default(),
            children: vec![],
            is_file: false,
        },
        DirNode {
            id: 2,
            parent_id: Some(0),
            path: "/root/b".into(),
            name: "b".into(),
            depth: 1,
            size_bytes: 0,
            file_count: 0,
            signals: Signals::default(),
            children: vec![],
            is_file: false,
        },
    ];
    ScanTree {
        root_id: 0,
        nodes,
        scanned_at: Utc::now(),
        source_path: "/root".into(),
    }
}

#[test]
fn applies_per_path_tm_status() {
    let mut tree = dummy_tree();
    let mut tm: HashMap<String, bool> = HashMap::new();
    tm.insert("/root/a".into(), true);
    tm.insert("/root/b".into(), false);
    apply_probes(
        &mut tree,
        ProbeResults {
            tm_status: tm,
            icloud_status: HashMap::new(),
            last_used: HashMap::new(),
            dupe_groups: HashMap::new(),
        },
    );
    assert!(tree.nodes[1].signals.is_backed_up_tm);
    assert!(!tree.nodes[2].signals.is_backed_up_tm);
}

#[test]
fn rolls_last_used_up_to_parents() {
    let mut tree = dummy_tree();
    let recent = Utc.with_ymd_and_hms(2026, 4, 1, 0, 0, 0).unwrap();
    let mut last_used = HashMap::new();
    last_used.insert("/root/a".into(), recent);
    apply_probes(
        &mut tree,
        ProbeResults {
            tm_status: HashMap::new(),
            icloud_status: HashMap::new(),
            last_used,
            dupe_groups: HashMap::new(),
        },
    );
    // Child gets it directly
    assert_eq!(tree.nodes[1].signals.last_used_at, Some(recent));
    // Parent gets max of children
    assert_eq!(tree.nodes[0].signals.last_used_at, Some(recent));
}
