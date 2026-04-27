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
