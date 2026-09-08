import { describe, expect, it } from "vitest";
import { LEGACY_UNBATCHED_NOTICE, answersByQuestion } from "./batch-comparison";

describe("same-page batch comparison", () => {
  it("aligns answers to shared questions without merging personas", () => {
    const rows = answersByQuestion(
      ["你會支持這項計畫嗎？", "最大的阻力是什麼？"],
      [
        {
          personaLabel: "政策分析師",
          runId: "run-001",
          answers: [
            { question: "你會支持這項計畫嗎？", answer: "有條件支持。" },
            { question: "最大的阻力是什麼？", answer: "資源不足。" }
          ]
        },
        {
          personaLabel: "家長",
          runId: "run-002",
          answers: [
            { question: "你會支持這項計畫嗎？", answer: "先看溝通。" },
            { question: "最大的阻力是什麼？", answer: "資訊不夠。" }
          ]
        }
      ]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.question).toBe("你會支持這項計畫嗎？");
    expect(rows[0]?.answers.map((item) => item.personaLabel)).toEqual(["政策分析師", "家長"]);
    expect(rows[0]?.answers.map((item) => item.answer)).toEqual(["有條件支持。", "先看溝通。"]);
    expect(LEGACY_UNBATCHED_NOTICE).toBe("舊資料未記錄批次");
  });
});
