/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Settings from "./Settings";

const mockAccounts = [{ email: "me@example.com", providerType: "gmail", isActive: true, sizeBytes: 0 }, { email: "work@example.com", providerType: "microsoft", isActive: false, sizeBytes: 1024 }];
const mockRefresh = jest.fn();
jest.mock("../hooks/useAccounts", () => ({ useAccounts: () => ({ accounts: mockAccounts, refresh: mockRefresh }) }));
jest.mock("ethereum-blockies-base64", () => ({ __esModule: true, default: () => "data:image/png;base64," }));
const api = {
  getSettings: jest.fn(), getAccountInfo: jest.fn(), getEmailConnection: jest.fn(), getAccountHealth: jest.fn(), getWhitelistEntries: jest.fn(),
  saveSettings: jest.fn(), setAccountLabel: jest.fn(), switchAccount: jest.fn(), addWhitelistEntry: jest.fn(), removeWhitelistEntry: jest.fn(),
  resyncData: jest.fn(), startSync: jest.fn(), wipeData: jest.fn(), removeAccount: jest.fn(), startGmailAuth: jest.fn(),
};
beforeEach(() => {
  jest.resetAllMocks();
  api.getSettings.mockReturnValue({ autoLaunch: false, launchMinimized: false, colorTheme: "dim" });
  api.getAccountInfo.mockResolvedValue({ email: "me@example.com", providerType: "gmail", totalMessages: 10 });
  api.getEmailConnection.mockResolvedValue({ type: "gmail-oauth", email: "me@example.com" });
  api.getAccountHealth.mockResolvedValue(mockAccounts.map((account) => ({ email: account.email, connection: "ready", historyAvailable: false })));
  api.getWhitelistEntries.mockResolvedValue([]);
  for (const name of ["saveSettings", "setAccountLabel", "switchAccount", "addWhitelistEntry", "removeWhitelistEntry", "resyncData", "wipeData", "removeAccount"] as const) api[name].mockResolvedValue(undefined);
  api.startGmailAuth.mockResolvedValue({ success: true });
  Object.defineProperty(window, "api", { configurable: true, value: api });
});
async function setup() {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Settings /></MemoryRouter>);
  await screen.findByText("Folders to include");
}

it("saves an account label through its explicit submit button", async () => {
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "Edit label for me@example.com" }));
  fireEvent.change(screen.getByLabelText("Label for me@example.com"), { target: { value: "Personal" } });
  const save = screen.getByRole("button", { name: "Save label" });
  expect(save.getAttribute("type")).toBe("submit");
  fireEvent.submit(save.closest("form")!);
  await waitFor(() => expect(api.setAccountLabel).toHaveBeenCalledWith("me@example.com", "Personal"));
  await waitFor(() => expect(screen.queryByLabelText("Label for me@example.com")).toBeNull());
});

it("keeps edits visible when saving a label fails", async () => {
  api.setAccountLabel.mockRejectedValueOnce(new Error("Disk unavailable"));
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "Edit label for me@example.com" }));
  fireEvent.submit(screen.getByRole("button", { name: "Save label" }).closest("form")!);
  await screen.findByText("Could not save the account label. Please try again.");
  expect(screen.getByLabelText("Label for me@example.com")).toBeTruthy();
});

it("applies Gmail folder changes only when requested and surfaces failures", async () => {
  await setup();
  const apply = screen.getByRole("button", { name: "Apply and sync" }) as HTMLButtonElement;
  expect(apply.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("Include Spam"));
  expect(apply.disabled).toBe(false);
  fireEvent.click(apply);
  await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ gmailIncludeSpam: true, gmailIncludeTrash: false }));
  await waitFor(() => expect(apply.disabled).toBe(true));
  api.saveSettings.mockRejectedValueOnce(new Error("Folder settings unavailable"));
  fireEvent.click(screen.getByLabelText("Include Trash")); fireEvent.click(apply);
  await screen.findByText("Folder settings unavailable");
});

it("reconnects the active account and resumes sync only after success", async () => {
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
  await waitFor(() => expect(api.startSync).toHaveBeenCalledTimes(1));
  expect(api.startGmailAuth).toHaveBeenCalledWith({ type: "reconnect", email: "me@example.com" });
});

it("reports a rejected account switch", async () => {
  api.switchAccount.mockRejectedValueOnce(new Error("Unavailable"));
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "Switch" }));
  await screen.findByText("Could not switch accounts. Please try again.");
  expect(api.switchAccount).toHaveBeenCalledWith("work@example.com");
});

it("requires confirmation before deleting data and permits retry after failure", async () => {
  api.wipeData.mockRejectedValueOnce(new Error("File locked"));
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "Wipe All Data" }));
  expect(api.wipeData).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Wipe everything", hidden: true }));
  await screen.findByText(/could not delete all local data/);
  expect(screen.getByText("Wipe all data?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Wipe everything", hidden: true }));
  await waitFor(() => expect(screen.queryByText("Wipe all data?")).toBeNull());
  expect(api.wipeData).toHaveBeenCalledTimes(2);
});

it("does not remove an account until confirmation and keeps failures visible", async () => {
  api.removeAccount.mockRejectedValueOnce(new Error("File locked"));
  await setup();
  fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
  expect(api.removeAccount).not.toHaveBeenCalled();
  const modal = screen.getByText("Remove account?").closest<HTMLDialogElement>("dialog")!;
  fireEvent.click(within(modal).getByRole("button", { name: "Remove", hidden: true }));
  await screen.findByText(/could not delete this account/);
  expect(api.removeAccount).toHaveBeenCalledWith("work@example.com");
  expect(mockRefresh).not.toHaveBeenCalled();
});
