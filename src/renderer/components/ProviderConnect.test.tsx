/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppleConnect, GmailConnect, ImapConnect, MicrosoftConnect, ProtonConnect, ProviderSelect } from "./ProviderConnect";
import ServerSettingsModal from "./ServerSettingsModal";

const api = { onAuthUrl: jest.fn(), startGmailAuth: jest.fn(), startMicrosoftAuth: jest.fn(), startSync: jest.fn(), saveImapConfig: jest.fn(), updateServerConfig: jest.fn(), openExternal: jest.fn() };
let authUrl: (url: string) => void;
beforeEach(() => {
  jest.clearAllMocks();
  api.onAuthUrl.mockImplementation((callback) => { authUrl = callback; return jest.fn(); });
  api.startGmailAuth.mockResolvedValue({ success: false, error: "Consent denied" });
  api.startMicrosoftAuth.mockResolvedValue({ success: false });
  api.saveImapConfig.mockResolvedValue({ success: true });
  api.updateServerConfig.mockResolvedValue({ success: true });
  Object.defineProperty(window, "api", { configurable: true, value: api });
});
afterEach(() => jest.useRealTimers());

it("distinguishes ordinary sign-in from copying the sign-in link", () => {
  const callbacks = { onGmail: jest.fn(), onMicrosoft: jest.fn(), onApple: jest.fn(), onProton: jest.fn(), onImap: jest.fn() };
  render(<ProviderSelect {...callbacks} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect with Google" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy Google sign-in link" }));
  expect(callbacks.onGmail.mock.calls).toEqual([[false], [true]]);
  fireEvent.click(screen.getByRole("button", { name: "Connect with Microsoft" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy Microsoft sign-in link" }));
  expect(callbacks.onMicrosoft.mock.calls).toEqual([[false], [true]]);
  for (const [label, callback] of [["Connect with Apple", callbacks.onApple], ["Connect with Proton Mail", callbacks.onProton], ["Other email (IMAP)", callbacks.onImap]] as const) {
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(callback).toHaveBeenCalledTimes(1);
  }
});

it("reports OAuth failure and supports retrying without changing the account intent", async () => {
  render(<GmailConnect intent={{ type: "reconnect", email: "me@example.com" }} onSuccess={jest.fn()} onBack={jest.fn()} copyFirst />);
  await screen.findByText("Consent denied");
  expect(api.startGmailAuth).toHaveBeenCalledWith({ type: "reconnect", email: "me@example.com" }, false);
  fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
  await waitFor(() => expect(api.startGmailAuth).toHaveBeenCalledTimes(2));
  expect(api.startGmailAuth).toHaveBeenLastCalledWith({ type: "reconnect", email: "me@example.com" }, true);
  expect(api.startSync).not.toHaveBeenCalled();
});

it("offers the live link and ignores success from a cancelled authorization", async () => {
  let complete!: (result: { success: boolean }) => void;
  api.startGmailAuth.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  const onBack = jest.fn(), onSuccess = jest.fn(), copy = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  render(<GmailConnect intent={{ type: "add" }} onSuccess={onSuccess} onBack={onBack} />);
  act(() => authUrl("https://accounts.google.com/test-consent"));
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  await screen.findByText("Sign-in link copied");
  expect(copy).toHaveBeenCalledWith("https://accounts.google.com/test-consent");
  fireEvent.click(screen.getByRole("button", { name: "Open in browser" }));
  expect(api.openExternal).toHaveBeenCalledWith("https://accounts.google.com/test-consent");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await act(async () => complete({ success: true }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(api.startSync).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();
});

it("starts sync only after a successful Microsoft authorization", async () => {
  jest.useFakeTimers();
  api.startMicrosoftAuth.mockResolvedValueOnce({ success: true });
  const onSuccess = jest.fn();
  render(<MicrosoftConnect intent={{ type: "add" }} onSuccess={onSuccess} onBack={jest.fn()} />);
  await act(async () => { await jest.runAllTimersAsync(); });
  expect(api.startSync).toHaveBeenCalledTimes(1);
  expect(onSuccess).toHaveBeenCalledTimes(1);
});

test.each([[AppleConnect, "you@icloud.com"], [ProtonConnect, "you@proton.me"]] as const)("connects the provider with its explicit server settings", async (Component, placeholder) => {
  const onSuccess = jest.fn();
  const { container } = render(<Component onSuccess={onSuccess} onBack={jest.fn()} />);
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: "me@example.com" } });
  fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: "test-only" } });
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  expect(api.saveImapConfig).toHaveBeenCalledWith({ type: "add" }, expect.objectContaining({ username: "me@example.com", host: expect.any(String), smtp: expect.objectContaining({ host: expect.any(String) }) }));
  expect(api.startSync).toHaveBeenCalledTimes(1);
});

it("reports IMAP connection failures without starting a sync", async () => {
  api.saveImapConfig.mockResolvedValueOnce({ success: false, error: "Server rejected the login" });
  const onSuccess = jest.fn();
  const { container } = render(<ImapConnect onSuccess={onSuccess} onBack={jest.fn()} />);
  fireEvent.submit(container.querySelector("form")!);
  await screen.findByText("Server rejected the login");
  expect(onSuccess).not.toHaveBeenCalled();
  expect(api.startSync).not.toHaveBeenCalled();
});

const initial = { imap: { host: "imap.example.com", port: 993, tls: true, allowSelfSigned: false }, smtp: { host: "smtp.example.com", port: 465, tls: true } };

it("updates servers without replacing the stored password when the password field is blank", async () => {
  const onSaved = jest.fn();
  const { container } = render(<ServerSettingsModal email="me@example.com" initial={initial} onSaved={onSaved} onClose={jest.fn()} />);
  fireEvent.change(screen.getAllByPlaceholderText("Host")[0], { target: { value: "new.example.com" } });
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(api.updateServerConfig).toHaveBeenCalledWith({ ...initial, imap: { ...initial.imap, host: "new.example.com" } });
  expect(api.saveImapConfig).not.toHaveBeenCalled();
});

it("uses reconnect intent when replacing a password and surfaces rejected updates", async () => {
  api.saveImapConfig.mockResolvedValueOnce({ success: false, error: "Authentication failed" });
  const { container } = render(<ServerSettingsModal email="me@example.com" initial={initial} onSaved={jest.fn()} onClose={jest.fn()} />);
  fireEvent.change(screen.getByPlaceholderText("Leave blank to keep current password"), { target: { value: "test-only" } });
  fireEvent.submit(container.querySelector("form")!);
  await screen.findByText("Authentication failed");
  expect(api.saveImapConfig).toHaveBeenCalledWith({ type: "reconnect", email: "me@example.com" }, expect.objectContaining({ password: "test-only" }));
  expect((screen.getByRole("button", { name: "Save", hidden: true }) as HTMLButtonElement).disabled).toBe(false);
});

it("handles a thrown server-update error and keeps Cancel available", async () => {
  api.updateServerConfig.mockRejectedValueOnce(new Error("Offline"));
  const onClose = jest.fn();
  const { container } = render(<ServerSettingsModal email="me@example.com" initial={initial} onSaved={jest.fn()} onClose={onClose} />);
  fireEvent.submit(container.querySelector("form")!);
  await screen.findByText("Offline");
  fireEvent.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
