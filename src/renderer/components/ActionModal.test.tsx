/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ActionModal from "./ActionModal";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

it("runs confirm, secondary, and cancel callbacks and displays errors", () => {
  const onConfirm = jest.fn(), onSecondary = jest.fn(), onCancel = jest.fn();
  render(<ActionModal isOpen title="Review request" confirmLabel="Send" secondaryLabel="Save draft" onConfirm={onConfirm} onSecondary={onSecondary} onCancel={onCancel} error="Could not send">Body</ActionModal>);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onSecondary).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Could not send")).toBeTruthy();
});

it("prevents actions and native dialog cancellation while busy", () => {
  const onCancel = jest.fn(), onConfirm = jest.fn();
  const { container } = render(<ActionModal isOpen title="Sending" confirmLabel="Send" onConfirm={onConfirm} onCancel={onCancel} loading>Body</ActionModal>);
  for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent(container.querySelector("dialog")!, new Event("close"));
  expect(onCancel).not.toHaveBeenCalled();
});

it("copies the request text and handles clipboard rejection", async () => {
  const copy = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  render(<ActionModal isOpen title="Request" copyText="Request body" onCancel={jest.fn()}>Body</ActionModal>);
  fireEvent.click(screen.getByTitle("Copy to clipboard"));
  await screen.findByTitle("Copied");
  expect(copy).toHaveBeenCalledWith("Request body");
  copy.mockRejectedValueOnce(new Error("Permission denied"));
  fireEvent.click(screen.getByTitle("Copied"));
  await waitFor(() => expect(copy).toHaveBeenCalledTimes(2));
});
