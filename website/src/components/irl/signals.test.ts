/** @jest-environment jsdom */
import { collectClientSignals } from "./signals";
import { TextEncoder } from "node:util";
import { webcrypto } from "node:crypto";

beforeEach(() => {
  Object.defineProperty(globalThis, "TextEncoder", { configurable: true, value: TextEncoder });
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true }) });
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" });
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["en-US", "fr"] });
  Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "1" });
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  jest.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("canvas-data");
});
afterEach(() => jest.restoreAllMocks());

it("collects privacy signals with safe fallbacks when canvas and WebGL are unavailable", async () => {
  const signals = await collectClientSignals();
  expect(signals.os).toMatch(/Linux/);
  expect(signals.browser).toMatch(/Chrome/);
  expect(signals.language).toBe("en-US, fr");
  expect(signals.colorScheme).toBe("dark");
  expect(signals.gpu).toBe("unavailable");
  expect(signals.doNotTrack).toBe("enabled (lol)");
  expect(signals.fingerprint).toMatch(/^[a-f0-9]{16}$/);
});

it("uses high-entropy browser platform data when available", async () => {
  Object.defineProperty(navigator, "userAgentData", { configurable: true, value: {
    platform: "Windows",
    getHighEntropyValues: jest.fn().mockResolvedValue({ platform: "Windows", platformVersion: "15.2.0", fullVersionList: [{ brand: "Microsoft Edge", version: "124.1.0" }] }),
  } });
  const signals = await collectClientSignals();
  expect(signals.os).toBe("Windows 15");
});
