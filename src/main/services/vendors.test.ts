jest.mock("../credentials", () => ({ emailToFileKey: jest.fn() }));
jest.mock("../utils/log", () => {
  const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { dbLog: l, syncLog: l, appLog: l };
});

import { getDb, initDb } from "../db";
import {
  deleteVendor,
  enrichVendorCategories,
  findOrCreateVendor,
  getVendorDetail,
  getVendorDomain,
  matchVendorCompanies,
  queryVendors,
  recomputeAllVendorFlags,
  updateVendor,
  updateVendorFlags,
  updateVendorStats,
} from "./vendors";
import type { PiiType } from "@shared/types";

function insertVendor(domain: string): number {
  return Number(
    getDb()
      .prepare("INSERT INTO vendors (root_domain, name, message_count) VALUES (?, ?, 1)")
      .run(domain, domain).lastInsertRowid,
  );
}
function insertMsg(
  id: string,
  vid: number,
  domain: string,
  type = "update",
): void {
  getDb()
    .prepare(
      "INSERT INTO messages (id, vendor_id, sender_email, date, type) VALUES (?, ?, ?, 1000, ?)",
    )
    .run(id, vid, `mail@${domain}`, type);
}
function insertFinding(
  messageId: string,
  type: PiiType,
  value: string,
  quoted = 0,
  flags: { footer?: number; selfReference?: number; country?: string } = {},
): void {
  getDb()
    .prepare(
      `INSERT INTO pii_findings (message_id, type, value_normalized, country, in_quoted_text, in_footer, self_reference)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      messageId,
      type,
      value,
      flags.country ?? null,
      quoted,
      flags.footer ?? 0,
      flags.selfReference ?? 0,
    );
}

function listedDomains(piiType: PiiType): string[] {
  return queryVendors({ page: 1, limit: 50, piiType }).vendors.map((v) => v.root_domain ?? "");
}

beforeAll(() => {
  initDb(":memory:", "/nonexistent", "/nonexistent", "/nonexistent");
  getDb().exec(`
    ATTACH DATABASE ':memory:' AS companies;
    CREATE TABLE companies.companies (
      slug TEXT PRIMARY KEY,
      name TEXT,
      runs TEXT,
      categories TEXT,
      domains TEXT
    );
  `);
});
beforeEach(() => {
  getDb().exec(
    `DELETE FROM pii_findings;
     DELETE FROM global.pii_suppressions;
     DELETE FROM global.profile_emails;
     DELETE FROM global.profile_phones;
     DELETE FROM global.profile_addresses;
     DELETE FROM global.profile_national_ids;
     DELETE FROM global.profile_payments;
     UPDATE global.profile SET country = NULL WHERE id = 1;
     DELETE FROM messages;
     DELETE FROM vendors;
     DELETE FROM companies.companies;`,
  );
});

// The filter's predicates must stay identical to getVendorPiiSummary's. If they
// drift, the Accounts page promises a company whose detail page shows nothing.
describe("queryVendors piiType filter", () => {
  it("lists a company with a visible finding of that type", () => {
    const vid = insertVendor("acme.com");
    insertMsg("m1", vid, "acme.com");
    insertFinding("m1", "iban", "NL91ABNA0417164300");

    expect(listedDomains("iban")).toEqual(["acme.com"]);
  });

  it("omits a company whose only finding is of another type", () => {
    const vid = insertVendor("acme.com");
    insertMsg("m1", vid, "acme.com");
    insertFinding("m1", "email", "a@b.com");

    expect(listedDomains("iban")).toEqual([]);
  });

  it("omits a company once the value is marked Not mine", () => {
    const vid = insertVendor("acme.com");
    insertMsg("m1", vid, "acme.com");
    insertFinding("m1", "iban", "NL91ABNA0417164300");
    getDb()
      .prepare(
        "INSERT INTO global.pii_suppressions (type, value_normalized) VALUES ('iban', 'NL91ABNA0417164300')",
      )
      .run();

    expect(listedDomains("iban")).toEqual([]);
  });

  it("omits a company whose only finding sits in quoted text", () => {
    const vid = insertVendor("acme.com");
    insertMsg("m1", vid, "acme.com");
    insertFinding("m1", "iban", "NL91ABNA0417164300", 1);

    expect(listedDomains("iban")).toEqual([]);
  });

  it("leaves the result set alone when no type is filtered on", () => {
    const a = insertVendor("acme.com");
    const b = insertVendor("globex.com");
    insertMsg("m1", a, "acme.com");
    insertMsg("m2", b, "globex.com");
    insertFinding("m1", "iban", "NL91ABNA0417164300");

    const all = queryVendors({ page: 1, limit: 50 }).vendors.map((v) => v.root_domain);
    expect(all.sort()).toEqual(["acme.com", "globex.com"]);
  });
});

describe("piiType filter mirrors the summary's exclusions", () => {
  it("does not list a company whose only finding sits in a footer", () => {
    const vid = insertVendor("footeronly.com");
    insertMsg("m1", vid, "footeronly.com");
    insertFinding("m1", "address", "4 sample street sw1a 1aa", 0, { footer: 1 });

    expect(listedDomains("address")).not.toContain("footeronly.com");
  });

  it("does not list a company whose only finding is its own address", () => {
    const vid = insertVendor("selfonly.com");
    insertMsg("m1", vid, "selfonly.com");
    insertFinding("m1", "email", "support@selfonly.com", 0, { selfReference: 1 });

    expect(listedDomains("email")).not.toContain("selfonly.com");
  });

  it("does not list a company when another template established the contact as footer data", () => {
    const vid = insertVendor("templates.example");
    insertMsg("plain", vid, "templates.example");
    insertMsg("footer", vid, "templates.example");
    insertFinding("plain", "address", "4 sample street exampleton");
    insertFinding("footer", "address", "4 sample street exampleton", 0, {
      footer: 1,
    });

    expect(listedDomains("address")).not.toContain("templates.example");
  });

  it("lists an otherwise excluded value when it is in the profile", () => {
    getDb().prepare(
      `INSERT INTO global.profile_addresses (raw, value_normalized)
       VALUES ('4 sample street exampleton', '4 sample street exampleton')`,
    ).run();
    const vid = insertVendor("profile.example");
    insertMsg("profile", vid, "profile.example");
    insertFinding("profile", "address", "4 sample street exampleton", 0, {
      footer: 1,
    });

    expect(listedDomains("address")).toContain("profile.example");
  });
});

describe("piiType filter mirrors the spread rule", () => {
  it("does not list a company whose only finding is spread across its own mail", () => {
    const vid = insertVendor("spread.com");
    for (let i = 0; i < 30; i++) {
      insertMsg(`sp-m${i}`, vid, "spread.com");
      insertFinding(`sp-m${i}`, "address", "4 sample street exampleton");
    }
    // Over the absolute threshold: the summary hides it, so the filter must too.
    expect(listedDomains("address")).not.toContain("spread.com");
  });

  it("still lists a company whose finding stays under both thresholds", () => {
    const vid = insertVendor("occasional.com");
    for (let i = 0; i < 30; i++) insertMsg(`oc-m${i}`, vid, "occasional.com");
    insertFinding("oc-m0", "address", "9 other road exampleton");

    expect(listedDomains("address")).toContain("occasional.com");
  });

  it("lists a spread-hidden value when it is in the profile", () => {
    getDb().prepare(
      `INSERT INTO global.profile_addresses (raw, value_normalized)
       VALUES ('4 sample street exampleton', '4 sample street exampleton')`,
    ).run();
    const vid = insertVendor("profile-spread.com");
    for (let i = 0; i < 30; i++) {
      insertMsg(`profile-spread-${i}`, vid, "profile-spread.com");
      insertFinding(
        `profile-spread-${i}`,
        "address",
        "4 sample street exampleton",
      );
    }

    expect(listedDomains("address")).toContain("profile-spread.com");
  });
});

describe("Accounts observed-data inclusion", () => {
  function accountDomains(): string[] {
    return queryVendors({ page: 1, limit: 50, filter: "accounts" }).vendors.map(
      (vendor) => vendor.root_domain ?? "",
    );
  }

  it("includes a personal-typed vendor with a visible non-email finding", () => {
    const vendor = insertVendor("observed.example");
    insertMsg("observed", vendor, "observed.example", "personal");
    insertFinding("observed", "address", "4 sample street exampleton");

    const result = queryVendors({ page: 1, limit: 50, filter: "accounts" });
    expect(result.vendors.map((row) => row.root_domain)).toContain("observed.example");
  });

  it("does not promote an email-only vendor", () => {
    const vendor = insertVendor("email-only.example");
    insertMsg("email-only", vendor, "email-only.example", "personal");
    insertFinding("email-only", "email", "person@example.test");

    expect(accountDomains()).not.toContain("email-only.example");
  });

  it("does not promote hard-excluded or suppressed findings", () => {
    const footer = insertVendor("footer.example");
    insertMsg("footer", footer, "footer.example", "personal");
    insertFinding("footer", "address", "4 sample street exampleton", 0, {
      footer: 1,
    });

    const suppressed = insertVendor("suppressed.example");
    insertMsg("suppressed", suppressed, "suppressed.example", "personal");
    insertFinding("suppressed", "phone", "+31610000003");
    getDb()
      .prepare(
        "INSERT INTO global.pii_suppressions (type, value_normalized) VALUES ('phone', '+31610000003')",
      )
      .run();

    expect(accountDomains()).toEqual([]);
  });

  it("does not promote contact data established by another footer template", () => {
    const vendor = insertVendor("templates.example");
    insertMsg("plain", vendor, "templates.example", "personal");
    insertMsg("footer", vendor, "templates.example", "personal");
    insertFinding("plain", "phone", "+31201234567");
    insertFinding("footer", "phone", "+31201234567", 0, { footer: 1 });

    expect(accountDomains()).not.toContain("templates.example");
  });

  it("does not promote a foreign-only ambiguous value once home country is known", () => {
    const first = insertVendor("first.example");
    const second = insertVendor("second.example");
    const foreign = insertVendor("foreign.example");
    insertMsg("home-1", first, "first.example", "unknown");
    insertMsg("home-2", second, "second.example", "unknown");
    insertMsg("foreign", foreign, "foreign.example", "unknown");
    insertFinding("home-1", "phone", "+31610000004", 0, { country: "NL" });
    insertFinding("home-2", "phone", "+31610000004", 0, { country: "NL" });
    insertFinding("foreign", "phone", "+919100000004", 0, { country: "IN" });
    getDb()
      .prepare("UPDATE global.profile SET country = 'NL' WHERE id = 1")
      .run();

    expect(accountDomains()).not.toContain("foreign.example");
    expect(listedDomains("phone")).toContain("foreign.example");
  });

  it("promotes a foreign-format value when it is in the profile", () => {
    getDb().exec(
      `INSERT INTO global.profile_phones (number_raw, value_normalized)
       VALUES ('+919100000004', '+919100000004');
       UPDATE global.profile SET country = 'NL' WHERE id = 1;`,
    );
    const vendor = insertVendor("profile-foreign.example");
    insertMsg("profile-foreign", vendor, "profile-foreign.example", "unknown");
    insertFinding("profile-foreign", "phone", "+919100000004", 0, {
      country: "IN",
    });

    const result = queryVendors({ page: 1, limit: 50, filter: "accounts" });
    expect(result.vendors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          root_domain: "profile-foreign.example",
          hasNotablePii: true,
        }),
      ]),
    );
  });

  it("does not promote a frequent identifier confined to one company", () => {
    const vendor = insertVendor("invoice.example");
    for (let i = 0; i < 20; i++) {
      insertMsg(`invoice-${i}`, vendor, "invoice.example", "unknown");
      insertFinding(`invoice-${i}`, "iban", "NL91ABNA0417164300", 0, {
        country: "NL",
      });
    }

    expect(accountDomains()).not.toContain("invoice.example");
    expect(listedDomains("iban")).toContain("invoice.example");
  });

  it("promotes a frequent identifier when it spans companies", () => {
    const first = insertVendor("first.example");
    const second = insertVendor("second.example");
    for (let i = 0; i < 20; i++) {
      insertMsg(`shared-${i}`, first, "first.example", "personal");
      insertFinding(`shared-${i}`, "iban", "NL91ABNA0417164300", 0, {
        country: "NL",
      });
    }
    insertMsg("shared-other", second, "second.example", "personal");
    insertFinding("shared-other", "iban", "NL91ABNA0417164300", 0, {
      country: "NL",
    });

    expect(accountDomains()).toEqual(
      expect.arrayContaining(["first.example", "second.example"]),
    );
  });
});

describe("vendor risk policy", () => {
  it("uses the displayed risk policy for filtering and sorting", () => {
    const high = insertVendor("high.example");
    const medium = insertVendor("medium.example");
    const low = insertVendor("low.example");
    insertMsg("high", high, "high.example", "purchase");
    insertMsg("medium", medium, "medium.example");
    insertMsg("low", low, "low.example");
    getDb()
      .prepare("UPDATE vendors SET category_id = 'entertainment' WHERE id = ?")
      .run(low);

    const mediumResults = queryVendors({
      page: 1,
      limit: 50,
      risk: "medium",
    }).vendors;
    expect(mediumResults.map((vendor) => vendor.root_domain)).toEqual([
      "medium.example",
    ]);

    const sorted = queryVendors({
      page: 1,
      limit: 50,
      sortBy: "risk",
      sortDir: "ASC",
    }).vendors;
    expect(sorted.map((vendor) => vendor.root_domain)).toEqual([
      "high.example",
      "medium.example",
      "low.example",
    ]);
  });
});

describe("vendor persistence and grouping helpers", () => {
  it.each([
    ["news@example.co.uk", "example.co.uk"],
    ["WEEKLY@SUBSTACK.COM", "weekly.substack.com"],
    ["writer@beehiiv.com", "writer.beehiiv.com"],
    ["support@netlify.zendesk.com", "netlify.zendesk.com"],
    ["nftplayground@calendar.luma-mail.com", "nftplayground.calendar.luma-mail.com"],
    ["noreply@calendar.luma-mail.com", "noreply.calendar.luma-mail.com"],
    ["not-an-email", "not-an-email"],
  ])("groups %s as %s", (sender, expected) => {
    expect(getVendorDomain(sender)).toBe(expected);
  });

  it("reuses existing vendors, infers new names, and attaches catalogue matches", () => {
    const existing = insertVendor("existing.example");
    expect(findOrCreateVendor("existing.example")).toBe(existing);
    expect(findOrCreateVendor("new.example")).toBeTruthy();
    getDb().prepare(
      "INSERT INTO companies.companies (slug, name, categories, domains) VALUES (?, ?, ?, ?)",
    ).run("catalogue", "Catalogue Co", '["finance"]', "catalogue.example");
    const id = findOrCreateVendor("catalogue.example");
    expect(getDb().prepare("SELECT company_slug, name FROM vendors WHERE id = ?").get(id)).toEqual({ company_slug: "catalogue", name: "Catalogue Co" });
  });

  it("recomputes message stats and only replaces inferred names", () => {
    const id = insertVendor("stats.example");
    const statement = getDb().prepare("INSERT INTO messages (id, vendor_id, sender_email, sender_name, date, type) VALUES (?, ?, ?, ?, ?, ?)");
    statement.run("newer", id, "alerts@stats.example", "Alerts", 2000, "update");
    statement.run("older", id, "news@stats.example", "Newsletter", 1000, "promotion");
    updateVendorStats(id);
    expect(getDb().prepare("SELECT message_count, sender_count, first_seen, last_seen, name FROM vendors WHERE id = ?").get(id)).toEqual({ message_count: 2, sender_count: 2, first_seen: 1000, last_seen: 2000, name: "Newsletter" });

    getDb().prepare("UPDATE vendors SET company_slug = 'known', name = 'Known Co' WHERE id = ?").run(id);
    updateVendorStats(id);
    expect((getDb().prepare("SELECT name FROM vendors WHERE id = ?").get(id) as { name: string }).name).toBe("Known Co");
  });

  it("updates individual flags and recomputes them for all populated vendors", () => {
    const list = insertVendor("list.example");
    const account = insertVendor("account.example");
    insertMsg("list-message", list, "list.example", "promotion");
    getDb().prepare("UPDATE messages SET unsubscribe_method = 'rfc8058', unsubscribe_url = ? WHERE id = ?").run("https://list.example/unsub", "list-message");
    insertMsg("account-message", account, "account.example", "purchase");
    updateVendorFlags(list);
    recomputeAllVendorFlags();
    expect(getDb().prepare("SELECT has_marketing, has_account FROM vendors WHERE id = ?").get(list)).toEqual({ has_marketing: 1, has_account: 0 });
    expect(getDb().prepare("SELECT has_marketing, has_account FROM vendors WHERE id = ?").get(account)).toEqual({ has_marketing: 0, has_account: 1 });
  });

  it("matches company domains and names while skipping personal domains", () => {
    getDb().prepare("INSERT INTO companies.companies (slug, name, runs, domains) VALUES (?, ?, ?, ?)").run("by-domain", "By Domain Co", "[]", "domain.example");
    getDb().prepare("INSERT INTO companies.companies (slug, name, runs, domains) VALUES (?, ?, ?, ?)").run("by-name", "Acme Services", '["Acme"]', "");
    const domainId = insertVendor("domain.example");
    const nameId = insertVendor("acme.example");
    const personalId = insertVendor("gmail.com");
    getDb().prepare("UPDATE vendors SET name = 'Acme' WHERE id = ?").run(nameId);
    matchVendorCompanies();
    expect((getDb().prepare("SELECT company_slug FROM vendors WHERE id = ?").get(domainId) as { company_slug: string }).company_slug).toBe("by-domain");
    expect((getDb().prepare("SELECT company_slug FROM vendors WHERE id = ?").get(nameId) as { company_slug: string }).company_slug).toBe("by-name");
    expect((getDb().prepare("SELECT company_slug FROM vendors WHERE id = ?").get(personalId) as { company_slug: string | null }).company_slug).toBeNull();
  });

  it("enriches catalogue categories and safely falls back on malformed metadata", () => {
    getDb().prepare("INSERT INTO companies.companies (slug, name, categories, domains) VALUES (?, ?, ?, ?)").run("health", "Health Co", '["health", "finance"]', "health.example");
    const healthId = insertVendor("health.example");
    const invalidId = insertVendor("invalid.example");
    getDb().prepare("UPDATE vendors SET company_slug = 'health' WHERE id = ?").run(healthId);
    getDb().prepare("INSERT INTO companies.companies (slug, name, categories, domains) VALUES (?, ?, ?, ?)").run("invalid", "Invalid", "{", "invalid.example");
    getDb().prepare("UPDATE vendors SET company_slug = 'invalid' WHERE id = ?").run(invalidId);
    enrichVendorCategories();
    expect(getDb().prepare("SELECT category_id, risk_level FROM vendors WHERE id = ?").get(healthId)).toEqual({ category_id: "healthcare", risk_level: "high" });
    expect(getDb().prepare("SELECT category_id FROM vendors WHERE id = ?").get(invalidId)).toEqual({ category_id: "unknown" });
  });

  it("updates or deletes vendors and returns a populated detail record", () => {
    const id = insertVendor("detail.example");
    insertMsg("detail-message", id, "detail.example");
    updateVendor(id, { status: "reviewed", account_email: "  me@example.test  " });
    const detail = getVendorDetail("detail.example");
    expect(detail.vendor.status).toBe("reviewed");
    expect(detail.vendor.account_email).toBe("me@example.test");
    expect(detail.allMessages).toHaveLength(1);
    expect(detail.senders).toHaveLength(1);
    expect(detail.activityLog).toEqual([]);
    updateVendor(id, {});
    deleteVendor(id);
    expect(() => getVendorDetail("detail.example")).toThrow("Vendor not found");
  });
});

describe("Mailing Lists actionability", () => {
  function listDomains(): string[] {
    return queryVendors({
      page: 1,
      limit: 50,
      filter: "lists",
    }).vendors.map((vendor) => vendor.root_domain ?? "");
  }

  it("does not expose promotion-looking mail without an unsubscribe action", () => {
    const vendorId = insertVendor("announcement.example");
    insertMsg("announcement", vendorId, "announcement.example", "promotion");

    updateVendorFlags(vendorId);

    expect(
      getDb()
        .prepare("SELECT has_marketing FROM vendors WHERE id = ?")
        .get(vendorId),
    ).toEqual({ has_marketing: 0 });
    expect(listDomains()).not.toContain("announcement.example");
  });

  it("includes actionable promotion and social mail", () => {
    const promotionVendor = insertVendor("newsletter.example");
    insertMsg("newsletter", promotionVendor, "newsletter.example", "promotion");
    const socialVendor = insertVendor("network.example");
    insertMsg("network", socialVendor, "network.example", "social");
    getDb()
      .prepare(
        `UPDATE messages
         SET unsubscribe_url = ?, unsubscribe_method = 'list-unsubscribe'
         WHERE id IN ('newsletter', 'network')`,
      )
      .run("https://example.test/unsubscribe");

    updateVendorFlags(promotionVendor);
    updateVendorFlags(socialVendor);

    expect(listDomains()).toEqual(
      expect.arrayContaining(["newsletter.example", "network.example"]),
    );
  });
});

describe("enrichVendorCategories", () => {
  it("atomically derives matched vendors and resets stale unmatched values", () => {
    getDb()
      .prepare(
        "INSERT INTO companies.companies (slug, categories) VALUES (?, ?)",
      )
      .run("bank", JSON.stringify(["finance"]));
    const matched = insertVendor("bank.example");
    const unmatched = insertVendor("unknown.example");
    getDb()
      .prepare(
        `UPDATE vendors
         SET company_slug = 'bank', category_id = 'entertainment', risk_level = 'low'
         WHERE id = ?`,
      )
      .run(matched);
    getDb()
      .prepare(
        "UPDATE vendors SET category_id = 'shopping', risk_level = 'medium' WHERE id = ?",
      )
      .run(unmatched);

    enrichVendorCategories();

    expect(
      getDb()
        .prepare(
          "SELECT category_id, risk_level FROM vendors WHERE id = ?",
        )
        .get(matched),
    ).toEqual({ category_id: "financial", risk_level: "high" });
    expect(
      getDb()
        .prepare(
          "SELECT category_id, risk_level FROM vendors WHERE id = ?",
        )
        .get(unmatched),
    ).toEqual({ category_id: "unknown", risk_level: "unknown" });
  });

  it("does not rewrite rows when the derived result is unchanged", () => {
    insertVendor("unknown.example");
    enrichVendorCategories();
    const before = (
      getDb().prepare("SELECT total_changes() AS count").get() as {
        count: number;
      }
    ).count;

    enrichVendorCategories();

    const after = (
      getDb().prepare("SELECT total_changes() AS count").get() as {
        count: number;
      }
    ).count;
    expect(after - before).toBe(0);
  });
});
