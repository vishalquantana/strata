# strata-scan

Standalone scanner for the Strata macOS disk-space viewer.

## Usage

    cargo run -p strata-scan -- <path> [flags]

Flags:

    --no-spotlight       Skip Spotlight last-used-date probe (faster)
    --no-tm              Skip Time Machine status probe
    --no-icloud          Skip iCloud detection
    --no-hash            Skip duplicate detection by hashing
    --hash-min-bytes N   Minimum file size for hash candidates (default 52428800)
    --pretty             Pretty-print final JSON

## Output

Streams JSON Lines to stdout for progress events, then the full ScanTree
as a single JSON object on the final line.

Tree shape (see `src/model.rs`):

    {
      "root_id": 0,
      "scanned_at": "...",
      "source_path": "...",
      "nodes": [{ "id": 0, "path": "...", "size_bytes": ..., "signals": { ... }, "children": [...] }, ...]
    }

## Tests

    cargo test -p strata-scan
