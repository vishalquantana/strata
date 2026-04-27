use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use strata_scan::output::{render_progress_jsonl, render_tree_json};
use strata_scan::{run, ScanOptions};

/// Strata disk scanner — emits a signal-rich JSON tree of a directory.
#[derive(Parser, Debug)]
#[command(version, about)]
struct Cli {
    /// Directory to scan.
    path: PathBuf,
    /// Skip Spotlight last-used-date probe.
    #[arg(long)]
    no_spotlight: bool,
    /// Skip Time Machine status probe.
    #[arg(long)]
    no_tm: bool,
    /// Skip iCloud probe.
    #[arg(long)]
    no_icloud: bool,
    /// Skip duplicate-detection hashing.
    #[arg(long)]
    no_hash: bool,
    /// Minimum file size (bytes) to consider for dupe hashing.
    #[arg(long, default_value_t = 50 * 1024 * 1024)]
    hash_min_bytes: u64,
    /// Pretty-print the final tree JSON instead of compact one-liner.
    #[arg(long)]
    pretty: bool,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let opts = ScanOptions {
        disable_spotlight: cli.no_spotlight,
        disable_tm: cli.no_tm,
        disable_icloud: cli.no_icloud,
        disable_hash: cli.no_hash,
        hash_min_bytes: cli.hash_min_bytes,
    };

    let cancel = Arc::new(AtomicBool::new(false));
    let tree = run(&cli.path, opts, cancel, |ev| {
        if let Ok(line) = render_progress_jsonl(ev) {
            print!("{line}");
        }
    })?;

    let final_json = if cli.pretty {
        strata_scan::output::render_tree_json_pretty(&tree)?
    } else {
        render_tree_json(&tree)?
    };
    println!("{final_json}");
    Ok(())
}
