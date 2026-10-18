import { generateBreachContentSections } from "./llm";

const breach = { company_name: "Acme", domain: "acme.test", breach_date: "2024-01-02", added_date: "2024-02-03", pwn_count: 1200, data_classes: ["email", "passwords"], is_verified: true, description: "<p>Incident</p>", attribution: "Group X" };
const goodSections = { aboutCompany: " Acme makes tools. ", keyTakeaways: [" One. ", "Two.", "Three."], incidentAndExposure: "Exposure", timelineAndCause: "Timeline", nextSteps: "Reset the exposed password." };
const oldKey = process.env.OPENROUTER_API_KEY;
afterEach(() => {
  if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey;
  jest.restoreAllMocks();
});

it("requires an OpenRouter key and surfaces upstream failures", async () => {
  delete process.env.OPENROUTER_API_KEY;
  await expect(generateBreachContentSections(breach, [])).rejects.toThrow("OPENROUTER_API_KEY is not set");
  process.env.OPENROUTER_API_KEY = "token";
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 429, text: async () => "limited" } as Response);
  await expect(generateBreachContentSections(breach, [])).rejects.toThrow("OpenRouter 429: limited");
});

it("builds grounded context and validates the generated sections", async () => {
  process.env.OPENROUTER_API_KEY = "token";
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(goodSections)}\n\`\`\`` } }] }) } as Response);
  const result = await generateBreachContentSections(breach, [{ fine_eur: 1200000, authority: "DPA", decision_date: "2024-03-01", articles_violated: "Art 5" }], [{ type: "same-attribution", company: "Beta", breach_date: "2023-01-01", pwn_count: 1000, attribution: "Group X" }], [{ url: "https://source.test", title: "Notice", snippet: "Official notice" }]);
  expect(result.aboutCompany).toBe("Acme makes tools.");
  const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(body.messages[1].content).toContain("Attribution: Group X");
  expect(body.messages[1].content).toContain("EUR 1.2M by DPA");
  expect(body.messages[1].content).toContain("Grounding sources");
});

it("rejects malformed or incomplete model output", async () => {
  process.env.OPENROUTER_API_KEY = "token";
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "not json" } }] }) } as Response);
  await expect(generateBreachContentSections(breach, [])).rejects.toThrow();
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "{}" } }] }) } as Response);
  await expect(generateBreachContentSections(breach, [])).rejects.toThrow("LLM output missing required content fields");
});
