import { POST } from "./route";

const oldApiKey = process.env.POLAR_API_KEY;
const oldOrganizationId = process.env.POLAR_ORGANIZATION_ID;
afterEach(() => {
  if (oldApiKey === undefined) delete process.env.POLAR_API_KEY; else process.env.POLAR_API_KEY = oldApiKey;
  if (oldOrganizationId === undefined) delete process.env.POLAR_ORGANIZATION_ID; else process.env.POLAR_ORGANIZATION_ID = oldOrganizationId;
  jest.restoreAllMocks();
});
const request = (body: unknown) => new Request("http://localhost/api/license", { method: "POST", body: JSON.stringify(body) });

it("returns service unavailable without Polar configuration and rejects malformed keys", async () => {
  delete process.env.POLAR_API_KEY;
  delete process.env.POLAR_ORGANIZATION_ID;
  expect((await POST(request({ key: "valid-looking" }))).status).toBe(503);
  process.env.POLAR_API_KEY = "token";
  process.env.POLAR_ORGANIZATION_ID = "org";
  expect((await POST(request({ key: 42 }))).status).toBe(400);
});

it("returns an ordinary invalid result when Polar reports an unknown key", async () => {
  process.env.POLAR_API_KEY = "token";
  process.env.POLAR_ORGANIZATION_ID = "org";
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "{\"detail\":\"missing\"}" }) as any;
  const response = await POST(request({ key: "unknown" }));
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ valid: false, details: { detail: "missing" } });
});

it("validates granted keys and creates a customer portal when available", async () => {
  process.env.POLAR_API_KEY = "token";
  process.env.POLAR_ORGANIZATION_ID = "org";
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ status: "granted", customer_id: "cust-1" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ customer_portal_url: "https://portal.example.test" }) }) as any;
  const response = await POST(request({ key: "granted" }));
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ valid: true, tier: "lifetime", portalUrl: "https://portal.example.test" });
});
