/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { UserProfile } from "@shared/types";
import Profile from "./Profile";

jest.mock("../hooks/useAccounts", () => ({ useAccounts: () => ({ accounts: [{ email: "connected@example.com" }] }) }));
const getProfile = jest.fn(), saveProfile = jest.fn();
const empty: UserProfile = { country: "NL", names: [], emails: [], phones: [], addresses: [], nationalIds: [], payments: [] };
const populated: UserProfile = {
  country: "NL", birthDate: { day: 16, month: 4, year: 1990 },
  names: [{ id: 1, firstName: "Jane", middleName: "A", lastName: "Example" }],
  emails: [{ id: 2, address: "alias@example.com" }], phones: [{ id: 3, number: "+31612345678" }],
  addresses: [{ id: 4, mode: "structured", street: "Keizersgracht", houseNumber: "123", postalCode: "1015 CJ", city: "Amsterdam", country: "NL" }],
  nationalIds: [{ id: 5, value: "123456789" }], payments: [{ id: 6, type: "iban", value: "NL91ABNA0417164300" }],
};

beforeEach(() => {
  getProfile.mockReset().mockResolvedValue(empty);
  saveProfile.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(window, "api", { configurable: true, value: { getUserProfile: getProfile, saveUserProfile: saveProfile } });
});

async function setup(profile = empty) {
  getProfile.mockResolvedValue(profile);
  render(<Profile />);
  expect(await screen.findByRole("heading", { name: "User Profile" })).toBeTruthy();
}
const section = (name: string) => within(screen.getByRole("heading", { name }).closest<HTMLElement>("section")!);
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
const submit = (heading: string) => fireEvent.submit(screen.getByRole("heading", { name: heading }).closest<HTMLElement>("section")!.querySelector("form")!);
const saved = async (part: Partial<UserProfile>) => waitFor(() => expect(saveProfile).toHaveBeenLastCalledWith(expect.objectContaining(part)));

it("hydrates all saved identities and protects connected addresses from removal", async () => {
  await setup(populated);
  expect(screen.getByText("Jane A Example")).toBeTruthy();
  expect(screen.getByText("alias@example.com")).toBeTruthy();
  const connected = screen.getByText("connected@example.com").closest<HTMLElement>("div.flex.items-center")!;
  expect(within(connected).queryByRole("button", { name: "Remove" })).toBeNull();
  expect(saveProfile).not.toHaveBeenCalled();
});

it("saves a complete name and rejects an empty or duplicate name", async () => {
  await setup();
  submit("Names");
  expect(saveProfile).not.toHaveBeenCalled();
  change("First name", "Jane"); change("Last name", "Example");
  submit("Names");
  await saved({ names: [expect.objectContaining({ firstName: "Jane", lastName: "Example" })] });
  change("First name", "Jane"); change("Last name", "Example"); submit("Names");
  expect(section("Names").getByText(/already in your profile/)).toBeTruthy();
});

it("normalizes an alias and rejects connected-account duplicates", async () => {
  await setup();
  change("Email address", "connected@example.com"); submit("Email addresses");
  expect(section("Email addresses").getByText(/already in your profile/)).toBeTruthy();
  change("Email address", "alias@example.com"); submit("Email addresses");
  await saved({ emails: [expect.objectContaining({ address: "alias@example.com" })] });
});

it("validates and normalizes a phone number", async () => {
  await setup();
  const input = screen.getByPlaceholderText("+31 6 1234 5678");
  fireEvent.change(input, { target: { value: "123" } }); submit("Phone numbers");
  expect(section("Phone numbers").getByText(/7 to 15 digits/)).toBeTruthy();
  fireEvent.change(input, { target: { value: "+31 6 1234 5678" } }); submit("Phone numbers");
  await saved({ phones: [expect.objectContaining({ number: "+31612345678" })] });
});

it("requires complete structured addresses and saves their normalized fields", async () => {
  await setup();
  submit("Addresses");
  expect(saveProfile).not.toHaveBeenCalled();
  change("Street", "Keizersgracht"); change("House number", "123"); change("Postal code", "1015 CJ"); change("City", "Amsterdam");
  submit("Addresses");
  await saved({ addresses: [expect.objectContaining({ mode: "structured", street: "Keizersgracht", country: "NL" })] });
});

it("accepts a raw address or postal code without inventing structured details", async () => {
  await setup();
  fireEvent.click(screen.getByRole("tab", { name: "Single line" }));
  change("Address or postal code", "1015 CJ Amsterdam"); submit("Addresses");
  await saved({ addresses: [expect.objectContaining({ mode: "raw", raw: "1015 CJ Amsterdam" })] });
});

it("rejects impossible birthdays and saves a valid leap day", async () => {
  await setup();
  change("Day", "31"); change("Month", "2"); change("Year", "2000"); submit("Date of birth");
  expect(section("Date of birth").getByText(/valid date of birth/)).toBeTruthy();
  change("Day", "29"); submit("Date of birth");
  await saved({ birthDate: { day: 29, month: 2, year: 2000 } });
});

it("validates payment identifiers before persisting them", async () => {
  await setup();
  change("Value", "invalid"); submit("Payments");
  expect(saveProfile).not.toHaveBeenCalled();
  change("Value", "NL91 ABNA 0417 1643 00"); submit("Payments");
  await saved({ payments: [expect.objectContaining({ type: "iban", value: "NL91ABNA0417164300" })] });
});

test.each(["Names", "Email addresses", "Phone numbers", "Addresses", "National IDs", "Payments"])("edits, cancels, and removes a saved %s entry", async (heading) => {
  await setup(populated);
  const controls = section(heading);
  fireEvent.click(controls.getByRole("button", { name: "Edit" }));
  fireEvent.click(controls.getByRole("button", { name: "Cancel" }));
  expect(saveProfile).not.toHaveBeenCalled();
  fireEvent.click(controls.getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(1));
  const field = { Names: "names", "Email addresses": "emails", "Phone numbers": "phones", Addresses: "addresses", "National IDs": "nationalIds", Payments: "payments" }[heading]!;
  expect(saveProfile.mock.calls[0][0][field]).toEqual([]);
});

it("reports a failed save and retries the exact pending profile", async () => {
  await setup();
  saveProfile.mockRejectedValueOnce(new Error("Disk unavailable"));
  change("First name", "Jane"); change("Last name", "Example"); submit("Names");
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(2));
  expect(saveProfile.mock.calls[1][0]).toEqual(saveProfile.mock.calls[0][0]);
  await screen.findByText("Profile saved.");
});

it("recovers from a failed profile load", async () => {
  getProfile.mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue(empty);
  render(<Profile />);
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(2));
});
