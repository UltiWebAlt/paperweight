import type Database from "better-sqlite3";

export interface GmailPacingState {
  nextRequestAt: number;
  requestIntervalMs: number;
}

// One app-wide budget deliberately leaves headroom even while multiple accounts
// sync. SQLite transactions coordinate the main process and every sync worker.
export function createGmailPacingStore(getDatabase: () => Database.Database) {
  const key = "gmail:request-pacing";
  function read(db: Database.Database): GmailPacingState {
    const row = db.prepare("SELECT value_json FROM app_settings WHERE key = ?").get(key) as
      { value_json: string } | undefined;
    let value: Partial<GmailPacingState> = {};
    try { value = JSON.parse(row?.value_json ?? "{}") ?? {}; } catch { /* use safe defaults */ }
    return {
      nextRequestAt: Number.isFinite(value.nextRequestAt) ? Math.max(0, value.nextRequestAt!) : 0,
      requestIntervalMs: Number.isFinite(value.requestIntervalMs)
        ? Math.max(1000, Math.min(10_000, value.requestIntervalMs!)) : 1000,
    };
  }
  function write(db: Database.Database, state: GmailPacingState): void {
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value_json) VALUES (?, ?)")
      .run(key, JSON.stringify(state));
  }
  return {
    load: () => read(getDatabase()),
    save(state: GmailPacingState): void {
      const db = getDatabase();
      db.transaction(() => {
        const saved = read(db);
        write(db, {
          nextRequestAt: Math.max(saved.nextRequestAt, state.nextRequestAt),
          requestIntervalMs: Math.max(saved.requestIntervalMs, state.requestIntervalMs),
        });
      }).immediate();
    },
    acquire(now: number, interval: number): number {
      const db = getDatabase();
      return db.transaction(() => {
        const state = read(db);
        if (state.nextRequestAt > now) return state.nextRequestAt - now;
        state.requestIntervalMs = Math.max(state.requestIntervalMs, interval);
        state.nextRequestAt = now + state.requestIntervalMs;
        write(db, state);
        return 0;
      }).immediate();
    },
  };
}
