/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AppShell from "./AppShell";

jest.mock("./SyncStatusBar", () => ({ __esModule: true, default: () => <div>Sync status</div> }));
jest.mock("../hooks/useAccounts", () => ({ useAccounts: () => ({ accounts: [
  { email: "one@example.test", label: "Primary", isActive: true },
  { email: "two@example.test", label: "Secondary", isActive: false },
] }) }));
const api = { getUnseenCaseReplyCount: jest.fn(), onSyncProgress: jest.fn(), switchAccount: jest.fn() };
let sync: (status: { running: boolean }) => void;
beforeEach(() => {
  jest.clearAllMocks();
  api.getUnseenCaseReplyCount.mockResolvedValue(12);
  api.onSyncProgress.mockImplementation((callback) => { sync = callback; return jest.fn(); });
  api.switchAccount.mockRejectedValue(new Error("Offline"));
  Object.defineProperty(window, "api", { configurable: true, value: api });
});
const setup = () => render(<MemoryRouter initialEntries={["/dashboard"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route element={<AppShell />}><Route path="*" element={<div>Page content</div>} /></Route></Routes></MemoryRouter>);

it("renders navigation and refreshes unseen reply badges after sync and case-view events", async () => {
  setup();
  expect(await screen.findAllByText("9+")).toHaveLength(2);
  expect(screen.getByRole("link", { name: /Dashboard/ })).toBeTruthy();
  api.getUnseenCaseReplyCount.mockResolvedValue(2);
  await act(async () => sync({ running: false }));
  expect(await screen.findAllByText("2")).toHaveLength(2);
  api.getUnseenCaseReplyCount.mockResolvedValue(0);
  await act(async () => window.dispatchEvent(new Event("case-viewed")));
  await waitFor(() => expect(screen.queryByText("2")).toBeNull());
});

it("shows account switching failures and lets the user dismiss them", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: /Primary/ }));
  fireEvent.click(screen.getByRole("button", { name: "Secondary" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/Could not switch accounts/);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByRole("alert")).toBeNull();
});
