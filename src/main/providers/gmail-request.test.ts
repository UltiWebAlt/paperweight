import { createGmailRequest, GmailApiError } from "./gmail-request";

jest.mock("crypto", () => ({ ...jest.requireActual("crypto"), randomInt: jest.fn(() => 0) }));

jest.mock("../utils/log", () => ({ syncLog: { info: jest.fn() } }));
jest.mock("../services/settings", () => ({ getSetting: jest.fn(), saveSetting: jest.fn() }));

const response = (status: number, body = "", retryAfter?: string) =>
  new Response(body, {
    status,
    headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
  });
const quotaBody = JSON.stringify({
  error: { errors: [{ reason: "rateLimitExceeded" }] },
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("paces concurrent reads through one queue", async () => {
  const read = createGmailRequest();
  const times: number[] = [];
  const fetch = jest.fn(async () => {
    times.push(Date.now());
    return response(200);
  });
  const pending = Promise.all([read(fetch), read(fetch), read(fetch)]);
  await jest.runAllTimersAsync();
  await pending;
  expect(times).toEqual([0, 1000, 2000]);
});

test.each([403, 429])("retries quota status %i and shares cooldown with queued reads", async (status) => {
  const read = createGmailRequest();
  const times: number[] = [];
  const fetch = jest.fn(async () => {
    times.push(Date.now());
    return times.length === 1 ? response(status, quotaBody) : response(200);
  });
  const pending = Promise.all([read(fetch), read(fetch)]);
  await jest.runAllTimersAsync();
  await pending;
  expect(times).toEqual([0, 60_000, 62_000]);
});

test("keeps reducing throughput when quota errors recur after successful reads", async () => {
  const read = createGmailRequest();
  const times: number[] = [];
  const fetch = jest.fn(async () => {
    times.push(Date.now());
    return [1, 3].includes(times.length) ? response(403, quotaBody) : response(200);
  });
  const pending = Promise.all([read(fetch), read(fetch), read(fetch)]);
  await jest.runAllTimersAsync();
  await pending;
  expect(times).toEqual([0, 60_000, 62_000, 122_000, 126_000]);
});

test("a new worker preserves the saved quota cooldown and slower pace", async () => {
  let saved = { nextRequestAt: 60_000, requestIntervalMs: 2000 };
  const store = { load: () => saved, save: (state: typeof saved) => { saved = state; } };
  const times: number[] = [];
  const fetch = async () => { times.push(Date.now()); return response(200); };
  const first = createGmailRequest(store)(fetch);
  await jest.runAllTimersAsync();
  await first;
  const restarted = createGmailRequest(store)(fetch);
  await jest.runAllTimersAsync();
  await restarted;
  expect(times).toEqual([60_000, 62_000]);
});

test("quota responses persist their cooldown before waiting for a retry", async () => {
  const save = jest.fn();
  const read = createGmailRequest({ load: () => undefined, save });
  const fetch = jest.fn()
    .mockResolvedValueOnce(response(403, quotaBody))
    .mockResolvedValueOnce(response(200));
  const pending = read(fetch);
  await jest.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenLastCalledWith({ nextRequestAt: 60_000, requestIntervalMs: 2000 });
  await jest.runAllTimersAsync();
  await pending;
});

test.each(["180", new Date(180_000).toUTCString()])("honors Retry-After %s", async (header) => {
  const read = createGmailRequest();
  const fetch = jest.fn()
    .mockResolvedValueOnce(response(429, quotaBody, header))
    .mockResolvedValueOnce(response(200));
  const pending = read(fetch);
  await jest.runAllTimersAsync();
  await pending;
  expect(Date.now()).toBe(180_000);
});

test("does not retry permission failures and leaves the queue usable", async () => {
  const read = createGmailRequest();
  const fetch = jest.fn().mockResolvedValue(response(403, '{"error":{"status":"PERMISSION_DENIED"}}'));
  await expect(read(fetch)).rejects.toMatchObject({ status: 403 });
  expect(fetch).toHaveBeenCalledTimes(1);
  const pending = read(async () => response(200));
  await jest.runAllTimersAsync();
  expect((await pending).ok).toBe(true);
});

test("stops after bounded retries with the original API status", async () => {
  const read = createGmailRequest();
  const fetch = jest.fn(async () => response(403, quotaBody));
  const pending = expect(read(fetch)).rejects.toBeInstanceOf(GmailApiError);
  await jest.runAllTimersAsync();
  await pending;
  expect(fetch).toHaveBeenCalledTimes(6);
});

test("retries transient server failures", async () => {
  const read = createGmailRequest();
  const fetch = jest.fn()
    .mockResolvedValueOnce(response(503))
    .mockResolvedValueOnce(response(200));
  const pending = read(fetch);
  await jest.runAllTimersAsync();
  expect((await pending).ok).toBe(true);
  expect(Date.now()).toBe(1000);
});


test("sending is paced but never retried, and its quota cooldown applies to later reads", async () => {
  const read = createGmailRequest();
  const send = jest.fn(async () => response(429, quotaBody, "180"));
  const failed = expect(read(send, { retry: false })).rejects.toMatchObject({ status: 429 });
  await jest.runAllTimersAsync();
  await failed;
  expect(send).toHaveBeenCalledTimes(1);
  const times: number[] = [];
  const pending = read(async () => { times.push(Date.now()); return response(200); });
  await jest.runAllTimersAsync();
  await pending;
  expect(times).toEqual([180_000]);
});

test("an external cooldown extension is honored after waking", async () => {
  let saved = { nextRequestAt: 1000, requestIntervalMs: 1000 };
  const read = createGmailRequest({ load: () => saved, save: (state) => { saved = state; } });
  const fetch = jest.fn(async () => response(200));
  const pending = read(fetch);
  await jest.advanceTimersByTimeAsync(500);
  saved.nextRequestAt = 60_000;
  await jest.advanceTimersByTimeAsync(500);
  expect(fetch).not.toHaveBeenCalled();
  await jest.runAllTimersAsync();
  await pending;
  expect(Date.now()).toBe(60_000);
});
