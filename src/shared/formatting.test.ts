import { formatAbsoluteDate, formatBytes, formatRelativeDate, formatShortDate, formatUtcStrictDate, toUtcDayString, utcMidnightMs } from "./formatting";

it("groups timestamps by UTC day independently of the local timezone", () => {
  const timestamp = Date.parse("2026-04-16T00:30:00Z");
  expect(toUtcDayString(timestamp)).toBe("2026-04-16");
  expect(utcMidnightMs(timestamp)).toBe(Date.parse("2026-04-16T00:00:00Z"));
  expect(formatUtcStrictDate("2026-04-16", "MMM D, YYYY")).toBe("Apr 16, 2026");
  expect(formatUtcStrictDate("not-a-date", "MMM D")).toBe("not-a-date");
});

it("formats recent dates without noisy second counts", () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-04-16T12:00:00Z"));
  try {
    expect(formatRelativeDate(Date.now() - 59_999)).toBe("just now");
    expect(formatRelativeDate(Date.now() - 120_000)).toBe("2 minutes ago");
    expect(formatRelativeDate(Date.now() + 120_000)).toBe("in 2 minutes");
    expect(formatAbsoluteDate(Date.now())).toBe("Apr 16, 2026");
    expect(formatShortDate(Date.now())).toBe("Apr 16");
  } finally { jest.useRealTimers(); }
});

test.each([[0, "0 B"], [1023, "1023 B"], [1024, "1.0 KB"], [1048576, "1.0 MB"], [1073741824, "1.00 GB"]])("formats %i bytes as %s", (bytes, expected) => expect(formatBytes(bytes as number)).toBe(expected));
