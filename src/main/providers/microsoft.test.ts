import { loadCredentials, saveCredentials } from "../credentials";
import { runLoopbackAuth } from "./utils";
import { analyzeMessage } from "@paperweight/analysis";

jest.mock("../credentials", () => ({ loadCredentials: jest.fn(), saveCredentials: jest.fn() }));
jest.mock("./utils", () => ({ runLoopbackAuth: jest.fn() }));
jest.mock("@paperweight/analysis", () => ({ analyzeMessage: jest.fn() }));
jest.mock("../utils/log", () => ({ syncLog: { error: jest.fn() }, authLog: { error: jest.fn() } }));

Object.assign(globalThis, { __MICROSOFT_CLIENT_ID__: "test-client" });
const { createMicrosoftProvider, fetchMicrosoftProfileEmail, startMicrosoftLoopbackAuth } = require("./microsoft") as typeof import("./microsoft");
const mockLoad = jest.mocked(loadCredentials), mockSave = jest.mocked(saveCredentials);
const mockLoopback = jest.mocked(runLoopbackAuth), mockAnalyze = jest.mocked(analyzeMessage);
const json = (data: unknown, status = 200, headers?: Record<string, string>) => new Response(JSON.stringify(data), { status, headers });
let fetchMock: jest.SpyInstance;
const graphMessage = { id: "stable-id", receivedDateTime: "2026-04-16T12:00:00Z", subject: "Hello", bodyPreview: "Preview", from: { emailAddress: { name: "Sender", address: "SENDER@example.com" } }, body: { contentType: "text", content: "Message body" }, internetMessageHeaders: [{ name: "List-Unsubscribe", value: "first" }, { name: "List-Unsubscribe", value: "second" }] };

beforeEach(() => {
  jest.clearAllMocks();
  mockLoad.mockReturnValue({ providerType: "microsoft", microsoft: { accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 3_600_000 } });
  mockAnalyze.mockResolvedValue({ text: "Message body", textTruncated: false } as Awaited<ReturnType<typeof analyzeMessage>>);
  fetchMock = jest.spyOn(globalThis, "fetch");
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it("uses a valid stored token and requests immutable IDs", async () => {
  fetchMock.mockResolvedValue(json({ userPrincipalName: "user@example.com" }));
  const provider = createMicrosoftProvider();
  expect(provider.isAuthenticated()).toBe(true);
  await expect(provider.connect()).resolves.toEqual({ type: "microsoft-oauth", email: "user@example.com" });
  expect(fetchMock.mock.calls[0][1].headers).toEqual(expect.objectContaining({ Authorization: "Bearer access", Prefer: 'IdType="ImmutableId"' }));
  mockLoad.mockReturnValue(undefined);
  expect(provider.isAuthenticated()).toBe(false);
  await expect(provider.connect()).rejects.toThrow("No Microsoft credentials");
});

it("refreshes expiring tokens and persists rotated refresh credentials", async () => {
  mockLoad.mockReturnValue({ providerType: "microsoft", microsoft: { accessToken: "old", refreshToken: "old-refresh", expiresAt: 0 } });
  fetchMock.mockResolvedValueOnce(json({ access_token: "new", refresh_token: "new-refresh", expires_in: 7200 })).mockResolvedValueOnce(json({ mail: "user@example.com" }));
  await createMicrosoftProvider().connect();
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ microsoft: expect.objectContaining({ accessToken: "new", refreshToken: "new-refresh" }) }));
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer new");
});

test.each([{ error: "invalid_grant", error_description: "revoked" }, {}])("rejects a failed refresh without calling Graph: %j", async (data) => {
  mockLoad.mockReturnValue({ providerType: "microsoft", microsoft: { accessToken: "old", refreshToken: "refresh", expiresAt: 0 } });
  fetchMock.mockResolvedValue(json(data));
  await expect(createMicrosoftProvider().connect()).rejects.toThrow(/refresh/i);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(mockSave).not.toHaveBeenCalled();
});

it("uses PKCE when authorizing and saves credentials only after token exchange", async () => {
  mockLoopback.mockImplementation(async (_base, buildUrl, open) => {
    const url = new URL(buildUrl("http://localhost:1234"));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(open).toBe(false);
    return { code: "authorization-code", redirectUri: "http://localhost:1234" };
  });
  fetchMock.mockResolvedValue(json({ access_token: "new", refresh_token: "refresh" }));
  await expect(startMicrosoftLoopbackAuth(false)).resolves.toEqual({ success: true });
  const params = fetchMock.mock.calls[0][1].body as URLSearchParams;
  expect(params.get("code_verifier")).toHaveLength(43);
  expect(params.get("code")).toBe("authorization-code");
  expect(mockSave).toHaveBeenCalledTimes(1);
});

test.each([[400, { error: "invalid_request" }], [200, { error: "denied", error_description: "Cancelled" }], [200, {}]])("returns an authorization error for status %i and body %j", async (status, body) => {
  mockLoopback.mockResolvedValue({ code: "code", redirectUri: "http://localhost:1234" });
  fetchMock.mockResolvedValue(json(body, status));
  expect((await startMicrosoftLoopbackAuth()).success).toBe(false);
  expect(mockSave).not.toHaveBeenCalled();
});

it("returns an error when browser authorization is cancelled", async () => {
  mockLoopback.mockRejectedValue(new Error("Cancelled"));
  await expect(startMicrosoftLoopbackAuth()).resolves.toEqual({ success: false, error: "Cancelled" });
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([{ mail: "mail@example.com", userPrincipalName: "other@example.com" }, { userPrincipalName: "mail@example.com" }])("finds the profile email: %j", async (profile) => {
  fetchMock.mockResolvedValue(json(profile));
  await expect(fetchMicrosoftProfileEmail("access")).resolves.toBe("mail@example.com");
});

it("handles missing, rejected, and unavailable profiles", async () => {
  fetchMock.mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({}, 401)).mockRejectedValueOnce(new Error("Offline"));
  for (let i = 0; i < 3; i++) await expect(fetchMicrosoftProfileEmail("access")).resolves.toBeUndefined();
});

it("preserves body and repeated headers when analyzing a message", async () => {
  fetchMock.mockResolvedValue(json(graphMessage));
  const result = await createMicrosoftProvider().getMessage("stable-id");
  expect(result).toEqual(expect.objectContaining({ id: "stable-id", senderEmail: "sender@example.com", subject: "Hello", sizeBytes: 12 }));
  expect(mockAnalyze).toHaveBeenCalledWith({ text: "Message body", headers: { "List-Unsubscribe": ["first", "second"] } }, expect.any(Object));
  fetchMock.mockResolvedValue(json({ ...graphMessage, body: { contentType: "html", content: "<p>Hello</p>" } }));
  await createMicrosoftProvider().getMessage("stable-id");
  expect(mockAnalyze.mock.calls[1][0].html).toBe("<p>Hello</p>");
});

it("filters excluded folders, batches body fetches, and preserves pagination", async () => {
  fetchMock.mockImplementation(async (input: string) => {
    if (input.includes("/mailFolders/")) return json({ id: "excluded" });
    if (input.endsWith("/$batch")) return json({ responses: [{ id: "0", status: 200, body: graphMessage }, { id: "1", status: 404 }] });
    return json({ value: [{ id: "stable-id", parentFolderId: "inbox" }, { id: "spam", parentFolderId: "excluded" }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?next=2" });
  });
  const progress = jest.fn(), provider = createMicrosoftProvider();
  const result = await provider.listMessages(new Date("2026-04-01"), new Date("2026-05-01"), undefined, progress);
  expect(result.messages.map((message) => message.id)).toEqual(["stable-id"]);
  expect(result.nextPageToken).toContain("next=2");
  expect(progress).toHaveBeenCalledWith(1);
  const request = JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith("/$batch"))[1].body).requests;
  expect(request).toHaveLength(1);
  expect(request[0].headers.Prefer).toContain("ImmutableId");
  await provider.listMessages(new Date(), undefined, result.nextPageToken);
  expect(fetchMock.mock.calls.filter(([url]) => url.includes("/mailFolders/"))).toHaveLength(4);
});

it("returns empty pages without fetching message bodies", async () => {
  fetchMock.mockResolvedValue(json({ value: [] }));
  await expect(createMicrosoftProvider().listMessages(new Date())).resolves.toEqual({ messages: [] });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("uses bounded retry-after delays for throttled reads and propagates errors", async () => {
  jest.useFakeTimers();
  fetchMock.mockResolvedValueOnce(json({}, 429, { "Retry-After": "2" })).mockResolvedValueOnce(json({ mail: "user@example.com" }));
  const pending = createMicrosoftProvider().connect();
  await jest.runAllTimersAsync();
  await expect(pending).resolves.toEqual({ type: "microsoft-oauth", email: "user@example.com" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockResolvedValue(json({}, 403));
  await expect(createMicrosoftProvider().connect()).rejects.toThrow("403");
});

it("routes trash, spam, and read mutations to the correct Graph operations", async () => {
  fetchMock.mockImplementation(async () => json({}));
  const provider = createMicrosoftProvider();
  await provider.trashMessage("id");
  await provider.markAsSpam("id");
  await provider.markAsRead("id", true);
  expect(fetchMock.mock.calls.map(([, init]) => [init.method, JSON.parse(init.body)])).toEqual([
    ["POST", { destinationId: "deleteditems" }], ["POST", { destinationId: "junkemail" }], ["PATCH", { isRead: true }],
  ]);
  await provider.disconnect();
});

it("sends once and finds the sent message by both subject and recipient", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 })).mockResolvedValueOnce(json({ value: [
    { subject: "Request", internetMessageId: "wrong", toRecipients: [{ emailAddress: { address: "other@example.com" } }] },
    { subject: "Request", internetMessageId: "right", toRecipients: [{ emailAddress: { address: "TO@example.com" } }] },
  ] }));
  await expect(createMicrosoftProvider().sendEmail("to@example.com", "Request", "Body")).resolves.toBe("right");
  expect(fetchMock.mock.calls[0][1].method).toBe("POST");
});

it("does not replay failed sends or fail a successful send when Sent Items is unavailable", async () => {
  const provider = createMicrosoftProvider();
  fetchMock.mockResolvedValueOnce(json({}, 429));
  await expect(provider.sendEmail("to@example.com", "Request", "Body")).rejects.toThrow("429");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 })).mockResolvedValueOnce(json({}, 403));
  await expect(provider.sendEmail("to@example.com", "Request", "Body")).resolves.toBeUndefined();
});

it("gets bounded date-range counts and tolerates unsupported estimates", async () => {
  const provider = createMicrosoftProvider();
  fetchMock.mockResolvedValueOnce(json({ "@odata.count": 23 })).mockResolvedValueOnce(json({}, 500));
  await expect(provider.getMessageCount(new Date("2026-04-01"), new Date("2026-05-01"))).resolves.toBe(23);
  const url = new URL(fetchMock.mock.calls[0][0]);
  expect(url.searchParams.get("$filter")).toContain("receivedDateTime lt 2026-05-01");
  await expect(provider.getMessageCount(new Date())).resolves.toBeUndefined();
});
