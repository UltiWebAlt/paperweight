/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Onboarding from "./Onboarding";

jest.mock("../components/DeviceInfoCard", () => ({ __esModule: true, default: () => <div>Device details</div> }));
jest.mock("../components/HelpSection", () => ({ __esModule: true, default: () => <div>Help content</div> }));
jest.mock("../components/ProviderConnect", () => ({
  ProviderSelect: ({ onGmail, onMicrosoft, onApple, onProton, onImap }: any) => <div>
    <button onClick={() => onGmail(false)}>Gmail option</button><button onClick={() => onMicrosoft(true)}>Microsoft option</button>
    <button onClick={onApple}>Apple option</button><button onClick={onProton}>Proton option</button><button onClick={onImap}>IMAP option</button>
  </div>,
  GmailConnect: ({ onBack, onSuccess, copyFirst }: any) => <div>Gmail connect {String(copyFirst)} <button onClick={onBack}>Back</button><button onClick={onSuccess}>Connected</button></div>,
  MicrosoftConnect: ({ onBack }: any) => <div>Microsoft connect<button onClick={onBack}>Back</button></div>,
  AppleConnect: () => <div>Apple connect</div>, ProtonConnect: () => <div>Proton connect</div>, ImapConnect: () => <div>IMAP connect</div>,
}));

const api = { getConnectionStatus: jest.fn(), getSupportInfo: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  api.getConnectionStatus.mockResolvedValue(false);
  api.getSupportInfo.mockResolvedValue({ appVersion: "1.0" });
  Object.defineProperty(window, "api", { configurable: true, value: api });
});
const setup = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Onboarding /></MemoryRouter>);

it("selects providers and returns from a connection flow", async () => {
  setup();
  await screen.findByRole("button", { name: "Gmail option" });
  fireEvent.click(screen.getByRole("button", { name: "Gmail option" }));
  expect(screen.getByText("Gmail connect false")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.click(screen.getByRole("button", { name: "IMAP option" }));
  expect(screen.getByText("IMAP connect")).toBeTruthy();
});

it("loads device support information in the help modal", async () => {
  setup();
  await screen.findByRole("button", { name: "Help & device info" });
  fireEvent.click(screen.getByRole("button", { name: "Help & device info" }));
  expect(await screen.findByText("Device details")).toBeTruthy();
  expect(api.getSupportInfo).toHaveBeenCalled();
  expect(screen.getByText("Help content")).toBeTruthy();
});
