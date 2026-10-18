/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Accounts from "./Accounts";

const vendors = [
  { id: 1, name: "Acme", root_domain: "acme.test", message_count: 4, risk_level: "high", category_id: "financial", last_seen: 100, status: undefined },
  { id: 2, name: "Beta", root_domain: "beta.test", message_count: 1, risk_level: "low", category_id: "entertainment", last_seen: 200, status: "reviewed" },
];
const api = { queryVendors: jest.fn(), addWhitelistEntry: jest.fn(), markVendorReviewed: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close = function close() { this.open = false; };
  api.queryVendors.mockResolvedValue({ vendors, total: vendors.length });
  Object.defineProperty(window, "api", { configurable: true, value: api });
});
const setup = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Accounts /></MemoryRouter>);

it("loads companies, searches, sorts, and clears filters", async () => {
  setup();
  await screen.findByText("Acme");
  fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "Beta" } });
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ search: "Beta" })));
  expect(screen.getByText("Beta")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "clear all" }));
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ search: undefined })));
});

it("applies a breached preset and opens reviewed controls", async () => {
  setup();
  await screen.findByText("Acme");
  fireEvent.click(screen.getByRole("button", { name: "Breached" }));
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ onBreachList: true })));
  fireEvent.click(screen.getAllByRole("button", { name: "Mark reviewed" })[0]);
  expect(await screen.findByText(/mark as reviewed/i)).toBeTruthy();
});
