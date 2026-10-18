import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const mockPaths: Record<string, string> = {};
const mockAccounts = [{ email: "me@example.test" }];
jest.mock("electron", () => ({ app: { getPath: (name: string) => mockPaths[name], getAppPath: () => mockPaths.app } }));
jest.mock("@electron-toolkit/utils", () => ({ is: { dev: true } }));
jest.mock("../credentials", () => ({ listAccounts: () => mockAccounts, emailToFileKey: () => "account" }));

import { accountDbBytes, getStorageBreakdown } from "./storage";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "paperweight-storage-test-"));
  const userData = join(root, "user-data");
  const logs = join(userData, "logs");
  const resources = join(root, "resources");
  mkdirSync(join(userData, "Cache"), { recursive: true });
  mkdirSync(logs, { recursive: true });
  mkdirSync(resources, { recursive: true });
  writeFileSync(join(userData, "account.db"), "1234567");
  writeFileSync(join(userData, "account.db-wal"), "12");
  writeFileSync(join(userData, "Cache", "cache.bin"), "0123456789");
  writeFileSync(join(logs, "main.log"), "log");
  writeFileSync(join(userData, "settings.json"), "data");
  writeFileSync(join(resources, "companies.db"), "12345");
  Object.assign(mockPaths, { userData, logs, app: root });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it("counts account sidecars and separates cache, logs, app data and resources", () => {
  expect(accountDbBytes("me@example.test")).toBe(9);
  expect(getStorageBreakdown()).toEqual({
    accounts: [{ email: "me@example.test", sizeBytes: 9 }],
    accountsTotalBytes: 9,
    cacheBytes: 10,
    logsBytes: 3,
    appDataBytes: 4,
    resourcesBytes: 5,
    runtimeBytes: 0,
    totalBytes: 31,
  });
});
