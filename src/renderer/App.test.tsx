/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

jest.mock("./components/UpdateBanner", () => ({ __esModule: true, default: ({ info, onDismiss }: any) => info ? <button onClick={onDismiss}>Update {info.version}</button> : null }));
jest.mock("./components/AppShell", () => ({ __esModule: true, default: () => <div>Authenticated shell</div> }));
jest.mock("./pages/Onboarding", () => ({ __esModule: true, default: () => <div>Onboarding page</div> }));
jest.mock("./pages/Dashboard", () => ({ __esModule: true, default: () => <div>Dashboard page</div> }));
jest.mock("./pages/Mail", () => ({ __esModule: true, default: () => <div>Mail page</div> }));
jest.mock("./pages/Accounts", () => ({ __esModule: true, default: () => <div>Accounts page</div> }));
jest.mock("./pages/AccountDetail", () => ({ __esModule: true, default: () => <div>Account detail page</div> }));
jest.mock("./pages/Data", () => ({ __esModule: true, default: () => <div>Data page</div> }));
jest.mock("./pages/Cases", () => ({ __esModule: true, default: () => <div>Cases page</div> }));
jest.mock("./pages/CaseDetail", () => ({ __esModule: true, default: () => <div>Case detail page</div> }));
jest.mock("./pages/Profile", () => ({ __esModule: true, default: () => <div>Profile page</div> }));
jest.mock("./pages/Settings", () => ({ __esModule: true, default: () => <div>Settings page</div> }));
jest.mock("./pages/Support", () => ({ __esModule: true, default: () => <div>Support page</div> }));
jest.mock("./pages/Activity", () => ({ __esModule: true, default: () => <div>Activity page</div> }));

let updateDownloaded: (info: any) => void;
let noAccounts: () => void;
const api = { getLastUpdateInfo: jest.fn(), onUpdateDownloaded: jest.fn(), onAccountSwitched: jest.fn(), onNoAccountsRemaining: jest.fn(), getConnectionStatus: jest.fn(), getLicenseStatus: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  window.location.hash = "#/onboarding";
  api.getLastUpdateInfo.mockResolvedValue(null);
  api.onUpdateDownloaded.mockImplementation((callback) => { updateDownloaded = callback; return jest.fn(); });
  api.onAccountSwitched.mockReturnValue(jest.fn());
  api.onNoAccountsRemaining.mockImplementation((callback) => { noAccounts = callback; return jest.fn(); });
  Object.defineProperty(window, "api", { configurable: true, value: api });
});

it("shows onboarding, handles the update event, and plays the keyboard easter egg", async () => {
  render(<App />);
  expect(await screen.findByText("Onboarding page")).toBeTruthy();
  act(() => updateDownloaded({ version: "2.0" }));
  expect(await screen.findByRole("button", { name: "Update 2.0" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Update 2.0" }));
  expect(screen.queryByRole("button", { name: "Update 2.0" })).toBeNull();
  for (const key of "paperweight") fireEvent.keyDown(window, { key });
  expect((await screen.findByRole("alert")).textContent).toMatch(/Immovable/);
});

it("navigates to onboarding when the last account is removed", async () => {
  render(<App />);
  await screen.findByText("Onboarding page");
  act(() => noAccounts());
  await waitFor(() => expect(window.location.hash).toBe("#/onboarding"));
});
