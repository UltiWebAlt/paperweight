import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let mockUserData = "";
const mockSetLoginItemSettings = jest.fn();
const mockGetLoginItemSettings = jest.fn();
const mockNetFetch = jest.fn();
const mockSafeStorage = {
  isEncryptionAvailable: jest.fn(() => false),
  encryptString: jest.fn((value: string) => Buffer.from(value)),
  decryptString: jest.fn((value: Buffer) => value.toString("utf8")),
};

jest.mock("electron", () => ({
  app: {
    getPath: (name: string) => name === "userData" ? mockUserData : "/tmp",
    setLoginItemSettings: mockSetLoginItemSettings,
    getLoginItemSettings: mockGetLoginItemSettings,
  },
  net: { fetch: mockNetFetch },
  safeStorage: mockSafeStorage,
}));
jest.mock("../utils/log", () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { licenseLog: logger, dbLog: logger, appLog: logger };
});

import { getDb, initDb } from "../db";
import {
  activateLicense,
  addWhitelistEntry,
  applyAutoLaunch,
  deleteLicense,
  getLicenseStatus,
  getSetting,
  getWhitelistEntries,
  hasValidLicense,
  removeWhitelistEntry,
  saveSetting,
  wasLaunchedAsHidden,
} from "./settings";

let originalPlatform: NodeJS.Platform;
let originalArgv: string[];
let userDataDir: string;

beforeAll(() => initDb(":memory:", "/nonexistent", "/nonexistent", "/nonexistent"));
beforeEach(() => {
  originalPlatform = process.platform;
  originalArgv = [...process.argv];
  userDataDir = mkdtempSync(join(tmpdir(), "paperweight-settings-test-"));
  mockUserData = userDataDir;
  mockSetLoginItemSettings.mockClear();
  mockGetLoginItemSettings.mockReset();
  mockNetFetch.mockReset();
  mockSafeStorage.isEncryptionAvailable.mockReturnValue(false);
  getDb().exec("DELETE FROM settings; DELETE FROM whitelist;");
});
afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
  process.argv = originalArgv;
  rmSync(userDataDir, { recursive: true, force: true });
});

it("stores settings and normalized whitelist entries", () => {
  expect(getSetting("missing")).toBeUndefined();
  saveSetting("theme", "dark");
  expect(getSetting("theme")).toBe("dark");
  addWhitelistEntry("USER@Example.COM");
  addWhitelistEntry("user@example.com");
  expect(getWhitelistEntries().map((entry) => entry.value)).toEqual(["user@example.com"]);
  removeWhitelistEntry("USER@EXAMPLE.COM");
  expect(getWhitelistEntries()).toEqual([]);
});

it("configures non-Linux auto launch and honors the hidden launch flag", () => {
  Object.defineProperty(process, "platform", { value: "darwin" });
  process.argv = process.argv.filter((arg) => arg !== "--hidden");
  applyAutoLaunch(true, true);
  expect(mockSetLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, args: ["--hidden"] });
  mockGetLoginItemSettings.mockReturnValue({ wasOpenedAtLogin: true });
  expect(wasLaunchedAsHidden(true)).toBe(true);
  expect(mockGetLoginItemSettings).toHaveBeenCalled();
});

it("writes and removes a Linux autostart entry", () => {
  const configDir = join(userDataDir, "config");
  process.env.XDG_CONFIG_HOME = configDir;
  Object.defineProperty(process, "platform", { value: "linux" });
  applyAutoLaunch(true, true);
  const { readFileSync, existsSync } = require("fs") as typeof import("fs");
  const file = join(configDir, "autostart", "paperweight.desktop");
  expect(readFileSync(file, "utf8")).toContain(`Exec=${process.execPath} --hidden`);
  applyAutoLaunch(false, false);
  expect(existsSync(file)).toBe(false);
  delete process.env.XDG_CONFIG_HOME;
});

it("activates a valid key and uses its cached local validation", async () => {
  mockNetFetch.mockResolvedValue({ ok: true, json: async () => ({ valid: true, tier: "test", portalUrl: "https://portal.test" }) });
  expect(await activateLicense("valid-key")).toEqual({ active: true, tier: "test", key: "valid-key", portalUrl: "https://portal.test", expiresAt: undefined });
  expect(getLicenseStatus()).toMatchObject({ active: true, key: "valid-key", tier: "test" });
  expect(await hasValidLicense()).toBe(true);
  expect(mockNetFetch).toHaveBeenCalledTimes(1);
});

it("rejects invalid keys and expired licenses", async () => {
  mockNetFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: false }) });
  expect(await activateLicense("bad-key")).toEqual({ active: false });
  mockNetFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true, expiresAt: "2000-01-01", tier: "lifetime" }) });
  await activateLicense("old-key");
  expect(getLicenseStatus()).toEqual({ active: false, key: "old-key" });
  expect(await hasValidLicense()).toBe(false);
});

it("revalidates expired cache remotely and preserves local validity when offline", async () => {
  mockNetFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true }) });
  await activateLicense("refresh-key");
  jest.useFakeTimers().setSystemTime(Date.now() + 4 * 24 * 60 * 60 * 1000);
  mockNetFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true, tier: "lifetime" }) });
  expect(await hasValidLicense()).toBe(true);
  mockNetFetch.mockRejectedValueOnce(new Error("offline"));
  jest.setSystemTime(Date.now() + 4 * 24 * 60 * 60 * 1000);
  expect(await hasValidLicense()).toBe(true);
  jest.useRealTimers();
});

it("falls back to response messages for failed license validation", async () => {
  mockNetFetch.mockResolvedValueOnce({ ok: false, status: 503, text: async () => "temporarily unavailable" });
  await expect(activateLicense("key")).rejects.toThrow("temporarily unavailable");
  mockNetFetch.mockResolvedValueOnce({ ok: false, status: 503, text: async () => "" });
  await expect(activateLicense("key")).rejects.toThrow("License validation failed (503)");
});

it("deletes a license and handles missing or malformed storage", async () => {
  expect(getLicenseStatus()).toEqual({ active: false });
  mockNetFetch.mockResolvedValue({ ok: true, json: async () => ({ valid: true }) });
  await activateLicense("delete-me");
  deleteLicense();
  expect(getLicenseStatus()).toEqual({ active: false });
});
