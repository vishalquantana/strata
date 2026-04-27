import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ProgressEvent, ScanTree } from "./types";

export async function pickDirectory(): Promise<string | null> {
  const r = await invoke<string | null>("pick_directory");
  return r ?? null;
}

export async function startScan(path: string): Promise<void> {
  await invoke("start_scan", { path });
}

export function onScanProgress(cb: (ev: ProgressEvent) => void): Promise<UnlistenFn> {
  return listen<ProgressEvent>("scan-progress", (e) => cb(e.payload));
}

export function onScanComplete(cb: (tree: ScanTree) => void): Promise<UnlistenFn> {
  return listen<ScanTree>("scan-complete", (e) => cb(e.payload));
}

export function onScanError(cb: (msg: string) => void): Promise<UnlistenFn> {
  return listen<string>("scan-error", (e) => cb(e.payload));
}
