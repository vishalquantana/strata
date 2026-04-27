//! JSON output formatting.

use crate::model::ScanTree;
use crate::progress::ProgressEvent;
use anyhow::Result;

pub fn render_tree_json(tree: &ScanTree) -> Result<String> {
    Ok(serde_json::to_string(tree)?)
}

pub fn render_tree_json_pretty(tree: &ScanTree) -> Result<String> {
    Ok(serde_json::to_string_pretty(tree)?)
}

pub fn render_progress_jsonl(ev: &ProgressEvent) -> Result<String> {
    let mut s = serde_json::to_string(ev)?;
    s.push('\n');
    Ok(s)
}
