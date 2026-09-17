const mockGate = jest.fn(async (request: () => Promise<Response>, _options?: { retry?: boolean }) => request());
const mockFetch = jest.fn();
jest.mock("./gmail-request", () => ({
  gmailRequest: mockGate,
  GmailApiError: class extends Error {},
}));
jest.mock("../credentials", () => ({
  loadCredentials: () => ({ gmail: { accessToken: "test", expiresAt: Number.MAX_SAFE_INTEGER } }),
  saveCredentials: jest.fn(),
}));
jest.mock("./utils", () => ({ buildRfc822Message: () => "mail", runLoopbackAuth: jest.fn() }));
jest.mock("@paperweight/analysis", () => ({ analyzeMessage: jest.fn() }));
jest.mock("../services/settings", () => ({ getSetting: jest.fn() }));
jest.mock("../utils/log", () => ({ syncLog: { error: jest.fn() }, authLog: { error: jest.fn() } }));

let provider: ReturnType<typeof import("./gmail").createGmailProvider>;
beforeAll(() => {
  Object.assign(globalThis, { __GOOGLE_CLIENT_ID__: "test", __GOOGLE_CLIENT_SECRET__: "test" });
  provider = require("./gmail").createGmailProvider();
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
  mockFetch.mockImplementation(async () => {
    // Every actual network request must have entered the pacing gate first.
    expect(mockGate.mock.calls.length).toBe(mockFetch.mock.calls.length);
    return new Response(JSON.stringify({ emailAddress: "test@example.com", resultSizeEstimate: 0 }));
  });
});
afterEach(() => jest.restoreAllMocks());

test.each(["connect", "trashMessage", "markAsSpam", "markAsRead", "getMessageCount", "getRemovalCursor"] as const)(
  "%s cannot bypass the Gmail pacing gate", async (method) => {
    if (method === "getMessageCount") await provider.getMessageCount!(new Date());
    else if (method === "markAsRead") await provider.markAsRead!("message", true);
    else if (method === "trashMessage" || method === "markAsSpam") await provider[method]("message");
    else await provider[method]!();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockGate).toHaveBeenCalledTimes(1);
  },
);
test("send uses the gate but explicitly disables replay", async () => {
  await provider.sendEmail("to@example.com", "subject", "body");
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(mockGate).toHaveBeenLastCalledWith(expect.any(Function), { retry: false });
});
