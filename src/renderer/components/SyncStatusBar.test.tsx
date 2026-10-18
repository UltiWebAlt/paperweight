/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import SyncStatusBar from "./SyncStatusBar";

const api = { onSyncProgress: jest.fn(), getSyncStatus: jest.fn(), startSync: jest.fn(), getAccountInfo: jest.fn(), startGmailAuth: jest.fn(), startMicrosoftAuth: jest.fn() };
let progress: (status: any) => void;
beforeEach(() => {
  jest.clearAllMocks();
  api.onSyncProgress.mockImplementation((callback) => { progress = callback; return jest.fn(); });
  api.getSyncStatus.mockResolvedValue({ running: false, progress: 0, total: 0, message: "", analysisPending: true });
  api.getAccountInfo.mockResolvedValue({ email: "me@example.test", providerType: "gmail" });
  api.startGmailAuth.mockResolvedValue({ success: true });
  Object.defineProperty(window, "api", { configurable: true, value: api });
});

it("refreshes pending analysis and displays progress states", async () => {
  render(<SyncStatusBar />);
  expect(await screen.findByText("Refresh to analyze messages")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(api.startSync).toHaveBeenCalled();
  act(() => progress({ running: true, progress: 3, total: 10, message: "Syncing", phase: "historical", historicalCursor: Date.UTC(2024, 0, 1) }));
  expect(screen.getByText("Syncing history")).toBeTruthy();
  expect(screen.getByText(/back to/)).toBeTruthy();
});

it("reconnects OAuth accounts after an invalid grant", async () => {
  render(<SyncStatusBar />);
  await screen.findByText("Refresh to analyze messages");
  act(() => progress({ running: false, progress: 0, total: 0, message: "", error: "Gmail authorization expired" }));
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  await screen.findByText("Sync failed");
  expect(api.startGmailAuth).toHaveBeenCalledWith({ type: "reconnect", email: "me@example.test" });
  expect(api.startSync).toHaveBeenCalled();
});
