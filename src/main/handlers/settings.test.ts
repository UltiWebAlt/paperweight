const mockHandlers: Record<string, (...args: any[]) => any> = {};
const mockOnHandlers: Record<string, (...args: any[]) => any> = {};
const mockOpenExternal = jest.fn();
jest.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => { mockHandlers[channel] = handler; },
    on: (channel: string, handler: (...args: any[]) => any) => { mockOnHandlers[channel] = handler; },
  },
  shell: { openExternal: (...args: any[]) => mockOpenExternal(...args) },
}));
jest.mock("../services/settings", () => ({
  activateLicense: jest.fn(), getLicenseStatus: jest.fn(), deleteLicense: jest.fn(), applyAutoLaunch: jest.fn(),
  getSetting: jest.fn(() => "false"), saveSetting: jest.fn(),
}));
jest.mock("../credentials", () => ({ getActiveEmail: jest.fn(() => "me@example.test"), loadCredentials: jest.fn(() => ({ providerType: "gmail" })) }));
jest.mock("../sync-manager", () => ({ stopSync: jest.fn(), startAllSyncs: jest.fn() }));
jest.mock("../services/gmailSyncSettings", () => ({ saveGmailFolderSettings: jest.fn() }));
jest.mock("../services/globalSettings", () => ({ getGlobalSetting: jest.fn(), saveGlobalSetting: jest.fn() }));
jest.mock("../services/appSettings", () => ({ buildAppSettings: jest.fn(() => ({ userName: "Alex" })) }));
jest.mock("../utils/log", () => ({ dataLog: { info: jest.fn() } }));

import { IPC } from "@shared/ipc";
import { registerSettingsHandlers } from "./settings";
import { saveSetting } from "../services/settings";
import { saveGlobalSetting } from "../services/globalSettings";

beforeAll(() => registerSettingsHandlers());

it("validates and saves ordinary app settings", async () => {
  await expect(mockHandlers[IPC.saveSettings](null, null)).rejects.toThrow("Invalid settings");
  await expect(mockHandlers[IPC.saveSettings](null, { userName: 42 })).rejects.toThrow("Invalid userName");
  await mockHandlers[IPC.saveSettings](null, { userName: "Riley", colorTheme: "dim" });
  expect(saveSetting).toHaveBeenCalledWith("userName", "Riley");
  expect(saveGlobalSetting).toHaveBeenCalledWith("colorTheme", "dim");
});

it("allows only supported external URL protocols", () => {
  mockHandlers[IPC.openExternal](null, "javascript:alert(1)");
  mockHandlers[IPC.openExternal](null, "not a url");
  expect(mockOpenExternal).not.toHaveBeenCalled();
  mockHandlers[IPC.openExternal](null, "https://example.test");
  mockHandlers[IPC.openExternal](null, "mailto:support@example.test");
  expect(mockOpenExternal).toHaveBeenCalledTimes(2);
});

it("returns app settings through the synchronous IPC channel", () => {
  const event: { returnValue?: unknown } = {};
  mockOnHandlers[IPC.getSettings](event);
  expect(event.returnValue).toEqual({ userName: "Alex" });
});
