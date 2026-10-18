/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";

jest.mock("../components/TrendChartCard", () => ({ __esModule: true, default: () => <div>Daily emails chart</div> }));
jest.mock("../components/ImpactBlock", () => ({ __esModule: true, default: () => <div>Impact</div> }));

const api = {
  getDashboardStats: jest.fn(), getDashboardTrend: jest.fn(), getAccountInfo: jest.fn(),
  queryGdprCases: jest.fn(), onSyncProgress: jest.fn(),
};
const stats = { totalMessages: 12, uniqueVendors: 3, mailingListCount: 2, breachedCount: 1, mailingListsActioned: 1, activeSubscriptions: 2, reviewedVendors: 1, highRiskUnreviewed: 1 };
let syncProgress: (status: { running: boolean }) => void;
const unsubscribe = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  api.getDashboardStats.mockResolvedValue(stats);
  api.getDashboardTrend.mockResolvedValue({ labels: [], series: [], markers: [] });
  api.getAccountInfo.mockResolvedValue({ providerType: "imap", server: { imap: { host: "imap.example.com" } } });
  api.queryGdprCases.mockResolvedValue([{ nextAction: "reminder" }]);
  api.onSyncProgress.mockImplementation((callback) => { syncProgress = callback; return unsubscribe; });
  Object.defineProperty(window, "api", { configurable: true, value: api });
});

function setup() { return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Dashboard /></MemoryRouter>); }

it("renders keyboard-accessible navigation for stats and action items", async () => {
  setup();
  const settings = await screen.findByRole("link", { name: /Finish setting up/ });
  expect(settings.getAttribute("href")).toBe("/settings");
  expect(screen.getByRole("link", { name: /Emails 12/ }).getAttribute("href")).toBe("/dashboard");
  expect(screen.getByRole("link", { name: /Lists 2/ }).getAttribute("href")).toBe("/mail");
  expect(screen.getByRole("link", { name: /account is on a known/ }).getAttribute("href")).toBe("/accounts");
  expect(screen.getByRole("link", { name: /data request needs/ }).getAttribute("href")).toBe("/cases");
  fireEvent.click(screen.getByRole("button", { name: /View activity/ }));
});

it("shows the empty state without an SMTP prompt for OAuth accounts", async () => {
  api.getAccountInfo.mockResolvedValue({ providerType: "gmail" });
  api.getDashboardStats.mockResolvedValue({ ...stats, breachedCount: 0, activeSubscriptions: 0, highRiskUnreviewed: 0 });
  api.queryGdprCases.mockResolvedValue([]);
  setup();
  await screen.findByText("You're all caught up");
  expect(screen.queryByText("Finish setting up your account")).toBeNull();
});

it("refreshes committed data on sync completion and unsubscribes when unmounted", async () => {
  const view = setup();
  await screen.findByText("Daily emails chart");
  act(() => syncProgress({ running: false }));
  await waitFor(() => expect(api.getDashboardStats).toHaveBeenCalledTimes(2));
  view.unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it("recovers the loading screen when a dashboard request fails", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
  api.getDashboardStats.mockRejectedValueOnce(new Error("Database unavailable"));
  try {
    setup();
    await screen.findByText("You're all caught up");
    expect(log).toHaveBeenCalled();
  } finally { log.mockRestore(); }
});
