/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Support from "./Support";

jest.mock("../components/DeviceInfoCard", () => ({ __esModule: true, default: () => <div>Device info</div> }));
jest.mock("../components/HelpSection", () => ({ __esModule: true, default: () => <div>Help</div> }));
const api = { getSupportInfo: jest.fn(), getStorageBreakdown: jest.fn(), readLogFile: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  api.getSupportInfo.mockResolvedValue({ providerType: "gmail", totalMessages: 23, lastSyncAt: 0, logPath: "/tmp/main.log" });
  api.getStorageBreakdown.mockResolvedValue({ accountsTotalBytes: 1024, accounts: [], cacheBytes: 0, logsBytes: 0, appDataBytes: 0, resourcesBytes: 0, runtimeBytes: 0, totalBytes: 1024 });
  api.readLogFile.mockResolvedValue("initial log");
  Object.defineProperty(window, "api", { configurable: true, value: api });
});

it("loads diagnostics and refreshes the log viewer", async () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Support /></MemoryRouter>);
  expect(await screen.findByText("Gmail (OAuth)")).toBeTruthy();
  expect(screen.getByText("23")).toBeTruthy();
  expect(screen.getByDisplayValue("initial log")).toBeTruthy();
  api.readLogFile.mockResolvedValueOnce("refreshed log");
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByDisplayValue("refreshed log")).toBeTruthy();
});
