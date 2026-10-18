import { getRootDomain, headerRecord, parseHeaderPairs, parseMailto } from "./utils";

describe("stored message headers", () => {
  it("treats prototype-like header names as data", () => {
    const result = headerRecord([["__proto__", "first"], ["__proto__", "second"], ["constructor", "value"]]);
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(result.__proto__).toEqual(["first", "second"]);
    expect(result.constructor).toBe("value");
  });
  test.each([undefined, null, "", "not json", "null", "42", '"header"'])("tolerates missing or damaged headers: %p", (value) => {
    expect(parseHeaderPairs(value)).toEqual([]);
  });

  it("preserves repeated ordered headers and discards malformed entries", () => {
    expect(parseHeaderPairs(JSON.stringify([
      ["List-Unsubscribe", "<mailto:first@example.com>"], null, [1, "bad"], ["bad"],
      ["List-Unsubscribe", "<https://example.com/unsubscribe>"],
    ]))).toEqual([
      ["List-Unsubscribe", "<mailto:first@example.com>"],
      ["List-Unsubscribe", "<https://example.com/unsubscribe>"],
    ]);
  });

  it("reads legacy object headers without accepting non-string values", () => {
    expect(parseHeaderPairs('{"Subject":"Hello","count":3,"extra":null}')).toEqual([["Subject", "Hello"]]);
  });

  it("retains all values when building the analysis engine header record", () => {
    expect(headerRecord([["Subject", "Hello"], ["DKIM-Signature", "first"], ["DKIM-Signature", "second"], ["DKIM-Signature", "third"]]))
      .toEqual({ Subject: "Hello", "DKIM-Signature": ["first", "second", "third"] });
  });
});

describe("unsubscribe mailto parsing", () => {
  it("keeps literal plus signs in unsubscribe tokens and decodes percent escapes", () => {
    expect(parseMailto("MAILTO:leave+token@example.com?SUBJECT=Remove%20me&body=a+b%26c%3Dd"))
      .toEqual({ to: "leave+token@example.com", subject: "Remove me", body: "a+b&c=d" });
  });

  it("honors an explicit recipient and handles empty or malformed query fields", () => {
    expect(parseMailto("mailto:first@example.com?&to=second%40example.com&subject&body=%ZZ"))
      .toEqual({ to: "second@example.com", subject: "", body: "%ZZ" });
  });

  it("accepts a recipient without a query", () => {
    expect(parseMailto("mailto:leave@example.com")).toEqual({ to: "leave@example.com", subject: "", body: "" });
  });

  test.each([
    ["example.com", "example.com"], ["mail.shop.example.com", "example.com"],
    ["mail.example.co.uk", "example.co.uk"], ["example.co.uk", "example.co.uk"],
    ["localhost", "localhost"], ["mail.example.com.au", "example.com.au"],
  ])("groups %s under %s", (domain, expected) => expect(getRootDomain(domain)).toBe(expected));
});
