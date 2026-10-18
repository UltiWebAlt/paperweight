const mockHandlers: Record<string, (...args: any[]) => any> = {};
jest.mock("electron", () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => { mockHandlers[channel] = handler; } } }));
jest.mock("../services/account", () => ({ getAccountInfo: jest.fn(() => ({ email: "me@example.test" })) }));
jest.mock("../services/vendors", () => ({
  queryVendors: jest.fn((query) => ({ vendors: [], total: query.limit })),
  updateVendor: jest.fn(), getVendorDetail: jest.fn(() => ({ vendor: { first_seen: 42 }, other: true })), deleteVendor: jest.fn(),
}));

import { IPC } from "@shared/ipc";
import { registerVendorHandlers } from "./vendors";
import { queryVendors, updateVendor } from "../services/vendors";

beforeAll(() => registerVendorHandlers());

it("validates query pagination and sanitizes filter values", () => {
  expect(() => mockHandlers[IPC.queryVendors](null, null)).toThrow("Invalid query");
  expect(() => mockHandlers[IPC.queryVendors](null, { page: 0, limit: 10 })).toThrow("Invalid page");
  const result = mockHandlers[IPC.queryVendors](null, { page: 2, limit: 10, filter: "invalid", sortDir: "sideways", activity: "invalid", piiType: "unknown" });
  expect(result).toEqual({ vendors: [], total: 10 });
  expect(queryVendors).toHaveBeenCalledWith(expect.objectContaining({ page: 2, filter: undefined, sortDir: undefined, activity: undefined, piiType: undefined }));
});

it("validates vendor mutations and normalizes reviewed state", () => {
  expect(() => mockHandlers[IPC.setVendorAccountEmail](null, 1, "invalid")).toThrow("Invalid email");
  expect(() => mockHandlers[IPC.markVendorReviewed](null, "1", true)).toThrow("Invalid vendor id");
  mockHandlers[IPC.markVendorReviewed](null, 1, false);
  expect(updateVendor).toHaveBeenCalledWith(1, { status: undefined });
});

it("adds safe first-activity and account email context to vendor details", () => {
  expect(mockHandlers[IPC.getVendorDetail](null, "acme.test")).toEqual({ vendor: { first_seen: 42 }, other: true, first_activity: 42, user_email: "me@example.test" });
});
