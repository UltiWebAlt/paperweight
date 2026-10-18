/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Activity from "./Activity";

const api = { getActivityLog: jest.fn() };
const setup = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Activity /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(window, "api", { configurable: true, value: api });
});

it("loads activity and navigates to the vendor and related case", async () => {
  api.getActivityLog.mockResolvedValue({
    total: 1,
    entries: [{ id: 1, vendorId: 5, vendorName: "Acme", vendorSlug: "acme", actionType: "unsubscribed", messageCount: 2, sizeBytes: 2048, actionedAt: 1_700_000_000_000, caseId: 9 }],
  });
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "Unsubscribed" }));
  expect(await screen.findByText("Acme")).toBeTruthy();
  expect(api.getActivityLog).toHaveBeenCalledWith(50, 0);
});

it("shows the empty state", async () => {
  api.getActivityLog.mockResolvedValue({ total: 0, entries: [] });
  setup();
  expect(await screen.findByText(/No activity yet/)).toBeTruthy();
});
