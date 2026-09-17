export interface GmailSyncScope {
  includeSpam: boolean;
  includeTrash: boolean;
}

export function excludedGmailLabels(scope: GmailSyncScope): string[] {
  return [!scope.includeSpam && "SPAM", !scope.includeTrash && "TRASH"]
    .filter((label): label is string => !!label);
}

// Gmail's API has one combined flag; exclusions allow either folder separately.
export function gmailListParams(
  scope: GmailSyncScope, since: Date, until: Date | undefined, maxResults: number,
): Record<string, string> {
  const includeSpecialFolders = scope.includeSpam || scope.includeTrash;
  // Preserve the existing default query so in-progress page tokens remain valid.
  const query = includeSpecialFolders
    ? excludedGmailLabels(scope).map((label) => `-in:${label.toLowerCase()}`)
    : [];
  const after = Math.floor(since.getTime() / 1000);
  if (after > 0) query.push(`after:${after}`);
  if (until) query.push(`before:${Math.floor(until.getTime() / 1000)}`);
  return {
    maxResults: String(maxResults),
    ...(includeSpecialFolders ? { includeSpamTrash: "true" } : {}),
    ...(query.length ? { q: query.join(" ") } : {}),
  };
}
