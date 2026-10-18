import Database from "better-sqlite3";
import { clearSyncData, getSyncState, runSync, setProgressEmitter } from "./sync";
import { loadCredentials } from "../credentials";
import { getProvider } from "../providers/ProviderFactory";
import { getKnownPiiValues, persistFindings, runReclassifyPass } from "./analysis";
import { deleteMessagesByIds, getVendorIdsByMessageIds, insertMessageVendor, reapplyUnsubscribedFromActionLog } from "./messages";
import { getSetting, saveSetting, getLicenseStatus } from "./settings";
import { addReceivedProfileEmails } from "./profileSeed";
import type { EmailMessage, EmailProvider } from "../providers/types";

let db: Database.Database;
const settings = new Map<string, string>();
jest.mock("../db", () => ({ getDb: () => db }));
jest.mock("../credentials", () => ({ loadCredentials: jest.fn() }));
jest.mock("../providers/ProviderFactory", () => ({ getProvider: jest.fn() }));
jest.mock("./analysis", () => ({ getKnownPiiValues: jest.fn(), persistFindings: jest.fn(), runReclassifyPass: jest.fn() }));
jest.mock("./messages", () => ({ insertMessageVendor: jest.fn(), deleteMessagesByIds: jest.fn(), getVendorIdsByMessageIds: jest.fn(), reapplyUnsubscribedFromActionLog: jest.fn() }));
jest.mock("./settings", () => ({ getSetting: jest.fn(), saveSetting: jest.fn(), hasValidLicense: jest.fn(async () => true), getLicenseStatus: jest.fn(() => ({ active: true })) }));
jest.mock("./vendors", () => ({ findOrCreateVendor: jest.fn(() => 1), getVendorDomain: (email: string) => email.split("@")[1], updateVendorStats: jest.fn(), updateVendorFlags: jest.fn(), recomputeAllVendorFlags: jest.fn(), matchVendorCompanies: jest.fn(), enrichVendorCategories: jest.fn() }));
jest.mock("./cases", () => ({ syncCaseRepliesForVendors: jest.fn() }));
jest.mock("./profileSeed", () => ({ addReceivedProfileEmails: jest.fn(), seedProfileEmailsFromCurrentAccount: jest.fn() }));
jest.mock("../utils/log", () => ({ syncLog: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

let provider: jest.Mocked<EmailProvider>;
const progress = jest.fn();
const message = (id: string, senderEmail = "vendor@example.com"): EmailMessage => ({ id, senderEmail, senderName: "Vendor", subject: "Subject", snippet: "Preview", date: 0, headersJson: "[]", analysis: { text: "Body", findings: [], receivedAddress: "alias@example.org" } as EmailMessage["analysis"] });

beforeEach(() => {
  jest.clearAllMocks();
  settings.clear();
  settings.set("accountEmail", "me@example.org");
  jest.mocked(getSetting).mockImplementation((key) => settings.get(key));
  jest.mocked(saveSetting).mockImplementation((key, value) => { settings.set(key, value); });
  jest.mocked(loadCredentials).mockReturnValue({ providerType: "imap" });
  jest.mocked(getKnownPiiValues).mockReturnValue([]);
  jest.mocked(runReclassifyPass).mockResolvedValue(0);
  jest.mocked(persistFindings).mockImplementation(() => undefined);
  db = new Database(":memory:");
  db.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY); CREATE TABLE vendors (id INTEGER PRIMARY KEY);
    CREATE TABLE sync_state (id INTEGER PRIMARY KEY, last_sync_at INTEGER, next_page_token TEXT, quick_sync_done_at INTEGER, historical_cursor INTEGER, historical_done INTEGER DEFAULT 0, sync_checkpoint TEXT);
    INSERT INTO sync_state(id) VALUES (1);`);
  jest.mocked(insertMessageVendor).mockImplementation((msg) => { db.prepare("INSERT OR IGNORE INTO messages(id) VALUES (?)").run(msg.id); return true; });
  provider = {
    type: "imap", isAuthenticated: jest.fn(() => true), connect: jest.fn(async () => ({ type: "imap" as const, email: "me@example.org" })),
    disconnect: jest.fn(async () => undefined), getMessageCount: jest.fn(async () => 0), listMessages: jest.fn(async () => ({ messages: [] })),
    getMessage: jest.fn(), trashMessage: jest.fn(), markAsSpam: jest.fn(), markAsRead: jest.fn(), sendEmail: jest.fn(),
  };
  jest.mocked(getProvider).mockReturnValue(provider);
  setProgressEmitter(progress);
});
afterEach(() => db.close());

it("finishes an empty first sync after three historical windows and stores its boundary", async () => {
  await runSync(false);
  expect(provider.listMessages).toHaveBeenCalledTimes(4);
  expect(getSyncState()).toEqual(expect.objectContaining({ historical_done: true, quick_sync_done_at: expect.any(Number), last_sync_at: expect.any(Number) }));
  expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ running: false, message: "Sync complete", historicalDone: true }));
  expect(provider.disconnect).toHaveBeenCalledTimes(1);
  expect(getLicenseStatus).not.toHaveBeenCalled();
});

it("paginates and stores only vendor messages and their findings atomically", async () => {
  provider.listMessages.mockImplementationOnce(async (_since, _until, _token, emit) => {
    emit?.(5);
    return { messages: [message("vendor"), message("self", "me@example.org"), message("personal", "friend@gmail.com"), message("invalid", "no-domain")], nextPageToken: "page-2" };
  }).mockResolvedValueOnce({ messages: [message("second") ] });
  await runSync(true);
  expect(provider.listMessages.mock.calls[1][2]).toBe("page-2");
  expect(insertMessageVendor).toHaveBeenCalledTimes(2);
  expect(persistFindings).toHaveBeenCalledWith("vendor", []);
  expect(db.prepare("SELECT COUNT(*) AS count FROM messages").get()).toEqual({ count: 2 });
  expect(addReceivedProfileEmails).toHaveBeenCalledWith(db, "global.profile_emails", new Set(["alias@example.org"]));
});

it("rolls back the message when persisting its findings fails and leaves a resumable checkpoint", async () => {
  provider.listMessages.mockResolvedValueOnce({ messages: [message("failed")] });
  jest.mocked(persistFindings).mockImplementationOnce(() => { throw new Error("Disk full"); });
  await runSync(false);
  expect(db.prepare("SELECT COUNT(*) AS count FROM messages").get()).toEqual({ count: 0 });
  expect(getSyncState().last_sync_at).toBeUndefined();
  expect(settings.get("sync:incremental-page")).toContain("since");
  expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ running: false, message: "Sync failed", error: "Disk full" }));
});

it("resumes the saved incremental window and page token after interruption", async () => {
  const since = Date.parse("2026-03-01");
  settings.set("sync:incremental-page", JSON.stringify({ since, pageToken: "resume-page" }));
  await runSync(false);
  expect(provider.listMessages.mock.calls[0].slice(0, 3)).toEqual([new Date(since), undefined, "resume-page"]);
  expect(settings.get("sync:incremental-page")).toBe("");
});

it("overlaps subsequent syncs and applies removals before advancing their cursor", async () => {
  const lastSync = Date.parse("2026-03-01");
  db.prepare("UPDATE sync_state SET last_sync_at=?, quick_sync_done_at=?, historical_done=1, sync_checkpoint='old' WHERE id=1").run(lastSync, lastSync);
  provider.getRemovalCursor = jest.fn(async () => "baseline");
  provider.listRemovals = jest.fn(async () => ({ removedIds: ["removed"], nextCursor: "new" }));
  jest.mocked(getVendorIdsByMessageIds).mockReturnValue([1]);
  await runSync(false);
  expect(provider.listMessages.mock.calls[0][0].getTime()).toBe(lastSync - 3_600_000);
  expect(deleteMessagesByIds).toHaveBeenCalledWith(["removed"]);
  expect(getSyncState().sync_checkpoint).toBe("new");
});

it("establishes and re-establishes removal baselines without deleting unproven messages", async () => {
  provider.getRemovalCursor = jest.fn(async () => "baseline");
  provider.listRemovals = jest.fn(async () => null);
  await runSync(false);
  expect(getSyncState().sync_checkpoint).toBe("baseline");
  expect(provider.listRemovals).not.toHaveBeenCalled();
  await runSync(false);
  expect(provider.listRemovals).toHaveBeenCalledWith("baseline");
  expect(deleteMessagesByIds).not.toHaveBeenCalled();
});

it("reapplies saved unsubscribe decisions after a migrated history finishes", async () => {
  settings.set("migration:reapply-unsub", "1");
  await runSync();
  expect(reapplyUnsubscribedFromActionLog).toHaveBeenCalledTimes(1);
  expect(settings.get("migration:reapply-unsub")).toBe("0");
  expect(getLicenseStatus).toHaveBeenCalledTimes(1);
});

it("skips missing credentials and concurrent runs without starting another provider", async () => {
  jest.mocked(loadCredentials).mockReturnValueOnce(undefined);
  await runSync(false);
  expect(getProvider).not.toHaveBeenCalled();
  let complete!: (value: { type: "imap"; email: string }) => void;
  provider.connect.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  const active = runSync(false);
  await Promise.resolve();
  await runSync(false);
  expect(provider.connect).toHaveBeenCalledTimes(1);
  complete({ type: "imap", email: "me@example.org" });
  await active;
});

it("clears messages, vendors, and pagination together for a full resync", async () => {
  await runSync(false);
  settings.set("sync:historical-page", "old");
  db.exec("INSERT INTO messages(id) VALUES ('old'); INSERT INTO vendors(id) VALUES (1)");
  clearSyncData();
  expect(getSyncState()).toEqual({ last_sync_at: undefined, next_page_token: undefined, quick_sync_done_at: undefined, historical_cursor: undefined, historical_done: false, sync_checkpoint: undefined });
  expect(db.prepare("SELECT COUNT(*) AS count FROM messages").get()).toEqual({ count: 0 });
  expect(settings.get("sync:historical-page")).toBe("");
});
