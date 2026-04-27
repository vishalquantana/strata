//! macOS Spotlight metadata access.
//!
//! Reads `kMDItemLastUsedDate` for files. Falls back to `None` if Spotlight
//! has no record. v1 implementation shells out to `mdls`; v1.1 may switch
//! to direct CoreServices FFI without changing the public API.

use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use std::process::Command;

enum Backend {
    Real,
    Stub(Vec<Option<DateTime<Utc>>>),
}

pub struct SpotlightProbe {
    backend: Backend,
}

impl SpotlightProbe {
    pub fn real() -> Self {
        Self {
            backend: Backend::Real,
        }
    }

    pub fn stub(answers: Vec<Option<DateTime<Utc>>>) -> Self {
        Self {
            backend: Backend::Stub(answers),
        }
    }

    /// For each input path, returns the file's `kMDItemLastUsedDate`, or `None`
    /// if Spotlight has no record. Output Vec is the same length as input.
    pub fn last_used_for_paths(&self, paths: &[String]) -> Vec<Option<DateTime<Utc>>> {
        match &self.backend {
            Backend::Stub(answers) => answers.iter().cycle().take(paths.len()).cloned().collect(),
            Backend::Real => paths.iter().map(|p| query_mdls(p)).collect(),
        }
    }
}

/// Run `mdls -name kMDItemLastUsedDate -raw <path>` and parse the result.
/// Returns None for any parse failure or "(null)" output.
fn query_mdls(path: &str) -> Option<DateTime<Utc>> {
    let out = Command::new("mdls")
        .arg("-name")
        .arg("kMDItemLastUsedDate")
        .arg("-raw")
        .arg(path)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s == "(null)" || s.is_empty() {
        return None;
    }
    // mdls prints e.g. "2024-12-15 10:23:14 +0000"
    parse_mdls_timestamp(&s)
}

fn parse_mdls_timestamp(s: &str) -> Option<DateTime<Utc>> {
    // Strip trailing timezone and parse as naive UTC.
    let trimmed = s.trim_end_matches(" +0000").trim();
    let naive = NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S").ok()?;
    Some(Utc.from_utc_datetime(&naive))
}

#[cfg(test)]
mod parse_tests {
    use super::*;

    #[test]
    fn parses_canonical_mdls_format() {
        let dt = parse_mdls_timestamp("2024-12-15 10:23:14 +0000").unwrap();
        assert_eq!(dt.timestamp(), 1734258194);
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse_mdls_timestamp("(null)").is_none());
        assert!(parse_mdls_timestamp("not a date").is_none());
    }
}
