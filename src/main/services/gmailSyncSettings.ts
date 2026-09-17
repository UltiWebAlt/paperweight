import { getDb } from "../db";
import { getSetting, saveSetting } from "./settings";
import { clearSyncPage, INCREMENTAL_PAGE_KEY, HISTORICAL_PAGE_KEY } from "./sync-pagination";

export interface GmailFolderSettings {
  gmailIncludeSpam: boolean;
  gmailIncludeTrash: boolean;
}

/** Caller stops the active worker before changing the query and checkpoints. */
export function saveGmailFolderSettings(settings: GmailFolderSettings): void {
  getDb().transaction(() => {
    const changed = Object.entries(settings).some(([key, value]) =>
      (getSetting(key) === "true") !== value,
    );
    if (!changed) return;
    for (const [key, value] of Object.entries(settings)) saveSetting(key, String(value));
    clearSyncPage(INCREMENTAL_PAGE_KEY);
    clearSyncPage(HISTORICAL_PAGE_KEY);
    // Revisit older mail under the new folder selection without clearing data,
    // user actions, or the saved Gmail quota cooldown.
    getDb().exec(`UPDATE sync_state SET last_sync_at = NULL,
      next_page_token = NULL, quick_sync_done_at = NULL,
      historical_cursor = NULL, historical_done = 0, sync_checkpoint = NULL
      WHERE id = 1`);
  })();
}
