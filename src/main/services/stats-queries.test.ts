jest.mock("../credentials", () => ({ emailToFileKey: jest.fn() }));
jest.mock("../utils/log", () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { dbLog: logger, appLog: logger, syncLog: logger };
});

import { getDb, initDb } from "../db";
import {
  getActivityLog,
  getDashboardStats,
  getImpactStats,
  getRiskCounts,
} from "./stats";

beforeAll(() => initDb(":memory:", "/nonexistent", "/nonexistent", "/nonexistent"));
beforeEach(() => {
  getDb().exec(`
    DELETE FROM action_log;
    DELETE FROM messages;
    DELETE FROM vendors;
    DELETE FROM whitelist;
  `);
});

function addVendor(domain: string, category: string, status: string | null = null): number {
  return Number(getDb().prepare(
    "INSERT INTO vendors (root_domain, name, category_id, risk_level, status, has_account, has_marketing) VALUES (?, ?, ?, ?, ?, 1, 1)",
  ).run(domain, domain, category, category === "financial" ? "high" : "low", status).lastInsertRowid);
}

it("returns empty dashboard, impact, risk, and activity results", () => {
  expect(getDashboardStats()).toEqual({
    totalMessages: 0, uniqueVendors: 0, mailingListCount: 0, breachedCount: 0,
    mailingListsActioned: 0, activeSubscriptions: 0, reviewedVendors: 0, highRiskUnreviewed: 0,
  });
  expect(getImpactStats()).toEqual({ listsUnsubscribed: 0, emailsDeleted: 0, dataReclaimedBytes: 0 });
  expect(getRiskCounts()).toEqual({ high: 0, medium: 0, low: 0 });
  expect(getActivityLog(10, 0)).toEqual({ entries: [], total: 0 });
});

it("aggregates visible vendors, list activity, risk, impact and paginated log entries", () => {
  const listId = addVendor("newsletter.example", "financial");
  const reviewedId = addVendor("reviewed.example", "shopping", "reviewed");
  getDb().prepare(`INSERT INTO messages (id, vendor_id, sender_email, date, type, unsubscribe_method, unsubscribe_url)
    VALUES ('list', ?, 'news@newsletter.example', ?, 'promotion', 'rfc8058', 'https://newsletter.example/u')`)
    .run(listId, Date.now());
  getDb().prepare("INSERT INTO messages (id, vendor_id, sender_email, date, type) VALUES ('reviewed', ?, 'shop@reviewed.example', ?, 'purchase')")
    .run(reviewedId, Date.now());
  getDb().prepare(`INSERT INTO action_log (vendor_id, action_type, message_count, size_bytes, actioned_at)
    VALUES (?, 'unsubscribed', 3, 1000, 10), (?, 'trashed', 4, 2000, 20)`)
    .run(listId, reviewedId);

  expect(getDashboardStats()).toMatchObject({ totalMessages: 2, uniqueVendors: 1, mailingListCount: 1, mailingListsActioned: 2, reviewedVendors: 1 });
  expect(getImpactStats()).toEqual({ listsUnsubscribed: 1, emailsDeleted: 4, dataReclaimedBytes: 3000 });
  expect(getRiskCounts()).toEqual({ high: 2, medium: 0, low: 0 });
  const page = getActivityLog(1, 0);
  expect(page.total).toBe(2);
  expect(page.entries).toHaveLength(1);
  expect(page.entries[0]).toMatchObject({ vendorId: reviewedId, vendorName: "reviewed.example", actionType: "trashed", messageCount: 4 });
});

it("counts known breach records when the optional database is attached", () => {
  const id = addVendor("sub.example.com", "financial");
  getDb().prepare("INSERT INTO messages (id, vendor_id, sender_email, date, type) VALUES ('breach', ?, 'user@sub.example.com', ?, 'account')").run(id, Date.now());
  getDb().exec("ATTACH DATABASE ':memory:' AS breaches; CREATE TABLE breaches.breaches (domain TEXT);");
  getDb().prepare("INSERT INTO breaches.breaches (domain) VALUES ('example.com')").run();
  expect(getDashboardStats()).toMatchObject({ breachedCount: 1, uniqueVendors: 1 });
  getDb().exec("DETACH DATABASE breaches");
});
