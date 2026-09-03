import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecutionPlan, StructuredResult } from "@opinion-simulator/core";
import { liveOpenaiGenerate, openaiCredentialAvailable } from "./live";

const FAKE_KEY = "FAKE-OPENAI-KEY-FOR-TESTS";

function makePlan(overrides?: Partial<ExecutionPlan>): ExecutionPlan {
  return {
    sourceRefs: [{ sourceId: "source-001", sha256: "a".repeat(64) }],
    personaRefs: [
      {
        personaId: "persona-001",
        version: 1,
        personaVersionId: "persona-version-001",
        contentHash: "b".repeat(64)
      }
    ],
    questionSet: {
      id: "questions-001",
      title: "使用者問題",
      questions: ["你會支持這項計畫嗎？"],
      responseInstructions: ""
    },
    promptTemplate: { id: "default-persona-simulation", version: 2, contentHash: "c".repeat(64) },
    renderedPromptSections: {
      systemAndTaskRules: "SYSTEM-RULES",
      persona: "PERSONA-JSON",
      sourceMaterial: "SOURCE-TEXT",
      questions: "1. 你會支持這項計畫嗎？",
      outputSchema: "OUTPUT-SCHEMA",
      modelAndSampling: "MODEL-SAMPLING"
    },
    provider: "openai",
    model: "gpt-4o-mini",
    endpointClass: "openai-chat-completions",
    settings: { temperature: null, maxOutputTokens: null, seed: null },
    sampleCount: 1,
    sampleIds: ["sample-001"],
    truncation: { strategy: "none", applied: false },
    estimate: {
      method: "character-count-divided-by-four; non-billing heuristic",
      inputCharactersPerRequest: 100,
      approximateInputTokensPerRequest: 25,
      requestCount: 1
    },
    ...overrides
  };
}

function makeStructuredResult(): StructuredResult {
  return {
    directReaction: "我支持，但要注意預算透明。",
    position: "有條件支持",
    reasons: ["試辦範圍合理"],
    concerns: ["支出公開程度"],
    personaRecommendations: ["應公布每月明細"],
    systemSuggestions: ["建立資訊看板"],
    sourceMappings: [],
    assumptions: [],
    uncertainties: [],
    answers: [{ question: "你會支持這項計畫嗎？", answer: "支持。" }],
    validationState: "valid"
  };
}

describe("liveOpenaiGenerate", () => {
  const previousEnv = process.env.OPENAI_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousEnv === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousEnv;
    }
  });

  function stubFetch(responseBody: unknown, ok = true): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(responseBody)
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("sends one chat completion with the assembled prompt and explicit key", async () => {
    const result = makeStructuredResult();
    const fetchMock = stubFetch({
      choices: [{ message: { content: JSON.stringify(result) } }]
    });
    const live = await liveOpenaiGenerate(makePlan(), { apiKey: FAKE_KEY });
    expect(live.result.directReaction).toContain("預算透明");
    expect(live.rawResponse).toEqual({ text: JSON.stringify(result), model: "gpt-4o-mini" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format).toEqual({ type: "json_object" });
    // Static sections first, per-Run content last — the canonical v2 order:
    // system rules → output schema → model/sampling → persona → questions → source.
    const content = body.messages[0].content;
    const order = ["SYSTEM-RULES", "OUTPUT-SCHEMA", "MODEL-SAMPLING", "PERSONA-JSON", "你會支持這項計畫嗎？", "SOURCE-TEXT"].map(
      (marker) => content.indexOf(marker)
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("does not read an environment variable when the main-process key is absent", async () => {
    process.env.OPENAI_API_KEY = FAKE_KEY;
    const fetchMock = stubFetch({});
    await expect(liveOpenaiGenerate(makePlan())).rejects.toThrow("credential is not available");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openaiCredentialAvailable()).toBe(false);
  });

  it("throws without a credential and never calls the network", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchMock = stubFetch({});
    await expect(liveOpenaiGenerate(makePlan())).rejects.toThrow("credential is not available");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openaiCredentialAvailable(null)).toBe(false);
  });

  it("rejects plans whose provider is not openai", async () => {
    const fetchMock = stubFetch({
      choices: [{ message: { content: JSON.stringify(makeStructuredResult()) } }]
    });
    await expect(
      liveOpenaiGenerate(makePlan({ provider: "gemini" }), { apiKey: FAKE_KEY })
    ).rejects.toThrow("not openai");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces provider errors and rejects malformed or non-contract payloads", async () => {
    const failing = stubFetch({ error: { message: "invalid_api_key" } }, false);
    await expect(liveOpenaiGenerate(makePlan(), { apiKey: FAKE_KEY })).rejects.toThrow(
      "invalid_api_key"
    );

    const badJson = stubFetch({ choices: [{ message: { content: "not-json" } }] });
    await expect(liveOpenaiGenerate(makePlan(), { apiKey: FAKE_KEY })).rejects.toThrow(
      "was not valid JSON"
    );
    vi.unstubAllGlobals();

    const wrongShape = stubFetch({ choices: [{ message: { content: "{}" } }] });
    await expect(liveOpenaiGenerate(makePlan(), { apiKey: FAKE_KEY })).rejects.toThrow(
      "did not match the structured Result contract"
    );
    expect(badJson).toBeDefined();
    expect(wrongShape).toBeDefined();
  });
});
