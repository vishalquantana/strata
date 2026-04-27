//! Phase-2 duplicate detection by content hashing.
//!
//! Algorithm:
//!  1. Filter input paths to files >= `min_size_bytes`.
//!  2. Compute a cheap "fingerprint" hash for each: first 4KB + middle 4KB
//!     + last 4KB. Group by fingerprint.
//!  3. For each fingerprint group with >=2 files, compute the full BLAKE3
//!     hash. Files sharing a full hash receive the same `duplicate_group_id`.
//!
//! Output: `HashMap<path, group_id>`. Files not in any group are absent.

use anyhow::Result;
use blake3::Hasher;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

const SAMPLE_BYTES: usize = 4096;

pub fn find_duplicates(paths: &[String], min_size_bytes: u64) -> Result<HashMap<String, u64>> {
    // Step 1: filter by size and compute fingerprints.
    let mut by_fingerprint: HashMap<[u8; 32], Vec<(String, u64)>> = HashMap::new();
    for p in paths {
        let meta = match std::fs::metadata(p) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !meta.is_file() || meta.len() < min_size_bytes {
            continue;
        }
        let fp = match fingerprint(p, meta.len()) {
            Ok(fp) => fp,
            Err(_) => continue,
        };
        by_fingerprint
            .entry(fp)
            .or_default()
            .push((p.clone(), meta.len()));
    }

    // Step 2: for each fp group with >=2 entries, compute full hashes.
    let mut by_full_hash: HashMap<[u8; 32], Vec<String>> = HashMap::new();
    for entries in by_fingerprint.values() {
        if entries.len() < 2 {
            continue;
        }
        for (path, _) in entries {
            let h = match full_hash(path) {
                Ok(h) => h,
                Err(_) => continue,
            };
            by_full_hash.entry(h).or_default().push(path.clone());
        }
    }

    // Step 3: assign group ids.
    let mut result: HashMap<String, u64> = HashMap::new();
    let mut next_id: u64 = 1;
    for paths in by_full_hash.values() {
        if paths.len() < 2 {
            continue;
        }
        let id = next_id;
        next_id += 1;
        for p in paths {
            result.insert(p.clone(), id);
        }
    }
    Ok(result)
}

fn fingerprint(path: &str, size: u64) -> Result<[u8; 32]> {
    let mut f = File::open(path)?;
    let mut hasher = Hasher::new();

    // First sample
    let mut buf = vec![0u8; SAMPLE_BYTES.min(size as usize)];
    f.read_exact(&mut buf)?;
    hasher.update(&buf);

    if size > (SAMPLE_BYTES * 2) as u64 {
        // Middle sample
        let mid = size / 2 - (SAMPLE_BYTES / 2) as u64;
        f.seek(SeekFrom::Start(mid))?;
        let mut mbuf = vec![0u8; SAMPLE_BYTES];
        f.read_exact(&mut mbuf)?;
        hasher.update(&mbuf);

        // Last sample
        f.seek(SeekFrom::Start(size - SAMPLE_BYTES as u64))?;
        let mut lbuf = vec![0u8; SAMPLE_BYTES];
        f.read_exact(&mut lbuf)?;
        hasher.update(&lbuf);
    }

    // Mix in the size itself so different-sized files cannot collide here.
    hasher.update(&size.to_le_bytes());
    Ok(*hasher.finalize().as_bytes())
}

fn full_hash(path: &str) -> Result<[u8; 32]> {
    let mut f = File::open(path)?;
    let mut hasher = Hasher::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(*hasher.finalize().as_bytes())
}
