/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Mail from "./Mail";

const vendor = {
  id: 1, name: "Newsletter Co", root_domain: "newsletter.test", company_slug: "newsletter",
  message_count: 3, last_seen: 1_700_000_000_000, has_rfc8058: true, has_mailto_unsub: true,
  breachInfo: [],
};
const api = {
  queryVendors: jest.fn(), getVendorMessages: jest.fn(), getAllUnsubscribeMethods: jest.fn(),
  addWhitelistEntry: jest.fn(), executeRfc8058: jest.fn(), sendEmail: jest.fn(),
  markVendorUnsubscribed: jest.fn(), trashVendorMessages: jest.fn(), reportSpamVendor: jest.fn(),
  openExternal: jest.fn(),
};
beforeEach(() => {
  jest.clearAllMocks();
  api.queryVendors.mockResolvedValue({ vendors: [], total: 0 });
  api.getVendorMessages.mockResolvedValue([{ id: "message-1", date: 1_700_000_000_000, subject: "Weekly update" }]);
  api.getAllUnsubscribeMethods.mockResolvedValue([{ method: "rfc8058", url: "https://newsletter.test/unsubscribe", senderEmail: "news@newsletter.test" }]);
  api.addWhitelistEntry.mockResolvedValue(undefined);
  api.executeRfc8058.mockResolvedValue({ success: true });
  api.sendEmail.mockResolvedValue({ success: true });
  api.markVendorUnsubscribed.mockResolvedValue(undefined);
  api.trashVendorMessages.mockResolvedValue({ success: true });
  api.reportSpamVendor.mockResolvedValue({ success: true });
  api.openExternal.mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  Object.defineProperty(window, "api", { configurable: true, value: api });
});
const setup = (entry = "/mail") => render(<MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Mail /></MemoryRouter>);

it("loads mailing lists and composes search, preset, filter, and sort queries", async () => {
  setup();
  await screen.findByRole("heading", { name: "Mailing lists" });
  await waitFor(() => expect(api.queryVendors).toHaveBeenCalledWith(expect.objectContaining({ filter: "lists" })));
  fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "weekly" } });
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ search: "weekly" })));
  fireEvent.click(screen.getByRole("button", { name: "Priorities" }));
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ activeSubscriptions: true })));
  fireEvent.click(screen.getAllByRole("button").find((button) => button.querySelector("svg.lucide-sliders-horizontal"))!);
  fireEvent.click(screen.getByRole("button", { name: /On breach list/ }));
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ onBreachList: true })));
});

it("restores a whitelisted preset and clears filters", async () => {
  setup("/mail");
  await screen.findByRole("heading", { name: "Mailing lists" });
  fireEvent.click(screen.getByRole("button", { name: "Whitelisted" }));
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ showWhitelisted: true })));
  fireEvent.click(screen.getByRole("button", { name: "clear all" }));
  await waitFor(() => expect(api.queryVendors).toHaveBeenLastCalledWith(expect.objectContaining({ showWhitelisted: undefined })));
});

it("expands a mailing list to show recent messages and can open account details", async () => {
  api.queryVendors.mockResolvedValue({ vendors: [vendor], total: 1 });
  setup();
  await screen.findByText("Newsletter Co");
  fireEvent.click(screen.getByText("Newsletter Co"));
  expect(await screen.findByText("Weekly update")).toBeTruthy();
  expect(api.getVendorMessages).toHaveBeenCalledWith(1, 5);
  fireEvent.click(screen.getByRole("button", { name: /View details/ }));
  expect(await screen.findByText("Newsletter Co")).toBeTruthy();
});

it("adds the representative sender to the whitelist", async () => {
  api.queryVendors.mockResolvedValue({ vendors: [vendor], total: 1 });
  setup();
  await screen.findByText("Newsletter Co");
  fireEvent.click(screen.getAllByRole("button", { name: "Whitelist" })[0]!);
  fireEvent.click(await screen.findByLabelText(/Specific sender/));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Whitelist" }));
  await waitFor(() => expect(api.addWhitelistEntry).toHaveBeenCalledWith("news@newsletter.test"));
  expect(await screen.findByText("All caught up!")).toBeTruthy();
});

it("automatically unsubscribes, confirms success, and removes the list", async () => {
  api.queryVendors.mockResolvedValue({ vendors: [vendor], total: 1 });
  setup();
  await screen.findByText("Newsletter Co");
  fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Unsubscribe" }));
  expect(await screen.findByText(/Successfully unsubscribed/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(api.markVendorUnsubscribed).toHaveBeenCalledWith(1));
  expect(await screen.findByText("All caught up!")).toBeTruthy();
});

it("uses a mailto fallback after RFC 8058 fails", async () => {
  api.queryVendors.mockResolvedValue({ vendors: [vendor], total: 1 });
  api.executeRfc8058.mockResolvedValueOnce({ success: false, error: "Rejected" });
  api.getAllUnsubscribeMethods.mockResolvedValue([
    { method: "rfc8058", url: "https://newsletter.test/unsubscribe", senderEmail: "news@newsletter.test" },
    { method: "list-unsubscribe", url: "mailto:unsubscribe@newsletter.test?subject=Remove", senderEmail: "news@newsletter.test" },
  ]);
  setup();
  await screen.findByText("Newsletter Co");
  fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Unsubscribe" }));
  fireEvent.click(await screen.findByRole("button", { name: "Try" }));
  await waitFor(() => expect(api.sendEmail).toHaveBeenCalledWith("unsubscribe@newsletter.test", "Remove", expect.any(String)));
  expect(await screen.findByText(/Successfully unsubscribed/)).toBeTruthy();
});

it("runs a selected batch spam action and reports completion", async () => {
  api.queryVendors.mockResolvedValue({ vendors: [vendor], total: 1 });
  setup();
  await screen.findByText("Newsletter Co");
  fireEvent.click(screen.getAllByRole("checkbox")[1]!);
  const batchSpam = screen.getAllByRole("button").find((button) => button.getAttribute("data-tip") === "Report spam")!;
  fireEvent.click(batchSpam);
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Report spam" }));
  expect(await screen.findByText(/Done — 1 reported/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(await screen.findByText("All caught up!")).toBeTruthy();
  expect(api.reportSpamVendor).toHaveBeenCalledWith(1);
});
