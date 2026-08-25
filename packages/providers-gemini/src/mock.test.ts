import { describe, expect, it } from "vitest";
import { mockGeminiResult } from "./mock";

describe("mockGeminiResult", () => {
  it("returns a Direct Reaction and separate recommendation provenance", () => {
    const { result } = mockGeminiResult({
      sourceId: "source-policy-001",
      sourceText: "第一階段先在三個行政區試辦。",
      question: "你會支持這項計畫嗎？"
    });
    expect(result.directReaction.length).toBeGreaterThan(0);
    expect(result.personaRecommendations.length).toBeGreaterThan(0);
    expect(result.systemSuggestions.length).toBeGreaterThan(0);
    expect(result.sourceMappings[0]?.excerpt).toBe("第一階段先在三個行政區試辦。");
  });
});
