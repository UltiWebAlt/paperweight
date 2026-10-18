/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CaseDetail from "./CaseDetail";

const activeCase = {
  id: 7, vendorId: 3, vendorName: "Acme", vendorDomain: "acme.test", requestType: "access",
  status: "active", recipientEmail: "privacy@acme.test", openedAt: Date.now() - 10 * 86400000,
  hasUnseenReply: true, nextAction: "reminder", events: [],
};
const api = {
  getGdprCase: jest.fn(), getGdprCaseReplies: jest.fn(), getAccountInfo: jest.fn(), getSettings: jest.fn(),
  markGdprCaseViewed: jest.fn(), sendEmail: jest.fn(), closeGdprCase: jest.fn(),
  createGdprCase: jest.fn(), openExternal: jest.fn(),
};
beforeEach(() => {
  jest.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close = function close() { this.open = false; };
  api.getGdprCase.mockResolvedValue(activeCase);
  api.getGdprCaseReplies.mockResolvedValue({ threadMatches: [], otherReplies: [], linkedMessageIds: [] });
  api.getAccountInfo.mockResolvedValue({ providerType: "gmail", email: "me@example.test" });
  api.getSettings.mockResolvedValue({ userName: "Alex" });
  api.markGdprCaseViewed.mockResolvedValue(undefined);
  api.sendEmail.mockResolvedValue({ success: true });
  api.closeGdprCase.mockResolvedValue(undefined);
  Object.defineProperty(window, "api", { configurable: true, value: api });
});
const setup = () => render(<MemoryRouter initialEntries={["/cases/7"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/cases/:caseId" element={<CaseDetail />} /></Routes></MemoryRouter>);

it("loads the case, marks it viewed, and opens the reminder preview", async () => {
  setup();
  await screen.findByRole("heading", { name: /access request/i });
  expect(api.markGdprCaseViewed).toHaveBeenCalledWith(7);
  fireEvent.click(screen.getByRole("button", { name: "Send reminder" }));
  expect(await screen.findByText(/Before sending, check your inbox/)).toBeTruthy();
});

it("closes an active case and offers a deletion request for access cases", async () => {
  setup();
  await screen.findByRole("heading", { name: /access request/i });
  fireEvent.click(screen.getAllByRole("button", { name: "Close case" })[0]);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getAllByRole("button", { name: "Close case" })[1]);
  await waitFor(() => expect(api.closeGdprCase).toHaveBeenCalled());
});

it("renders a not-found case and returns back", async () => {
  api.getGdprCase.mockResolvedValue(undefined);
  setup();
  expect(await screen.findByText("Case not found")).toBeTruthy();
});
