import { buildGroundingSources, pickFreshness } from "./brave";

const originalApiKey = process.env.BRAVE_API_KEY;
afterEach(() => {
  if (originalApiKey === undefined) delete process.env.BRAVE_API_KEY; else process.env.BRAVE_API_KEY = originalApiKey;
  jest.restoreAllMocks();
});

it("chooses Brave freshness based on the addition date", () => {
  expect(pickFreshness(new Date().toISOString())).toBe("pw");
  expect(pickFreshness("2020-01-01")).toBe("pm");
});

it("requires a key and reports upstream HTTP failures", async () => {
  delete process.env.BRAVE_API_KEY;
  await expect(buildGroundingSources({ companyName: "Acme", breachDate: "2024-01-01", addedDate: "2024-01-01" })).rejects.toThrow("BRAVE_API_KEY is not set");
  process.env.BRAVE_API_KEY = "test-token";
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" }) as any;
  await expect(buildGroundingSources({ companyName: "Acme", breachDate: "2024-01-01", addedDate: "2024-01-01" })).rejects.toThrow("Brave 429: rate limited");
});

it("deduplicates search results and enriches the official disclosure source", async () => {
  process.env.BRAVE_API_KEY = "test-token";
  const longText = `Remediation advice. ${"details ".repeat(40)}`;
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ web: { results: [
      { url: "https://www.acme.test/breach", title: "Disclosure", description: "Official notice" },
      { url: "https://news.test/story", title: "Coverage", description: "News" },
    ] } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ web: { results: [
      { url: "https://www.acme.test/breach", title: "Disclosure duplicate", description: "Duplicate" },
    ] } }) })
    .mockResolvedValueOnce({ ok: true, text: async () => `<html><script>bad()</script><p>${longText}</p></html>` })
    .mockResolvedValueOnce({ ok: true, text: async () => `<p>${longText}</p>` }) as any;
  const sources = await buildGroundingSources({ companyName: "Acme", primaryDomain: "acme.test", breachDate: "2024-01-01", addedDate: new Date().toISOString(), disclosureUrl: "https://www.acme.test/breach" });
  expect(sources).toHaveLength(2);
  expect(sources[0].content).not.toContain("bad()");
  expect(sources[0].content).toContain("Remediation advice.");
  expect(sources[1].content).toContain("Remediation advice.");
});
