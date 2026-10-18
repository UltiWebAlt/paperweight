const mockHandlers: Record<string, (...args: any[]) => any> = {};
const mockSave = jest.fn();
const mockMarkStale = jest.fn();
jest.mock("electron", () => ({ ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => { mockHandlers[channel] = handler; } } }));
jest.mock("../services/profile", () => ({ getUserProfile: jest.fn(() => ({ names: [], emails: [], phones: [], addresses: [], nationalIds: [], payments: [] })), saveUserProfile: (...args: any[]) => mockSave(...args) }));
jest.mock("../sync-manager", () => ({ markProfileAnalysisStale: (...args: any[]) => mockMarkStale(...args) }));

import { IPC } from "@shared/ipc";
import { registerProfileHandlers } from "./profile";

beforeAll(() => registerProfileHandlers());
beforeEach(() => { jest.clearAllMocks(); });
const validProfile = { country: "NL", birthDate: { day: 1, month: 2, year: 1990 }, names: [{ id: 1, firstName: "Taylor", middleName: "", lastName: "Example" }], emails: [], phones: [], addresses: [{ id: 2, mode: "raw", raw: "Main Street" }], nationalIds: [], payments: [{ id: 3, type: "iban", value: "NL00" }] };

it("rejects invalid profile structures and persists valid profiles", () => {
  expect(() => mockHandlers[IPC.saveUserProfile](null, { ...validProfile, names: [{ id: 1, firstName: 5, lastName: "" }] })).toThrow("Invalid user profile");
  mockSave.mockReturnValue(true);
  mockHandlers[IPC.saveUserProfile](null, validProfile);
  expect(mockSave).toHaveBeenCalledWith(validProfile);
  expect(mockMarkStale).toHaveBeenCalled();
});

it("accepts structured addresses and skips re-analysis when profile did not change", () => {
  mockSave.mockReturnValue(false);
  mockHandlers[IPC.saveUserProfile](null, { ...validProfile, addresses: [{ id: 2, mode: "structured", street: "Main", houseNumber: "1", postalCode: "1000", city: "Town", country: "NL" }] });
  expect(mockMarkStale).not.toHaveBeenCalled();
});
