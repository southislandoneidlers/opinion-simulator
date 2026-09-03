import { describe, expect, it } from "vitest";
import { confirmManualPersona } from "./persona";
import {
  assemblePrompt,
  approvePreflight,
  assertCurrentPreflightApproval,
  makeExecutionPlan,
  planHash,
  PROMPT_TEMPLATE_VERSION,
  type ExecutionPlan
} from "./plan";

function makePersona() {
  return confirmManualPersona({
    id: "persona-version-analyst-v1",
    personaId: "persona-analyst",
    label: "政策分析師",
    rawInput: "我是政策分析師，在意預算透明。",
    fields: { roleAndContext: "我是政策分析師，在意預算透明。" },
    confirmedAt: "2026-08-24T07:00:00Z",
    confirmedBy: "desktop-user",
    realPersonApplies: false
  });
}

function makePlan(): ExecutionPlan {
  const persona = makePersona();
  return makeExecutionPlan({
    sourceId: "source-001",
    sourceText: "第一階段先在三個行政區試辦。",
    persona,
    questionSet: {
      id: "questions-001",
      title: "使用者問題",
      questions: ["你會支持這項計畫嗎？"],
      responseInstructions: ""
    },
    settings: {
      provider: "gemini",
      model: "gemini-3.6-flash",
      endpointClass: "google-generativelanguage",
      sampleCount: 1,
      temperature: null,
      maxOutputTokens: null,
      seed: null
    },
    runId: "run-001"
  });
}

describe("prompt template contract (v2 ordering)", () => {
  it("stamps the current template version into new plans", () => {
    expect(PROMPT_TEMPLATE_VERSION).toBe(2);
    expect(makePlan().promptTemplate.version).toBe(2);
  });

  it("assembles static sections first and per-Run content last", () => {
    const plan = makePlan();
    const s = plan.renderedPromptSections;
    expect(assemblePrompt(plan)).toBe(
      [
        s.systemAndTaskRules, // static: system rules
        s.outputSchema, // static: output schema
        s.modelAndSampling, // static: model/sampling parameters
        s.persona, // per-Run
        s.questions, // per-Run
        s.sourceMaterial // per-Run
      ].join("\n\n")
    );
  });

  it("keeps the output-schema cache prefix independent of each Source id", () => {
    const first = makePlan();
    const second = makeExecutionPlan({
      sourceId: "source-002",
      sourceText: "改寫後的材料。",
      persona: makePersona(),
      questionSet: first.questionSet,
      settings: {
        provider: "gemini",
        model: "gemini-3.6-flash",
        endpointClass: "google-generativelanguage",
        sampleCount: 1,
        temperature: null,
        maxOutputTokens: null,
        seed: null
      },
      runId: "run-002"
    });
    expect(second.renderedPromptSections.outputSchema).toBe(first.renderedPromptSections.outputSchema);
    expect(second.renderedPromptSections.sourceMaterial).toContain("source-002");
  });

  it("preserves the legacy v1 assembly order for old stored plans", () => {
    const plan = makePlan();
    const legacy = { ...plan, promptTemplate: { ...plan.promptTemplate, version: 1 } };
    const s = legacy.renderedPromptSections;
    expect(assemblePrompt(legacy)).toBe(
      [s.systemAndTaskRules, s.persona, s.sourceMaterial, s.questions, s.outputSchema, s.modelAndSampling].join(
        "\n\n"
      )
    );
  });

  it("requires approval for the exact currently rendered plan", () => {
    const plan = makePlan();
    const approval = approvePreflight({
      plan,
      runId: "run-001",
      presentedPlanHash: planHash(plan),
      acknowledgedDisclaimer: true,
      realPersonReconfirmed: false,
      approvedAt: "2026-08-26T00:00:00Z"
    });
    expect(() => assertCurrentPreflightApproval(plan, "run-001", approval)).not.toThrow();
    expect(() =>
      approvePreflight({
        plan,
        runId: "run-001",
        presentedPlanHash: "0".repeat(64),
        acknowledgedDisclaimer: true,
        realPersonReconfirmed: false,
        approvedAt: "2026-08-26T00:00:00Z"
      })
    ).toThrow(/過期/);
  });
});
