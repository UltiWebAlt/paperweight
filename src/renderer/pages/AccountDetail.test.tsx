/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AccountDetail from "./AccountDetail";

const detail = {
  vendor: { id: 4, name: "Acme", root_domain: "acme.test", message_count: 2, risk_level: "high", category_id: "financial", status: undefined },
  company: { slug: "acme", name: "Acme", web: "https://acme.test" },
  senders: [{ sender_email: "billing@acme.test", sender_name: "Acme Billing", message_count: 2 }],
  bulkMessages: [], bulkMessageCount: 0, accountMessages: [], allMessages: [], activityLog: [], receivedAddresses: [], user_email: "me@example.test",
};
const api = {
  getVendorDetail: jest.fn(), getWhitelistEntries: jest.fn(), getSettings: jest.fn(), getAccountInfo: jest.fn(),
  queryGdprCases: jest.fn(), onSyncProgress: jest.fn(), markVendorReviewed: jest.fn(), getVendorPiiSummary: jest.fn(),
  addWhitelistEntry: jest.fn(), removeWhitelistEntry: jest.fn(), setVendorAccountEmail: jest.fn(), saveSettings: jest.fn(),
  sendEmail: jest.fn(), createGdprCase: jest.fn(), trashVendorMessages: jest.fn(), reportSpamVendor: jest.fn(),
  executeRfc8058: jest.fn(), markVendorUnsubscribed: jest.fn(), openExternal: jest.fn(),
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  jest.clearAllMocks();
  api.getVendorDetail.mockResolvedValue(detail);
  api.getWhitelistEntries.mockResolvedValue([]);
  api.getSettings.mockResolvedValue({ userName: "Alex" });
  api.getAccountInfo.mockResolvedValue({ providerType: "gmail", email: "me@example.test" });
  api.queryGdprCases.mockResolvedValue([]);
  api.onSyncProgress.mockReturnValue(jest.fn());
  api.markVendorReviewed.mockResolvedValue(undefined);
  api.getVendorPiiSummary.mockResolvedValue({ values: [], suppressedValues: [], scannedMessages: 0 });
  api.addWhitelistEntry.mockResolvedValue(undefined);
  api.removeWhitelistEntry.mockResolvedValue(undefined);
  api.setVendorAccountEmail.mockResolvedValue(undefined);
  api.saveSettings.mockResolvedValue(undefined);
  api.sendEmail.mockResolvedValue({ success: true, messageId: "sent-message" });
  api.createGdprCase.mockResolvedValue({ id: 99 });
  api.trashVendorMessages.mockResolvedValue({ success: true });
  api.reportSpamVendor.mockResolvedValue({ success: true });
  api.executeRfc8058.mockResolvedValue({ success: true });
  api.markVendorUnsubscribed.mockResolvedValue(undefined);
  api.openExternal.mockResolvedValue(undefined);
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

it("builds and sends a data request, persists the account email, and opens a case", async () => {
  setup();
  await screen.findByRole("heading", { name: "Acme" });
  fireEvent.click(screen.getByRole("tab", { name: "Data requests" }));
  expect(await screen.findByRole("button", { name: "Send request" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Send request" }));
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(api.createGdprCase).toHaveBeenCalledWith(expect.objectContaining({
    vendorId: 4,
    requestType: "deletion",
    recipientEmail: "billing@acme.test",
    sentMessageId: "sent-message",
  })));
  expect(api.setVendorAccountEmail).toHaveBeenCalledWith(4, "me@example.test");
});

it("adds selected domain and sender addresses to the whitelist", async () => {
  setup();
  await screen.findByRole("heading", { name: "Acme" });
  fireEvent.click(screen.getByRole("button", { name: "Add to whitelist" }));
  const checkboxes = await screen.findAllByRole("checkbox");
  checkboxes.forEach((checkbox) => fireEvent.click(checkbox));
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(api.addWhitelistEntry).toHaveBeenCalledTimes(2));
  expect(api.addWhitelistEntry).toHaveBeenCalledWith("acme.test");
  expect(api.addWhitelistEntry).toHaveBeenCalledWith("billing@acme.test");
});

it("confirms deleting all vendor email and refreshes the details", async () => {
  setup();
  await screen.findByRole("heading", { name: "Acme" });
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));
  await waitFor(() => expect(api.trashVendorMessages).toHaveBeenCalledWith(4));
  expect(api.getVendorDetail).toHaveBeenCalledTimes(2);
});
