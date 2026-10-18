/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AccountDetail from "./AccountDetail";

const detail = {
  vendor: { id: 4, name: "Acme", root_domain: "acme.test", message_count: 2, risk_level: "high", category_id: "financial", status: undefined },
  company: { slug: "acme", name: "Acme", web: "https://acme.test" },
  senders: [{ sender_email: "billing@acme.test", sender_name: "Acme Billing", message_count: 2 }],
  bulkMessages: [], bulkMessageCount: 0, accountMessages: [], allMessages: [], activityLog: [], receivedAddresses: [],
};
const api = {
  getVendorDetail: jest.fn(), getWhitelistEntries: jest.fn(), getSettings: jest.fn(), getAccountInfo: jest.fn(),
  queryGdprCases: jest.fn(), onSyncProgress: jest.fn(), markVendorReviewed: jest.fn(), getVendorPiiSummary: jest.fn(),
};
beforeEach(() => {
  jest.clearAllMocks();
  api.getVendorDetail.mockResolvedValue(detail);
  api.getWhitelistEntries.mockResolvedValue([]);
  api.getSettings.mockResolvedValue({ userName: "Alex" });
  api.getAccountInfo.mockResolvedValue({ providerType: "gmail", email: "me@example.test" });
  api.queryGdprCases.mockResolvedValue([]);
  api.onSyncProgress.mockReturnValue(jest.fn());
  api.markVendorReviewed.mockResolvedValue(undefined);
  api.getVendorPiiSummary.mockResolvedValue({ values: [], suppressedValues: [], scannedMessages: 0 });
  Object.defineProperty(window, "api", { configurable: true, value: api });
});
const setup = () => render(<MemoryRouter initialEntries={["/accounts/acme.test"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/accounts/:groupKey" element={<AccountDetail />} /></Routes></MemoryRouter>);

it("loads account details, switches tabs, and updates review state", async () => {
  setup();
  await screen.findByRole("heading", { name: "Acme" });
  fireEvent.click(screen.getByRole("button", { name: "Mark as reviewed" }));
  expect(api.markVendorReviewed).toHaveBeenCalledWith(4, true);
  expect(await screen.findByRole("button", { name: "Undo review" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: /Emails/ }));
  expect(screen.getByText(/No emails found/)).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: /Cases/ }));
  expect(screen.getByText(/No cases yet/)).toBeTruthy();
});

it("shows a recoverable error when the company detail cannot be loaded", async () => {
  api.getVendorDetail.mockRejectedValueOnce(new Error("Company unavailable"));
  setup();
  expect(await screen.findByText("Company unavailable")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Back to overview/ })).toBeTruthy();
});
