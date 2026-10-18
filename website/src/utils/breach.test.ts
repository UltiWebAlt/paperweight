const mockBreaches = [
  { slug: "alpha", title: "Alpha", company_name: "Alpha Ltd", domain: "alpha.test", breach_date: "2025-01-10", added_date: "2025-02-01", pwn_count: 1200000, data_classes: ["passwords"], categories: ["financial"], runs: [], description: "Incident", is_verified: true, is_sensitive: false, attribution: "group", disclosure_url: "https://alpha.test/disclosure", webform: "https://alpha.test/form", address: "Paris, France", source: { name: "Source", url: "https://source.test" } },
  { slug: "beta", title: "Beta", company_name: "Beta Ltd", domain: "beta.test", breach_date: "2025-02-10", added_date: "2025-02-02", pwn_count: 0, data_classes: ["medical records", "phone"], categories: ["healthcare"], runs: [], description: "Incident", is_verified: false, is_sensitive: true },
  { slug: "gamma", title: "Gamma", company_name: "Gamma Ltd", domain: "gamma.test", breach_date: "2023-01-01", added_date: "2023-01-02", pwn_count: 800, data_classes: ["email"], categories: ["unknown"], runs: [], description: "Incident", is_verified: false, is_sensitive: false },
] as any[];
const mockEnforcement = [{ fine_eur: 1500000, dpa_country: "France" }];
jest.mock("./content", () => ({
  getBreachedCompanies: () => mockBreaches,
  getBreachFile: (slug: string) => slug === "alpha" ? { content: { aboutCompany: "About", incidentAndExposure: "Incident", nextSteps: "Next" }, logoUrl: "/alpha.png" } : undefined,
  getBreachBySlug: (slug: string) => mockBreaches.find((item) => item.slug === slug),
  getBreachLastModified: (slug: string) => slug === "alpha" ? "2025-02-01" : undefined,
  getBreachSlugs: () => ["alpha", "beta"],
  getEnforcementBySlug: (slug: string) => slug === "alpha" ? mockEnforcement : [],
}));

import { formatCount, formatFine, getBreachIndexItems, getBreachPageModel, getBreachSitemapEntries, getRelatedBreaches } from "./breach";

it("formats exposure counts and fines across display thresholds", () => {
  expect(formatCount(0)).toBe("Unknown");
  expect(formatCount(999)).toBe("999");
  expect(formatCount(1200)).toBe("1K");
  expect(formatCount(1200000)).toBe("1.2 million");
  expect(formatFine(999)).toBe("€999");
  expect(formatFine(1200)).toBe("€1K");
  expect(formatFine(1200000)).toBe("€1.2M");
});

it("builds sorted index, detail metadata, severity, contact and fine totals", () => {
  const index = getBreachIndexItems();
  expect(index.map((item) => item.slug)).toEqual(["beta", "alpha", "gamma"]);
  expect(index[0].riskLabel).toBe("High risk");
  const model = getBreachPageModel("alpha");
  expect(model?.metadata.title).toBe("Alpha Data Breach - What to do");
  expect(model?.metadata.description).toMatch(/1.2 million records/);
  expect(model?.company.logoPath).toBe("/alpha.png");
  expect(model?.enforcement.totalFines).toBe(1500000);
  expect(model?.actions.contactUrl).toBe("https://alpha.test/form");
  expect(getBreachPageModel("missing")).toBeNull();
});

it("ranks related breaches and exposes sitemap timestamps", () => {
  expect(getRelatedBreaches("alpha").map((item) => item.slug)[0]).toBe("beta");
  expect(getRelatedBreaches("missing")).toEqual([]);
  expect(getBreachSitemapEntries()).toEqual([{ slug: "alpha", lastModified: "2025-02-01" }, { slug: "beta", lastModified: undefined }]);
});
