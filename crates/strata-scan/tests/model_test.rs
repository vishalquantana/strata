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
