import { excludedGmailLabels, gmailListParams } from "./gmail-scope";

const since = new Date("2026-01-01T00:00:00Z");
const until = new Date("2026-04-01T00:00:00Z");

test.each([
  [false, false, ["SPAM", "TRASH"]],
  [true, false, ["TRASH"]],
  [false, true, ["SPAM"]],
  [true, true, []],
] as const)("Spam=%s Trash=%s: listing and removal scope agree", (includeSpam, includeTrash, excluded) => {
  const scope = { includeSpam, includeTrash };
  const params = gmailListParams(scope, since, until, 50);
  expect(excludedGmailLabels(scope)).toEqual(excluded);
  expect(params.includeSpamTrash).toBe(includeSpam || includeTrash ? "true" : undefined);
  expect(params.q).toContain(`after:${since.getTime() / 1000}`);
  expect(params.q).toContain(`before:${until.getTime() / 1000}`);
  for (const label of ["SPAM", "TRASH"]) {
    expect(params.q.includes(`-in:${label.toLowerCase()}`)).toBe(
      (includeSpam || includeTrash) && (excluded as readonly string[]).includes(label),
    );
  }
  // Count estimates use the exact same search as paginated downloads.
  expect(gmailListParams(scope, since, until, 1)).toEqual({ ...params, maxResults: "1" });
});
