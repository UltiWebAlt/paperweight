/** @jest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import type { PiiValue } from "@shared/types";
import { usePiiValueActions } from "./usePiiValueActions";

const value: PiiValue = { ref: 7, type: "email", maskedValue: "j***@example.com", companyCount: 1, lastSeen: 0 };
const confirm = jest.fn(), suppress = jest.fn();
let loadValues: jest.Mock, revealValues: jest.Mock;
let log: jest.SpyInstance;

beforeEach(() => {
  loadValues = jest.fn().mockResolvedValue(undefined);
  revealValues = jest.fn().mockResolvedValue([{ ref: 7, value: "jane@example.com" }]);
  confirm.mockReset().mockResolvedValue(undefined);
  suppress.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(window, "api", { configurable: true, value: { confirmPiiFinding: confirm, suppressPiiFinding: suppress } });
  log = jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => log.mockRestore());
const setup = () => renderHook(() => usePiiValueActions({ loadValues, revealValues }));

it("keeps raw personal values out of state until explicitly revealed, then clears them", async () => {
  const { result } = setup();
  await act(() => result.current.load());
  expect(revealValues).not.toHaveBeenCalled();
  expect(result.current.revealed).toBeUndefined();
  await act(() => result.current.toggleReveal());
  expect(result.current.showValues).toBe(true);
  expect(result.current.revealed?.get(7)).toBe("jane@example.com");
  await act(() => result.current.toggleReveal());
  expect(result.current.showValues).toBe(false);
  expect(result.current.revealed).toBeUndefined();
});

it("refreshes revealed references after corrections and clears them if reloading fails", async () => {
  const { result } = setup();
  await act(() => result.current.toggleReveal());
  revealValues.mockResolvedValueOnce([{ ref: 8, value: "new@example.com" }]);
  await act(() => result.current.confirmValues([value]));
  expect(confirm).toHaveBeenCalledWith(7);
  expect(result.current.revealed?.get(7)).toBeUndefined();
  expect(result.current.revealed?.get(8)).toBe("new@example.com");
  revealValues.mockRejectedValueOnce(new Error("Offline"));
  await act(() => result.current.load());
  expect(result.current.showValues).toBe(false);
  expect(result.current.revealed).toBeUndefined();
  expect(result.current.error).toContain("Could not show the full values");
  expect(result.current.busy).toBe(false);
});

it("reports load, reveal, and correction failures without leaving the controls busy", async () => {
  const { result } = setup();
  loadValues.mockRejectedValueOnce(new Error("Load failed"));
  await act(() => result.current.load());
  expect(result.current.error).toContain("Could not load");
  revealValues.mockRejectedValueOnce(new Error("Reveal failed"));
  await act(() => result.current.toggleReveal());
  expect(result.current.error).toContain("Could not show");
  confirm.mockRejectedValueOnce(new Error("Confirm failed"));
  await act(() => result.current.confirmValues([value]));
  expect(result.current.error).toContain("Could not add");
  suppress.mockRejectedValueOnce(new Error("Suppress failed"));
  await act(() => result.current.suppressValues([value]));
  expect(result.current.error).toContain("Could not update");
  expect(result.current.busy).toBe(false);
  act(() => result.current.reset());
  expect(result.current.error).toBeUndefined();
});

it("suppresses values and reloads the masked list", async () => {
  const { result } = setup();
  await act(() => result.current.suppressValues([value]));
  expect(suppress).toHaveBeenCalledWith(7);
  expect(loadValues).toHaveBeenCalledTimes(1);
  expect(revealValues).not.toHaveBeenCalled();
});
