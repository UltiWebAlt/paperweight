const handlers: Record<string, (...args: any[]) => unknown> = {};
const listeners: Record<string, (...args: any[]) => void> = {};
const invoke = jest.fn((...args: unknown[]) => Promise.resolve(args));
const sendSync = jest.fn((...args: unknown[]) => args);
const send = jest.fn();
const on = jest.fn((channel: string, listener: (...args: any[]) => void) => { listeners[channel] = listener; });
const removeListener = jest.fn();
const exposeInMainWorld = jest.fn((_name: string, api: unknown) => { Object.assign(handlers, api); });

jest.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: (...args: any[]) => exposeInMainWorld(...args) },
  ipcRenderer: {
    invoke: (...args: unknown[]) => invoke(...args),
    sendSync: (...args: unknown[]) => sendSync(...args),
    send: (...args: unknown[]) => send(...args),
    on: (...args: any[]) => on(...args),
    removeListener: (...args: any[]) => removeListener(...args),
  },
}));

import { IPC } from "@shared/ipc";
import "./index";

beforeEach(() => { jest.clearAllMocks(); });

it("exposes the typed API and forwards requests through IPC", async () => {
  expect(handlers.getConnectionStatus).toEqual(expect.any(Function));
  await handlers.getConnectionStatus();
  expect(invoke).toHaveBeenCalledWith(IPC.getConnectionStatus);
  handlers.getSettings();
  expect(sendSync).toHaveBeenCalledWith(IPC.getSettings);
});

it("subscribes to events and removes the exact listener on unsubscribe", () => {
  const callback = jest.fn();
  const unsubscribe = handlers.onSyncProgress(callback) as () => void;
  const listener = listeners[IPC.syncProgress];
  listener({}, { running: false });
  expect(callback).toHaveBeenCalledWith({ running: false });
  unsubscribe();
  expect(removeListener).toHaveBeenCalledWith(IPC.syncProgress, listener);
});

it("routes every exposed API method through the expected IPC bridge", () => {
  const names = Object.keys(handlers);
  for (const name of names) {
    const method = handlers[name];
    if (name.startsWith("on")) {
      const unsubscribe = method(jest.fn());
      unsubscribe();
    } else {
      method("arg", "arg2", "arg3", "arg4");
    }
  }
  expect(invoke.mock.calls.length + send.mock.calls.length + sendSync.mock.calls.length).toBeGreaterThan(60);
  expect(on).toHaveBeenCalled();
  expect(removeListener.mock.calls.length).toBe(on.mock.calls.length);
});
