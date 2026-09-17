import Database from "better-sqlite3";
import { getDb } from "../db";
import { getDashboardTrend } from "./stats";

jest.mock("../db", () => ({ getDb: jest.fn() }));
jest.mock("./settings", () => ({ getSetting: jest.fn() }));
jest.mock("./vendors", () => ({ COMPUTED_RISK_CASE: "" }));
jest.mock("./cases", () => ({ caseActivityFilter: jest.fn(), mapCaseActivityFields: jest.fn() }));

let db: Database.Database;
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-09-16T12:00:00Z"));
  db = new Database(":memory:");
  db.exec("CREATE TABLE messages (date INTEGER NOT NULL)");
  jest.mocked(getDb).mockReturnValue(db);
});
afterEach(() => {
  db.close();
  jest.useRealTimers();
});
const insert = (date: string) => db.prepare("INSERT INTO messages VALUES (?)").run(Date.parse(date));

test("refreshing the chart reflects newly committed messages on their received day", () => {
  insert("2026-09-15T12:00:00Z");
  const before = getDashboardTrend();
  const day = before.labels.indexOf("2026-09-15");
  expect(before.series[0].values[day]).toBe(1);
  insert("2026-09-15T18:00:00Z");
  const after = getDashboardTrend();
  expect(after.series[0].values[day]).toBe(2);
});

test("older imports expand the graph beyond both 90 days and one year", () => {
  insert("2026-09-16T10:00:00Z");
  expect(getDashboardTrend().labels).toHaveLength(90);
  insert("2024-01-05T23:00:00Z");
  const trend = getDashboardTrend();
  expect(trend.labels[0]).toBe("2024-01-05");
  expect(trend.labels.at(-1)).toBe("2026-09-16");
  expect(trend.series[0].values[0]).toBe(1);
  expect(trend.series[0].values.reduce((sum, n) => sum + n, 0)).toBe(2);
  expect(trend.series[0].values[1]).toBe(0);
});

test("empty accounts show a zero-filled 90-day chart", () => {
  const trend = getDashboardTrend();
  expect(trend.labels).toHaveLength(90);
  expect(trend.series[0].values.every((n) => n === 0)).toBe(true);
});

test("invalid old and future dates do not expand the chart", () => {
  insert("1800-01-01T00:00:00Z");
  insert("2099-01-01T00:00:00Z");
  expect(getDashboardTrend().labels).toHaveLength(90);
});
