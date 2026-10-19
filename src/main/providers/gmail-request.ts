import { randomInt } from "node:crypto";
import { syncLog } from "../utils/log";
import { getGlobalDb } from "../globalDb";
import { createGmailPacingStore } from "./gmail-pacing";

export class GmailApiError extends Error {
  constructor(public readonly status: number, body: string) {
    super(`Gmail API error (${status}): ${body}`);
  }
}

function isRateLimit(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  try {
    const { error } = JSON.parse(body);
    return error?.errors?.some((entry: { reason?: string }) =>
      ["rateLimitExceeded", "userRateLimitExceeded"].includes(entry.reason ?? ""),
    ) || error?.details?.some((entry: { reason?: string }) =>
      entry.reason === "RATE_LIMIT_EXCEEDED",
    ) || false;
  } catch {
    return false;
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface ReadState {
  nextRequestAt: number;
  requestIntervalMs: number;
}

interface ReadStateStore {
  load(): Partial<ReadState> | undefined;
  save(state: ReadState): void;
  acquire?(now: number, interval: number): number;
}

// messages.get costs 20 units: one read/second uses about 1,200 units/minute,
// leaving headroom under the 6,000 per-user limit for other activity.
// https://developers.google.com/workspace/gmail/api/reference/quota
export function createGmailRequest(stateStore?: ReadStateStore) {
  let queue: Promise<unknown> = Promise.resolve();
  let nextRequestAt = 0;
  let requestIntervalMs = 1000;

  return (request: () => Promise<Response>, options: { retry?: boolean } = {}): Promise<Response> => {
    const result = queue.then(async () => {
      // Read lazily: the worker initializes the account DB after module imports.
      const saved = stateStore?.load();
      if (saved) {
        if (Number.isFinite(saved.requestIntervalMs)) {
          requestIntervalMs = Math.max(requestIntervalMs, Math.min(saved.requestIntervalMs!, 10_000));
        }
        if (Number.isFinite(saved.nextRequestAt)) {
          nextRequestAt = Math.max(nextRequestAt, saved.nextRequestAt!);
        }
      }
      for (let attempt = 0; ; attempt++) {
        // Re-check after every sleep: another process may have extended cooldown.
        while (true) {
          const saved = stateStore?.load();
          requestIntervalMs = Math.max(requestIntervalMs, saved?.requestIntervalMs ?? 1000);
          nextRequestAt = Math.max(nextRequestAt, saved?.nextRequestAt ?? 0);
          const wait = nextRequestAt - Date.now();
          if (wait > 0) { await sleep(Math.min(wait, 60_000)); continue; }
          const sharedWait = stateStore?.acquire?.(Date.now(), requestIntervalMs) ?? 0;
          if (sharedWait > 0) { await sleep(Math.min(sharedWait, 60_000)); continue; }
          nextRequestAt = Date.now() + requestIntervalMs;
          if (!stateStore?.acquire) stateStore?.save({ nextRequestAt, requestIntervalMs });
          break;
        }
        const response = await request();
        if (response.ok) return response;

        const body = await response.text();
        const limited = isRateLimit(response.status, body);
        if (limited) requestIntervalMs = Math.min(requestIntervalMs * 2, 10_000);
        if (!limited && response.status < 500) {
          throw new GmailApiError(response.status, body);
        }

        const retryAfter = response.headers.get("Retry-After");
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const headerDelay = Number.isFinite(seconds)
          ? seconds * 1000
          : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
        const backoff = Math.min((limited ? 60_000 : 1000) * 2 ** attempt, 120_000);
        const delay = Math.max(backoff, headerDelay || 0) + randomInt(1000);
        nextRequestAt = Date.now() + delay;
        stateStore?.save({ nextRequestAt, requestIntervalMs });
        if (options.retry === false || attempt >= 5) throw new GmailApiError(response.status, body);
        syncLog.info(`Gmail API returned HTTP ${response.status} (${limited ? "rate limit" : "server error"}); retrying in ${Math.ceil(delay / 1000)}s, request interval ${requestIntervalMs}ms`);
      }
    });
    queue = result.catch(() => undefined);
    return result;
  };
}

// Mandatory for every Gmail REST request, including profile and mutations.
// Never bypass this gate or reset it when sync restarts. Sending mail is paced
// but must pass retry: false because replaying it can deliver duplicate mail.
export const gmailRequest = createGmailRequest(createGmailPacingStore(getGlobalDb));
