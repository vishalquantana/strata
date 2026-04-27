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
