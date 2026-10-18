import { buildGdprGeneratorInitialState, detectLanguageFromDomain, detectPreferredGdprLanguage, findCompanyByName, findDpaByAddress, findDpaByDomain, getPreferredDomain } from "./resolution";
import type { CompanyOption } from "./types";

const company: CompanyOption = { name: "Example Shop", slug: "example", email: "privacy@example.nl", domains: ["example.de"], address: "Street 12\nAmsterdam\nNetherlands" };

it("resolves companies by exact case-insensitive name or slug", () => {
  expect(findCompanyByName([company], " EXAMPLE SHOP ")).toBe(company);
  expect(findCompanyByName([company], "Example")).toBe(company);
  expect(findCompanyByName([company], "shop")).toBeUndefined();
  expect(findCompanyByName([company])).toBeUndefined();
  expect(buildGdprGeneratorInitialState([company], "example")).toEqual({ companyQuery: company.name, selectedCompany: company, manualOrgEmail: company.email });
  expect(buildGdprGeneratorInitialState([], " Unknown ")).toEqual({ companyQuery: "Unknown" });
  expect(buildGdprGeneratorInitialState([], " ")).toBeUndefined();
  expect(buildGdprGeneratorInitialState([{ ...company, email: undefined }], "example")?.manualOrgEmail).toBe("");
});

it("prioritizes ISO country codes, then recognizes address aliases and domain suffixes", () => {
  expect(findDpaByAddress(company.address!, "DE")?.country).toBe("Germany");
  expect(findDpaByAddress(company.address!, "ZZ")?.country).toBe("Netherlands");
  expect(findDpaByAddress("Street 12\nDeutschland")?.country).toBe("Germany");
  expect(findDpaByAddress(null)).toBeNull();
  expect(findDpaByAddress("Unknown country")).toBeNull();
  expect(findDpaByDomain("EXAMPLE.NL")?.country).toBe("Netherlands");
  expect(findDpaByDomain("")).toBeNull();
  expect(findDpaByDomain("example.com")).toBeNull();
});

it("selects a language using explicit recipient, company details, then English", () => {
  expect(getPreferredDomain(company, "hello@EXAMPLE.FR")).toBe("example.fr");
  expect(getPreferredDomain(company, "")).toBe("example.nl");
  expect(getPreferredDomain({ ...company, email: "no-email" }, "no-email")).toBe("example.de");
  expect(getPreferredDomain(undefined, "hello@")).toBeUndefined();
  expect(getPreferredDomain({ ...company, domains: [], email: undefined }, "")).toBeUndefined();
  expect(detectPreferredGdprLanguage(company, "hello@example.fr")).toBe("nl");
  expect(detectPreferredGdprLanguage(undefined, "hello@example.fr")).toBe("fr");
  expect(detectPreferredGdprLanguage(undefined, "")).toBe("en");
  expect(detectLanguageFromDomain("example.PT")).toBe("pt");
  expect(detectLanguageFromDomain("example.com")).toBe("en");
});
