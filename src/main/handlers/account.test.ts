const mockHandlers: Record<string, (...args: any[]) => any> = {};
const mockOnHandlers: Record<string, (...args: any[]) => any> = {};
const mockMarkRead = jest.fn();
const mockSendEmail = jest.fn();
jest.mock("electron", () => ({
  app: { getPath: () => "/tmp" },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => { mockHandlers[channel] = handler; },
    on: (channel: string, handler: (...args: any[]) => any) => { mockOnHandlers[channel] = handler; },
  },
}));
jest.mock("../services/account", () => ({
  markMessageAsRead: (...args: any[]) => mockMarkRead(...args),
}));
jest.mock("../services/sync", () => ({}));
jest.mock("../services/storage", () => ({}));
jest.mock("../providers/ProviderFactory", () => ({ getProvider: () => ({ type: "gmail", sendEmail: (...args: any[]) => mockSendEmail(...args) }) }));
jest.mock("../sync-manager", () => ({}));
jest.mock("../services/settings", () => ({}));
jest.mock("../services/stats", () => ({}));
jest.mock("../credentials", () => ({}));
jest.mock("../db", () => ({}));
jest.mock("../globalDb", () => ({}));
jest.mock("../utils/log", () => ({ dataLog: { info: jest.fn(), warn: jest.fn() }, actionLog: { info: jest.fn(), error: jest.fn() } }));
jest.mock("../utils/file-log", () => ({ getFileLogPath: () => undefined }));
jest.mock("../services/accountHealth", () => ({}));

import { IPC } from "@shared/ipc";
import { registerAccountHandlers } from "./account";

beforeAll(() => registerAccountHandlers());

it("rejects malformed authentication and server configuration input", async () => {
  expect(() => mockHandlers[IPC.startGmailAuth](null, "add", true)).toThrow("Invalid account auth intent");
  expect(() => mockHandlers[IPC.saveImapConfig](null, { type: "add" }, {})).toThrow("Invalid IMAP config");
  expect(() => mockHandlers[IPC.updateServerConfig](null, { imap: {}, smtp: {} })).toThrow("Invalid server config");
  expect(() => mockHandlers[IPC.markMessageAsRead](null, 3, "yes")).toThrow("Invalid message ID");
  expect(() => mockHandlers[IPC.markMessageAsRead](null, "msg-1", "yes")).toThrow("Invalid isRead flag");
});

it("validates outgoing mail and forwards valid messages to the selected provider", async () => {
  await expect(mockHandlers[IPC.sendEmail](null, "bad-address", "subject", "body")).rejects.toThrow("Invalid recipient");
  mockSendEmail.mockResolvedValue("sent-id");
  await expect(mockHandlers[IPC.sendEmail](null, "person@example.test", "Hello", "Body", "reply-id"))
    .resolves.toEqual({ success: true, messageId: "sent-id" });
  expect(mockSendEmail).toHaveBeenCalledWith("person@example.test", "Hello", "Body", "reply-id");
});

it("returns an empty log if no readable log file exists", () => {
  expect(mockHandlers[IPC.readLogFile]()).toBe("");
});
