import Database from "better-sqlite3";
import { getDb } from "../db";
import { saveGmailFolderSettings } from "./gmailSyncSettings";
import { getSetting, saveSetting } from "./settings";

jest.mock("../db", () => ({ getDb: jest.fn() }));
jest.mock("./settings", () => ({ getSetting: jest.fn(), saveSetting: jest.fn() }));
let db: Database.Database;
beforeEach(() => {
  db = new Database(":memory:");
  jest.mocked(getDb).mockReturnValue(db);
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE messages (id TEXT PRIMARY KEY);
    INSERT INTO messages VALUES ('keep-me');
    CREATE TABLE sync_state (id INTEGER PRIMARY KEY, last_sync_at INTEGER,
      next_page_token TEXT, quick_sync_done_at INTEGER, historical_cursor INTEGER,
      historical_done INTEGER, sync_checkpoint TEXT);
    INSERT INTO sync_state VALUES (1, 100, 'old-token', 100, 50, 1, 'old-history');
    INSERT INTO settings VALUES ('sync:historical-page', 'old-page'),
      ('sync:incremental-page', 'old-page'), ('gmail:read-pacing', 'keep-cooldown');`);
  jest.mocked(getSetting).mockImplementation((key) =>
    (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as {value: string} | undefined)?.value);
  jest.mocked(saveSetting).mockImplementation((key, value) => {
    db.prepare("INSERT OR REPLACE INTO settings VALUES (?, ?)").run(key, value);
  });
});
afterEach(() => db.close());

test("changing folders invalidates checkpoints but preserves imported data and quota pacing", () => {
  saveGmailFolderSettings({ gmailIncludeSpam: true, gmailIncludeTrash: false });
  expect(getSetting("gmailIncludeSpam")).toBe("true");
  expect(getSetting("gmailIncludeTrash")).toBe("false");
  expect(getSetting("sync:historical-page")).toBe("");
  expect(getSetting("sync:incremental-page")).toBe("");
  expect(getSetting("gmail:read-pacing")).toBe("keep-cooldown");
  expect(db.prepare("SELECT * FROM sync_state").get()).toEqual({
    id: 1, last_sync_at: null, next_page_token: null, quick_sync_done_at: null,
    historical_cursor: null, historical_done: 0, sync_checkpoint: null,
  });
  expect(db.prepare("SELECT * FROM messages").all()).toEqual([{id: "keep-me"}]);
});

test("saving the existing defaults does not restart sync", () => {
  saveGmailFolderSettings({ gmailIncludeSpam: false, gmailIncludeTrash: false });
  expect(getSetting("sync:historical-page")).toBe("old-page");
  expect(db.prepare("SELECT historical_done FROM sync_state").get()).toEqual({ historical_done: 1 });
});
