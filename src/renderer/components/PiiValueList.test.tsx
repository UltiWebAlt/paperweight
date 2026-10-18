/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PiiValue } from "@shared/types";
import PiiValueList from "./PiiValueList";

const value: PiiValue = { ref: 12, type: "email", maskedValue: "j***@example.com", lastSeen: 1, companyCount: 2 };
const getCompanies = jest.fn();

beforeEach(() => {
  Object.defineProperty(window, "api", { configurable: true, value: { getPiiValueCompanies: getCompanies } });
  getCompanies.mockReset().mockResolvedValue([{ groupKey: "example.com", name: "Example company", lastSeen: Date.now() }]);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

function setup(values = [value], props: Partial<React.ComponentProps<typeof PiiValueList>> = {}) {
  const onConfirm = jest.fn(), onSuppress = jest.fn();
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PiiValueList values={values} busy={false} onConfirm={onConfirm} onSuppress={onSuppress} {...props} /></MemoryRouter>);
  return { onConfirm, onSuppress, row: screen.getByText(props.revealed?.get(value.ref) ?? value.maskedValue).closest('[role="button"]')! };
}

it("expands and collapses with Enter and Space, reusing loaded company data", async () => {
  const { row } = setup();
  fireEvent.keyDown(row, { key: "Enter" });
  await screen.findByText("Example company");
  expect(getCompanies).toHaveBeenCalledWith(12, "recent");
  fireEvent.keyDown(row, { key: " " });
  expect(screen.queryByText("Example company")).toBeNull();
  fireEvent.keyDown(row, { key: "Escape" });
  expect(screen.queryByText("Example company")).toBeNull();
  fireEvent.click(row);
  await screen.findByText("Example company");
  expect(getCompanies).toHaveBeenCalledTimes(1);
});

it("does not expand when selecting a value or using its action controls", async () => {
  const { row, onConfirm } = setup();
  const checkbox = row.querySelector("input")!;
  fireEvent.keyDown(checkbox, { key: " " });
  fireEvent.click(checkbox);
  expect(getCompanies).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getAllByRole("button", { name: "It's mine" })[1], { key: "Enter" });
  fireEvent.click(screen.getAllByRole("button", { name: "It's mine" })[1]);
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith([value]));
  expect(getCompanies).not.toHaveBeenCalled();
  expect((checkbox as HTMLInputElement).checked).toBe(false);
});

it("reloads company ordering and clears expansion after suppressing a value", async () => {
  const { row, onSuppress } = setup();
  fireEvent.click(row);
  await screen.findByText("Example company");
  fireEvent.click(screen.getByRole("button", { name: "Most recent" }));
  await waitFor(() => expect(getCompanies).toHaveBeenCalledWith(12, "oldest"));
  fireEvent.click(screen.getAllByRole("button", { name: "Not mine" })[1]);
  await waitFor(() => expect(onSuppress).toHaveBeenCalledWith([value]));
  expect(screen.queryByText("Example company")).toBeNull();
});

it("supports bulk confirmation while protecting profile matches", async () => {
  const match = { ...value, ref: 13, isMatch: true, maskedValue: "m***@example.com" };
  const { onConfirm } = setup([value, match]);
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  expect((screen.getAllByRole("checkbox")[2] as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getAllByRole("button", { name: "It's mine" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Add to profile" }));
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith([value]));
});

it("reveals values only when supplied and hides suppression controls when restoring", () => {
  setup([value], { revealed: new Map([[12, "jane@example.com"]]), mode: "suppressed" });
  expect(screen.getByText("jane@example.com")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Not mine" })).toBeNull();
});
