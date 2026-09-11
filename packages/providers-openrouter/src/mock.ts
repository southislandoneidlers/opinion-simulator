import type { StructuredResult } from "@opinion-simulator/core";

export function mockOpenrouterResult(input: {
  sourceId: string;
  sourceText: string;
  questions: string[];
}): { result: StructuredResult; rawResponse: unknown } {
  const excerpt = input.sourceText.slice(0, 24);
  const usableExcerpt = input.sourceText.includes(excerpt) ? excerpt : input.sourceText.slice(0, 8);
  const result: StructuredResult = {
    directReaction:
      "我先就現有材料回應：方向可以討論，但還看不到足夠的執行條件，所以只能有條件支持。",
    position: "有條件支持，需補執行條件。",
    reasons: ["材料已提出可分階段或局部起步的做法。"],
    concerns: ["材料尚未把責任、資源與判定標準寫清楚。"],
    personaRecommendations: ["執行前補上責任分工與最小可行範圍。"],
    systemSuggestions: ["系統層面應把未說明的資源來源標為計畫缺口。"],
    sourceMappings: [
      {
        sourceId: input.sourceId,
        excerpt: usableExcerpt,
        supports: "回應以貼上的 Source 片段為依據。"
      }
    ],
    assumptions: ["假設問題是在詢問整體方向是否可行。"],
    uncertainties: ["這是模擬預測，不是真實引言。"],
    answers: input.questions.map((question) => ({
      question,
      answer: "有條件支持，需補執行條件。"
    })),
    validationState: "valid"
  };
  return {
    result,
    rawResponse: { provider: "openrouter", mode: "mocked", text: result.directReaction }
  };
}
