import { isEmail, isEmailOrDomain, isIntInRange, isLicenseKey, isString } from "./validation";

test.each([null, undefined, 4, {}, [], true])("rejects non-string inputs: %p", (value) => {
  expect(isString(value)).toBe(false);
  expect(isEmail(value)).toBe(false);
  expect(isEmailOrDomain(value)).toBe(false);
  expect(isLicenseKey(value)).toBe(false);
});

test.each(["name+tag@example.co.uk", "a@example.com"])("accepts an email address: %s", (value) => expect(isEmail(value)).toBe(true));
test.each(["", "name@host", "name with space@example.com", "@example.com", "one@@example.com"])("rejects an invalid email address: %s", (value) => expect(isEmail(value)).toBe(false));
test.each(["example.com", "mail.example.co.uk", "name@example.com"])("accepts a whitelist address: %s", (value) => expect(isEmailOrDomain(value)).toBe(true));
test.each(["https://example.com", "example.com/path", "localhost", "example.c", "@example.com"])("rejects an invalid whitelist entry: %s", (value) => expect(isEmailOrDomain(value)).toBe(false));

it("enforces finite integer boundaries and license length", () => {
  for (const value of [0, 1, 100]) expect(isIntInRange(value, 0, 100)).toBe(true);
  for (const value of [-1, 101, 0.5, NaN, Infinity, "1", null]) expect(isIntInRange(value, 0, 100)).toBe(false);
  expect(isLicenseKey("a".repeat(256))).toBe(true);
  expect(isLicenseKey("a".repeat(257))).toBe(false);
  expect(isLicenseKey("")).toBe(false);
});
