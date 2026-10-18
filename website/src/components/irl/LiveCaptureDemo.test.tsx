/** @jest-environment jsdom */
import { act, render, screen } from "@testing-library/react";
import { LiveCaptureDemo } from "./LiveCaptureDemo";

jest.mock("@/components/irl/signals", () => ({ collectClientSignals: jest.fn() }));
import { collectClientSignals } from "./signals";

const signals = {
  os: "Linux", browser: "Firefox", screen: "1920 x 1080 @1x", language: "en-US",
  timezone: "UTC", cpuCores: "8", colorScheme: "light", touchPoints: "0",
  doNotTrack: "unset", cookies: "allowed", fingerprint: "hash123", gpu: "Generic GPU",
};

it("moves from loading into the capture stream as browser signals arrive", async () => {
  jest.useFakeTimers();
  (collectClientSignals as jest.Mock).mockResolvedValue(signals);
  const view = render(<LiveCaptureDemo />);
  expect(screen.getByText("reading client signals...")).toBeTruthy();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText("harvesting...")).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(420); });
  expect(screen.getByText("Linux")).toBeTruthy();
  view.unmount();
  jest.useRealTimers();
});
