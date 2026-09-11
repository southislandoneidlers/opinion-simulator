import { describe, expect, it } from "vitest";
import { confirmManualPersona } from "./persona";
import {
  ACTIVE_PROVIDER_IDS,
  assemblePrompt,
  approvePreflight,
  assertCurrentPreflightApproval,
  batchPreflightView,
  makeExecutionPlan,
  planHash,
  PROMPT_TEMPLATE_VERSION,
  PROVIDER_METADATA,
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

describe("batch Preflight estimates", () => {
  it("sums each Persona plan instead of multiplying the first estimate", () => {
    const first = makePlan();
    const second = {
      ...makePlan(),
      estimate: {
        ...makePlan().estimate,
        approximateInputTokensPerRequest: first.estimate.approximateInputTokensPerRequest + 100
      }
    };
    const view = batchPreflightView({
      batchId: "batch-001",
      sourceId: "source-001",
      questionCount: 1,
      sampleCount: 3,
      plans: [
        { personaId: "persona-001", label: "甲", plan: first, runId: "run-001" },
        { personaId: "persona-002", label: "乙", plan: second, runId: "run-002" }
      ],
      provider: "gemini",
      model: "gemini-3.6-flash",
      endpointClass: "google-generativelanguage",
      createdAt: "2026-09-03T00:00:00Z"
    });

    expect(view.estimate.approximateTotalInputTokens).toBe(
      (first.estimate.approximateInputTokensPerRequest +
        second.estimate.approximateInputTokensPerRequest) *
        3
    );
  });
});

describe("OpenRouter provider plan and metadata", () => {
  it("includes openrouter in PROVIDER_METADATA and ACTIVE_PROVIDER_IDS", () => {
    expect(PROVIDER_METADATA.openrouter.label).toBe("OpenRouter");
    expect(PROVIDER_METADATA.openrouter.defaultModel).toBe("openai/gpt-4o-mini");
    expect(PROVIDER_METADATA.openrouter.endpointClass).toBe("openrouter-chat-completions");
    expect(PROVIDER_METADATA.openrouter.models).toContain("openai/gpt-4o-mini");
  });

  it("creates a valid ExecutionPlan targeting OpenRouter", () => {
    const persona = makePersona();
    const plan = makeExecutionPlan({
      sourceId: "source-001",
      sourceText: "測試內文。",
      persona,
      questionSet: {
        id: "questions-001",
        title: "測試問題",
        questions: ["問題一？"],
        responseInstructions: ""
      },
      settings: {
        provider: "openrouter",
        model: "openai/gpt-4o-mini",
        endpointClass: "openrouter-chat-completions",
        sampleCount: 1,
        temperature: null,
        maxOutputTokens: null,
        seed: null
      },
      runId: "run-or-001"
    });
    expect(plan.provider).toBe("openrouter");
    expect(plan.model).toBe("openai/gpt-4o-mini");
    expect(plan.endpointClass).toBe("openrouter-chat-completions");
    expect(planHash(plan)).toMatch(/^[a-f0-9]{64}$/);
    const assembled = assemblePrompt(plan);
    expect(assembled).toContain("測試內文。");
    expect(assembled).toContain("問題一？");
  });

  it("preserves backward compatibility with legacy openai plans", () => {
    const persona = makePersona();
    const legacyPlan = makeExecutionPlan({
      sourceId: "source-legacy",
      sourceText: "舊材料。",
      persona,
      questionSet: {
        id: "questions-001",
        title: "舊問題",
        questions: ["舊問題一？"],
        responseInstructions: ""
      },
      settings: {
        provider: "openai",
        model: "gpt-5.6-luna",
        endpointClass: "openai-chat-completions",
        sampleCount: 1,
        temperature: null,
        maxOutputTokens: null,
        seed: null
      },
      runId: "run-legacy-001"
    });
    expect(legacyPlan.provider).toBe("openai");
    expect(planHash(legacyPlan)).toMatch(/^[a-f0-9]{64}$/);
  });
});
