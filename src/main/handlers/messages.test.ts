const mockHandlers: Record<string, (...args: any[]) => any> = {};
const mockGetMessages = jest.fn();
const mockLog = { info: jest.fn(), error: jest.fn() };
jest.mock("electron", () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => { mockHandlers[channel] = handler; } } }));
jest.mock("../services/messages", () => ({ getAllUnsubscribeMethodsForVendor: jest.fn(), getMessagesByEmail: (...args: any[]) => mockGetMessages(...args), getMessagesByVendor: (...args: any[]) => mockGetMessages(...args), markUnsubscribed: jest.fn(), markVendorUnsubscribed: jest.fn() }));
jest.mock("../services/settings", () => ({ addWhitelistEntry: jest.fn(), removeWhitelistEntry: jest.fn(), getWhitelistEntries: jest.fn() }));
jest.mock("../utils/log", () => ({ actionLog: mockLog }));

import { IPC } from "@shared/ipc";
import { registerMessageHandlers } from "./messages";

beforeAll(() => registerMessageHandlers());

it("validates message queries and whitelist input", () => {
  expect(() => mockHandlers[IPC.getMessagesByEmail](null, "bad", 5)).toThrow("Invalid email");
  expect(() => mockHandlers[IPC.getMessagesByEmail](null, "a@example.test", 0)).toThrow("Invalid limit");
  expect(() => mockHandlers[IPC.getVendorMessages](null, 1, 101)).toThrow("Invalid limit");
  expect(() => mockHandlers[IPC.addWhitelistEntry](null, "bad input")).toThrow("Invalid value");
  mockHandlers[IPC.getMessagesByEmail](null, "a@example.test", 5);
  expect(mockGetMessages).toHaveBeenCalledWith("a@example.test", 5);
});

it("restricts one-click unsubscribe to HTTPS and reports remote failures", async () => {
  await expect(mockHandlers[IPC.executeRfc8058](null, "http://example.test")).rejects.toThrow("Invalid URL: must be https");
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as any;
  await expect(mockHandlers[IPC.executeRfc8058](null, "https://example.test/unsub")).resolves.toEqual({ success: false, error: "Server returned HTTP 503" });
});
