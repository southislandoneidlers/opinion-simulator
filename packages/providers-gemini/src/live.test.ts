import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecutionPlan, StructuredResult } from "@opinion-simulator/core";
import { geminiCredentialAvailable, liveGeminiGenerate } from "./live";

const FAKE_KEY = "FAKE-GEMINI-KEY-FOR-TESTS";

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
    provider: "gemini",
    model: "gemini-3.6-flash",
    endpointClass: "google-generativelanguage",
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

describe("liveGeminiGenerate", () => {
  const previousEnv = process.env.GEMINI_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousEnv === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousEnv;
    }
  });

  it("uses only the explicit main-process key and canonical v2 prompt", async () => {
    const result = makeStructuredResult();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] })
    });
    vi.stubGlobal("fetch", fetchMock);
    const live = await liveGeminiGenerate(makePlan(), { apiKey: FAKE_KEY });
    expect(live.result).toEqual(result);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe(FAKE_KEY);
    const prompt = JSON.parse(String(init.body)).contents[0].parts[0].text as string;
    const order = ["SYSTEM-RULES", "OUTPUT-SCHEMA", "MODEL-SAMPLING", "PERSONA-JSON", "SOURCE-TEXT"].map(
      (marker) => prompt.indexOf(marker)
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("never falls back to GEMINI_API_KEY", async () => {
    process.env.GEMINI_API_KEY = FAKE_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(liveGeminiGenerate(makePlan())).rejects.toThrow("credential is not available");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(geminiCredentialAvailable()).toBe(false);
  });

  it("rejects a plan for another provider before a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      liveGeminiGenerate(makePlan({ provider: "openai" }), { apiKey: FAKE_KEY })
    ).rejects.toThrow("not gemini");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
