import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ProgressEvent, ScanTree, Volume } from "./types";

export async function pickDirectory(): Promise<string | null> {
  const r = await invoke<string | null>("pick_directory");
  return r ?? null;
}

export async function listVolumes(): Promise<Volume[]> {
  return await invoke<Volume[]>("list_volumes");
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

export async function revealInFinder(path: string): Promise<void> {
  await invoke("reveal_in_finder", { path });
}

export async function moveToTrash(path: string): Promise<void> {
  await invoke("move_to_trash", { path });
}

export type FdaStatus = "granted" | "denied" | "unknown";

export async function checkFullDiskAccess(): Promise<FdaStatus> {
  return await invoke<FdaStatus>("check_full_disk_access");
}

export async function openFdaSettings(): Promise<void> {
  await invoke("open_fda_settings");
}

export async function homeDir(): Promise<string> {
  return await invoke<string>("home_dir");
}

export async function startWatching(path: string): Promise<void> {
  await invoke("start_watching", { path });
}

export async function stopWatching(): Promise<void> {
  await invoke("stop_watching");
}

export interface FsChange {
  path: string;
  kind: "create" | "modify" | "remove" | "other";
}

export function onFsChange(cb: (c: FsChange) => void): Promise<UnlistenFn> {
  return listen<FsChange>("fs-changed", (e) => cb(e.payload));
}
