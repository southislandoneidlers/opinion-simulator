import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecutionPlan, StructuredResult } from "@opinion-simulator/core";
import {
  liveOpenrouterGenerate,
  openrouterCredentialAvailable,
  OPENROUTER_CHAT_ENDPOINT
} from "./live";

const FAKE_KEY = "FAKE-OPENROUTER-KEY-FOR-TESTS";

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
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    endpointClass: "openrouter-chat-completions",
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

describe("liveOpenrouterGenerate", () => {
  const previousEnv = process.env.OPENROUTER_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousEnv === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = previousEnv;
    }
  });

  function stubFetch(responseBody: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(responseBody)
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("sends one chat completion with the assembled prompt, explicit key, and OpenRouter headers", async () => {
    const result = makeStructuredResult();
    const fetchMock = stubFetch({
      choices: [{ message: { content: JSON.stringify(result) } }]
    });

    const live = await liveOpenrouterGenerate(makePlan(), { apiKey: FAKE_KEY });
    expect(live.result.directReaction).toContain("預算透明");
    expect(live.rawResponse).toEqual({
      text: JSON.stringify(result),
      model: "openai/gpt-4o-mini",
      provider: "openrouter"
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OPENROUTER_CHAT_ENDPOINT);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(headers["HTTP-Referer"]).toBe("https://github.com/earendil-works/opinion-simulator");
    expect(headers["X-Title"]).toBe("Opinion Simulator");

    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("openai/gpt-4o-mini");
    expect(body.response_format).toEqual({ type: "json_object" });

    // Canonical v2 ordering: static sections first, per-Run content last
    const content = body.messages[0].content;
    const order = ["SYSTEM-RULES", "OUTPUT-SCHEMA", "MODEL-SAMPLING", "PERSONA-JSON", "你會支持這項計畫嗎？", "SOURCE-TEXT"].map(
      (marker) => content.indexOf(marker)
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("does not read process.env when the main-process key is absent", async () => {
    process.env.OPENROUTER_API_KEY = FAKE_KEY;
    const fetchMock = stubFetch({});
    await expect(liveOpenrouterGenerate(makePlan())).rejects.toThrow("credential is not available");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openrouterCredentialAvailable()).toBe(false);
  });

  it("refuses plans whose provider is not openrouter", async () => {
    const fetchMock = stubFetch({});
    await expect(
      liveOpenrouterGenerate(makePlan({ provider: "gemini" }), { apiKey: FAKE_KEY })
    ).rejects.toThrow(/provider is gemini, not openrouter/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces provider HTTP errors without leaking the key", async () => {
    stubFetch({ error: { message: "Model openai/gpt-4o-mini not found" } }, false, 404);
    await expect(liveOpenrouterGenerate(makePlan(), { apiKey: FAKE_KEY })).rejects.toThrow(
      "OpenRouter 請求失敗：Model openai/gpt-4o-mini not found"
    );
  });

  it("surfaces timeout errors cleanly", async () => {
    const slowFetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", slowFetch);

    await expect(
      liveOpenrouterGenerate(makePlan(), { apiKey: FAKE_KEY, timeoutMs: 10 })
    ).rejects.toThrow(/OpenRouter 請求逾時/);
  });

  it("rejects non-JSON provider responses", async () => {
    stubFetch({ choices: [{ message: { content: "<html>502 Bad Gateway</html>" } }] });
    await expect(liveOpenrouterGenerate(makePlan(), { apiKey: FAKE_KEY })).rejects.toThrow(
      "OpenRouter response was not valid JSON"
    );
  });

  it("rejects JSON responses that do not match the structured Result contract", async () => {
    stubFetch({ choices: [{ message: { content: JSON.stringify({ unexpected: "payload" }) } }] });
    await expect(liveOpenrouterGenerate(makePlan(), { apiKey: FAKE_KEY })).rejects.toThrow(
      "OpenRouter JSON did not match the structured Result contract"
    );
  });
});
