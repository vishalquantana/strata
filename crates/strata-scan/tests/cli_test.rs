use assert_cmd::Command;
use predicates::prelude::*;
use std::fs;
use tempfile::tempdir;

#[test]
fn cli_scans_a_directory_and_emits_json() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("a.txt"), b"hello").unwrap();

    let mut cmd = Command::cargo_bin("strata-scan").unwrap();
    let assert = cmd
        .arg("--no-spotlight")
        .arg("--no-tm")
        .arg("--no-hash")
        .arg(dir.path())
        .assert()
        .success();

    let stdout = String::from_utf8(assert.get_output().stdout.clone()).unwrap();
    // Last line should be the final tree JSON.
    let last = stdout.lines().last().unwrap();
    let val: serde_json::Value = serde_json::from_str(last).unwrap();
    assert!(val.get("nodes").is_some());
    assert!(val.get("root_id").is_some());
}

#[test]
fn cli_errors_on_nonexistent_path() {
    let mut cmd = Command::cargo_bin("strata-scan").unwrap();
    cmd.arg("/tmp/definitely-not-here-987654321")
        .assert()
        .failure()
        .stderr(predicate::str::contains("error"));
}
