import { getSetting, saveSetting } from "./settings";

export interface SyncPage {
  since: number;
  until?: number;
  pageToken?: string;
  fetched?: number;
}

export function loadSyncPage(key: string, fallback: SyncPage): SyncPage {
  try {
    const saved: SyncPage = JSON.parse(getSetting(key) ?? "null");
    if (
      saved && Number.isFinite(saved.since) &&
      saved.until === fallback.until &&
      (saved.fetched === undefined || (Number.isFinite(saved.fetched) && saved.fetched >= 0)) &&
      (saved.pageToken === undefined || typeof saved.pageToken === "string")
    ) return saved;
  } catch {
    // Missing or obsolete checkpoints restart the window safely.
  }
  return fallback;
}

export function saveSyncPage(key: string, page: SyncPage): void {
  saveSetting(key, JSON.stringify(page));
}

export function clearSyncPage(key: string): void {
  saveSetting(key, "");
}

export const INCREMENTAL_PAGE_KEY = "sync:incremental-page";
export const HISTORICAL_PAGE_KEY = "sync:historical-page";
