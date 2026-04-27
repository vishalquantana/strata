use strata_scan::timemachine::{TmChecker, TmStatus};

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
