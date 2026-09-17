import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createGmailPacingStore } from "./gmail-pacing";

test("independent connections share pacing, preserve cooldown and survive reopening", () => {
  const dir = mkdtempSync(join(tmpdir(), "gmail-pacing-"));
  const path = join(dir, "global.db");
  const first = new Database(path);
  const second = new Database(path);
  let reopened: Database.Database | undefined;
  try {
    first.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)");
    const main = createGmailPacingStore(() => first);
    const worker = createGmailPacingStore(() => second);
    expect(main.acquire(0, 1000)).toBe(0);
    expect(worker.acquire(0, 1000)).toBe(1000);
    worker.save({ nextRequestAt: 60_000, requestIntervalMs: 2000 });
    main.save({ nextRequestAt: 1000, requestIntervalMs: 1000 });
    expect(main.acquire(1000, 1000)).toBe(59_000);
    expect(main.load()).toEqual({ nextRequestAt: 60_000, requestIntervalMs: 2000 });
    first.close(); second.close();
    reopened = new Database(path);
    const restarted = createGmailPacingStore(() => reopened!);
    expect(restarted.acquire(59_000, 1000)).toBe(1000);
    expect(restarted.acquire(60_000, 1000)).toBe(0);
    expect(restarted.load().nextRequestAt).toBe(62_000);
  } finally {
    if (first.open) first.close();
    if (second.open) second.close();
    reopened?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
