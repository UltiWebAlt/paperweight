const mockGet = jest.fn();
const mockClose = jest.fn();
const mockOpen = jest.fn();
jest.mock("better-sqlite3", () => jest.fn().mockImplementation(() => {
  mockOpen();
  return { prepare: () => ({ get: mockGet }), close: mockClose };
}));
jest.mock("electron", () => ({ app: { getPath: () => "/tmp" } }));
jest.mock("../credentials", () => ({ emailToFileKey: (email: string) => email }));
import { readAccountHealth } from "./accountHealth";
const idle = { running: false, progress: 0, total: 0, message: "" };
beforeEach(() => { jest.clearAllMocks(); mockOpen.mockReset(); mockGet.mockReturnValue({ last_sync_at: 123 }); });
it("reads each account's persisted last sync and closes its database", () => {
  expect(readAccountHealth("one", idle, true)).toEqual({ email: "one", connection: "ready", lastSyncAt: 123, historyAvailable: true });
  expect(mockClose).toHaveBeenCalled();
});
it("distinguishes missing credentials, failures and running syncs", () => {
  expect(readAccountHealth("one", idle, false).connection).toBe("missing");
  expect(readAccountHealth("one", { ...idle, error: "offline" }, true).connection).toBe("error");
  expect(readAccountHealth("one", { ...idle, running: true }, true).connection).toBe("syncing");
});
it("does not mistake unavailable history for a connection failure or a never-synced account", () => {
  mockOpen.mockImplementation(() => { throw new Error("unavailable"); });
  expect(readAccountHealth("one", idle, true)).toEqual({ email: "one", connection: "ready", lastSyncAt: undefined, historyAvailable: false });
});
it("uses current worker timestamps when available", () => {
  expect(readAccountHealth("one", { ...idle, lastSyncAt: 456 }, true).lastSyncAt).toBe(456);
});
