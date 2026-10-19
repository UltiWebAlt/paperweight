import Database from "better-sqlite3";
import { app } from "electron";
import { join } from "node:path";
import { emailToFileKey } from "../credentials";
import type { AccountHealth, SyncStatus } from "@shared/types";

export function readAccountHealth(email: string, status: SyncStatus, hasCredentials: boolean): AccountHealth {
  let lastSyncAt = status.lastSyncAt;
  let historyAvailable = false;
  let db: Database.Database | undefined;
  try {
    db = new Database(join(app.getPath("userData"), `${emailToFileKey(email)}.db`), {
      readonly: true, fileMustExist: true,
    });
    const row = db.prepare("SELECT last_sync_at FROM sync_state WHERE id = 1").get() as
      { last_sync_at: number | null } | undefined;
    lastSyncAt = lastSyncAt ?? row?.last_sync_at ?? undefined;
    historyAvailable = true;
  } catch {
    // A missing or temporarily unavailable database is not a connection failure.
  } finally {
    db?.close();
  }
  let connection: AccountHealth["connection"];
  if (!hasCredentials) connection = "missing";
  else if (status.error) connection = "error";
  else if (status.running) connection = "syncing";
  else connection = "ready";

  return {
    email, lastSyncAt, historyAvailable: historyAvailable || lastSyncAt !== undefined,
    connection,
  };
}
