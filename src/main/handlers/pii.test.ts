const mockHandlers = new Map<string, (...args: unknown[]) => unknown>();
jest.mock("electron", () => ({ ipcMain: { handle: jest.fn((channel: string, fn: (...args: unknown[]) => unknown) => mockHandlers.set(channel, fn)) } }));
jest.mock("../services/pii", () => Object.fromEntries(["confirmPiiFinding", "getPiiOverview", "getPiiValueCompanies", "getVendorPiiSummary", "revealPiiValues", "revealVendorPiiValues", "suppressPiiFinding"].map((key) => [key, jest.fn((...args: unknown[]) => ({ key, args }))])));
jest.mock("../sync-manager", () => ({ markProfileAnalysisStale: jest.fn() }));
import { IPC } from "@shared/ipc";
import { registerPiiHandlers } from "./pii";
import * as pii from "../services/pii";
import { markProfileAnalysisStale } from "../sync-manager";

beforeAll(() => registerPiiHandlers());
const call = (channel: string, ...args: unknown[]) => mockHandlers.get(channel)!({}, ...args);

it("validates identifiers and defaults value ordering to recent", () => {
  expect(() => call(IPC.getVendorPiiSummary, "4")).toThrow("Invalid vendor id");
  expect(call(IPC.getVendorPiiSummary, 4)).toEqual({ key: "getVendorPiiSummary", args: [4] });
  expect(() => call(IPC.getPiiValueCompanies, 0, "oldest")).toThrow("Invalid finding reference");
  call(IPC.getPiiValueCompanies, 2, "unexpected");
  call(IPC.getPiiValueCompanies, 3, "oldest");
  expect(pii.getPiiValueCompanies).toHaveBeenNthCalledWith(1, 2, "recent");
  expect(pii.getPiiValueCompanies).toHaveBeenNthCalledWith(2, 3, "oldest");
});

it("delegates reveal, confirm and suppress operations and marks confirmed profiles stale", () => {
  call(IPC.getPiiOverview);
  call(IPC.revealPiiValues);
  call(IPC.revealVendorPiiValues, 7);
  expect(() => call(IPC.revealVendorPiiValues, "7")).toThrow("Invalid vendor id");
  call(IPC.confirmPiiFinding, 1);
  expect(markProfileAnalysisStale).toHaveBeenCalledTimes(1);
  expect(() => call(IPC.confirmPiiFinding, -1)).toThrow("Invalid finding reference");
  call(IPC.suppressPiiFinding, 2);
  expect(() => call(IPC.suppressPiiFinding, 1.5)).toThrow("Invalid finding reference");
});
