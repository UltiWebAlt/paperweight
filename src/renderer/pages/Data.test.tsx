/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Data from "./Data";
import type { PiiValue } from "@shared/types";

const values: PiiValue[] = [
  { ref: 1, type: "email", maskedValue: "m***@example.com", lastSeen: 3, companyCount: 2, isMatch: true },
  { ref: 2, type: "phone", maskedValue: "+31 *** 678", lastSeen: 2, companyCount: 1 },
];
const suppressed: PiiValue = { ref: 3, type: "email", maskedValue: "x***@example.com", lastSeen: 1, companyCount: 1 };
const api = { getPiiOverview: jest.fn(), revealPiiValues: jest.fn(), onSyncProgress: jest.fn() };
let syncProgress: (status: { running: boolean }) => void;
beforeEach(() => {
  jest.clearAllMocks();
  api.getPiiOverview.mockResolvedValue({ values, suppressedValues: [suppressed] });
  api.revealPiiValues.mockResolvedValue([{ ref: 1, value: "me@example.com" }]);
  api.onSyncProgress.mockImplementation((callback) => { syncProgress = callback; return jest.fn(); });
  Object.defineProperty(window, "api", { configurable: true, value: api });
});
const setup = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Data /></MemoryRouter>);

it("searches masked values and filters confirmed and suppressed values separately", async () => {
  setup();
  await screen.findByText("m***@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Match" }));
  expect(screen.queryByText("+31 *** 678")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "clear all" }));
  fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "phone" } });
  expect(screen.getByText("+31 *** 678")).toBeTruthy();
  expect(screen.queryByText("m***@example.com")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "clear all" }));
  fireEvent.click(screen.getByTitle("Values you marked as not yours"));
  expect(screen.getByText("x***@example.com")).toBeTruthy();
  expect(screen.queryByText("m***@example.com")).toBeNull();
});

it("reveals data only by request and searches full values only while revealed", async () => {
  setup();
  await screen.findByText("m***@example.com");
  expect(api.revealPiiValues).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show values" }));
  await screen.findByText("me@example.com");
  fireEvent.click(screen.getByRole("button", { name: "Hide values" }));
  expect(screen.queryByText("me@example.com")).toBeNull();
});

it("refreshes on completed sync and explains an empty mailbox", async () => {
  setup();
  await screen.findByText("m***@example.com");
  api.getPiiOverview.mockResolvedValueOnce({ values: [], suppressedValues: [] });
  await act(async () => syncProgress({ running: false }));
  expect(screen.getByText(/No personal data found yet/)).toBeTruthy();
});

it("shows a useful error after a failed overview load", async () => {
  const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
  api.getPiiOverview.mockRejectedValueOnce(new Error("Unavailable"));
  try { setup(); await screen.findByText(/Could not load what was found/); }
  finally { log.mockRestore(); }
});
