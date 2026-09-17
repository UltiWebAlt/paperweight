import { loadSyncPage, saveSyncPage, clearSyncPage } from "./sync-pagination";
import { getSetting, saveSetting } from "./settings";
jest.mock("./settings", () => ({ getSetting: jest.fn(), saveSetting: jest.fn() }));
const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  jest.mocked(getSetting).mockImplementation((key) => values.get(key));
  jest.mocked(saveSetting).mockImplementation((key, value) => { values.set(key, value); });
});

test("resuming an incremental page preserves its date query after the clock advances", () => {
  saveSyncPage("incremental", { since: 100, pageToken: "page-two" });
  expect(loadSyncPage("incremental", { since: 200 })).toEqual({ since: 100, pageToken: "page-two" });
});

test("resumes a historical page and its accumulated count", () => {
  const page = { since: 100, until: 200, pageToken: "page-three", fetched: 100 };
  saveSyncPage("historical", page);
  expect(loadSyncPage("historical", { since: 100, until: 200 })).toEqual(page);
});

test("does not reuse a historical token for another date window", () => {
  saveSyncPage("historical", { since: 100, until: 200, pageToken: "old" });
  expect(loadSyncPage("historical", { since: 0, until: 100 })).toEqual({ since: 0, until: 100 });
});

test("clearing completed or reset sync removes the saved page", () => {
  saveSyncPage("incremental", { since: 100, pageToken: "old" });
  clearSyncPage("incremental");
  expect(loadSyncPage("incremental", { since: 200 })).toEqual({ since: 200 });
});

test("invalid saved data restarts the window", () => {
  values.set("incremental", "broken-json");
  expect(loadSyncPage("incremental", { since: 200 })).toEqual({ since: 200 });
});
