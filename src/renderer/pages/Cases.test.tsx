/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Cases from "./Cases";

const cases = [
  { id: 1, vendorId: 1, vendorName: "Acme", requestType: "deletion", status: "active", openedAt: 10, hasUnseenReply: true, nextAction: "reminder" },
  { id: 2, vendorId: 2, vendorName: "Beta", requestType: "access", status: "closed", openedAt: 20, hasUnseenReply: false },
  { id: 3, vendorId: 3, vendorName: "Gamma", requestType: "access", status: "active", openedAt: 30, hasUnseenReply: false },
];
const api = { queryGdprCases: jest.fn(), onSyncProgress: jest.fn() };
let syncDone: (status: { running: boolean }) => void;
beforeEach(() => {
  jest.clearAllMocks();
  api.queryGdprCases.mockResolvedValue(cases);
  api.onSyncProgress.mockImplementation((callback) => { syncDone = callback; return jest.fn(); });
  Object.defineProperty(window, "api", { configurable: true, value: api });
});
const setup = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Cases /></MemoryRouter>);

it("filters by status and search, clears filters, and opens a case", async () => {
  setup();
  await screen.findByText("Acme");
  expect(screen.queryByText("Beta")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Closed" }));
  expect(screen.getByText("Beta")).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "missing" } });
  expect(screen.getByText(/No cases match/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "clear all" }));
  fireEvent.click(screen.getByRole("button", { name: /Acme/ }));
  await waitFor(() => expect(api.onSyncProgress).toHaveBeenCalled());
});

it("refreshes on sync completion and renders the empty state", async () => {
  const view = setup();
  await screen.findByText("Acme");
  api.queryGdprCases.mockResolvedValueOnce([]);
  syncDone({ running: false });
  expect(await screen.findByText(/No cases yet/)).toBeTruthy();
  view.unmount();
});
