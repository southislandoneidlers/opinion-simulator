import { DEFAULT_RULES, DISCLAIMER } from "./disclaimer";
import { hashJson, sha256Bytes, sortKeys } from "./hash";
import type { PersonaVersion } from "./persona";

/**
 * v0.2 increment 3: version 2 assembles the sent prompt with repeated/static
 * sections first (system rules, output schema, model/sampling) and per-Run
 * content last (Persona, questions, Source) for token savings and cache
 * friendliness. Version 1 interleaved per-Run content early; old Projects
 * carrying version 1 remain readable and their stored plan hashes untouched.
 */
export const PROMPT_TEMPLATE_VERSION = 2;

export type ProviderId = "gemini" | "openai";

export type ProviderMetadata = {
  label: string;
  models: readonly string[];
  defaultModel: string;
  endpointClass: string;
};

/** One provider catalogue shared by the main process and the Renderer. */
export const PROVIDER_METADATA: Record<ProviderId, ProviderMetadata> = {
  gemini: {
    label: "Google Gemini",
    models: ["gemini-3.6-flash"],
    defaultModel: "gemini-3.6-flash",
    endpointClass: "google-generativelanguage"
  },
  openai: {
    label: "OpenAI",
    models: ["gpt-5.6-luna"],
    defaultModel: "gpt-5.6-luna",
    endpointClass: "openai-chat-completions"
  }
};

export type QuestionSet = {
  id: string;
  title: string;
  questions: string[];
  responseInstructions: string;
};

export type ExecutionSettings = {
  provider: ProviderId;
  model: string;
  endpointClass: string;
  sampleCount: 1 | 3;
  temperature: number | null;
  maxOutputTokens: number | null;
  seed: number | null;
};

export type PromptSections = {
  systemAndTaskRules: string;
  persona: string;
  sourceMaterial: string;
  questions: string;
  outputSchema: string;
  modelAndSampling: string;
};

export type ExecutionPlan = {
  sourceRefs: Array<{ sourceId: string; sha256: string }>;
  personaRefs: Array<{
    personaId: string;
    version: number;
    personaVersionId: string;
    contentHash: string;
  }>;
  questionSet: QuestionSet;
  promptTemplate: { id: string; version: number; contentHash: string };
  renderedPromptSections: PromptSections;
  provider: ProviderId;
  model: string;
  endpointClass: string;
  settings: { temperature: number | null; maxOutputTokens: number | null; seed: number | null };
  sampleCount: 1 | 3;
  sampleIds: string[];
  truncation: { strategy: string; applied: boolean };
  estimate: {
    method: string;
    inputCharactersPerRequest: number;
    approximateInputTokensPerRequest: number;
    requestCount: number;
  };
};

export type PreflightApproval = {
  schemaVersion: "0.0";
  runId: string;
  planHash: string;
  approvedAt: string;
  acknowledgedDisclaimer: true;
  realPersonReconfirmed: boolean;
};

export const RESULT_SHAPE = {
  directReaction: "natural-language Persona reaction",
  position: "string",
  reasons: ["string"],
  concerns: ["string"],
  personaRecommendations: ["string"],
  systemSuggestions: ["string"],
  sourceMappings: [{ sourceId: "source-id", excerpt: "exact text", supports: "claim" }],
  assumptions: ["string"],
  uncertainties: ["string"],
  answers: [{ question: "exact user question", answer: "string" }],
  validationState: "valid | partial | invalid"
};

export function renderPromptSections(
  persona: PersonaVersion,
  sourceText: string,
  sourceId: string,
  questionSet: QuestionSet,
  settings: ExecutionSettings
): PromptSections {
  const questionList = questionSet.questions
    .map((question, index) => `${index + 1}. ${question}`)
    .join("\n");
  const questions = questionSet.responseInstructions
    ? `${questionList}\n\nResponse instructions: ${questionSet.responseInstructions}`
    : questionList;
  const schema = {
    ...RESULT_SHAPE,
    sourceMappings: [
      {
        sourceId: "sourceId from SOURCE MATERIAL",
        excerpt: "exact text from SOURCE MATERIAL",
        supports: "claim"
      }
    ]
  };
  return {
    systemAndTaskRules: DEFAULT_RULES,
    persona: JSON.stringify(
      sortKeys({
        personaVersionId: persona.id,
        label: persona.label,
        fields: persona.fields,
        notProvidedFields: persona.notProvidedFields,
        acceptedInferences: persona.inferences.filter((item) => item.decision === "accepted")
      }),
      null,
      2
    ),
    sourceMaterial: `SOURCE-ID: ${sourceId}\nSOURCE-TEXT:\n${sourceText}`,
    questions,
    outputSchema: JSON.stringify(sortKeys(schema), null, 2),
    modelAndSampling: JSON.stringify(
      sortKeys({
        provider: settings.provider,
        model: settings.model,
        sampleCount: settings.sampleCount,
        settings: {
          temperature: settings.temperature,
          maxOutputTokens: settings.maxOutputTokens,
          seed: settings.seed
        }
      }),
      null,
      2
    )
  };
}

export function makeExecutionPlan(input: {
  sourceId: string;
  sourceText: string;
  persona: PersonaVersion;
  questionSet: QuestionSet;
  settings: ExecutionSettings;
  runId: string;
}): ExecutionPlan {
  if (input.settings.sampleCount !== 1 && input.settings.sampleCount !== 3) {
    throw new Error("sampleCount must be 1 or 3");
  }
  const sections = renderPromptSections(
    input.persona,
    input.sourceText,
    input.sourceId,
    input.questionSet,
    input.settings
  );
  const inputCharacters = Object.values(sections).reduce((sum, value) => sum + value.length, 0);
  const sampleIds = Array.from({ length: input.settings.sampleCount }, (_, index) => {
    const n = String(index + 1).padStart(3, "0");
    return `${input.runId}-sample-${n}`;
  });
  return {
    sourceRefs: [{ sourceId: input.sourceId, sha256: sha256Bytes(input.sourceText) }],
    personaRefs: [
      {
        personaId: input.persona.personaId,
        version: input.persona.version,
        personaVersionId: input.persona.id,
        contentHash: input.persona.contentHash ?? ""
      }
    ],
    questionSet: input.questionSet,
    promptTemplate: {
      id: "default-persona-simulation",
      version: PROMPT_TEMPLATE_VERSION,
      contentHash: sha256Bytes(DEFAULT_RULES)
    },
    renderedPromptSections: sections,
    provider: input.settings.provider,
    model: input.settings.model,
    endpointClass: input.settings.endpointClass,
    settings: {
      temperature: input.settings.temperature,
      maxOutputTokens: input.settings.maxOutputTokens,
      seed: input.settings.seed
    },
    sampleCount: input.settings.sampleCount,
    sampleIds,
    truncation: { strategy: "none", applied: false },
    estimate: {
      method: "character-count-divided-by-four; non-billing heuristic",
      inputCharactersPerRequest: inputCharacters,
      approximateInputTokensPerRequest: Math.ceil(inputCharacters / 4),
      requestCount: input.settings.sampleCount
    }
  };
}

export function planHash(plan: ExecutionPlan): string {
  return hashJson(plan);
}

export function approvePreflight(input: {
  plan: ExecutionPlan;
  runId: string;
  presentedPlanHash: string;
  acknowledgedDisclaimer: boolean;
  realPersonReconfirmed: boolean;
  approvedAt: string;
}): PreflightApproval {
  if (!input.acknowledgedDisclaimer) {
    throw new Error("Preflight 必須先承認預測聲明");
  }
  const currentPlanHash = planHash(input.plan);
  if (input.presentedPlanHash !== currentPlanHash) {
    throw new Error("Preflight 已過期；材料、Persona、問題或設定已變更，請重新檢視並承認目前計畫。");
  }
  return {
    schemaVersion: "0.0",
    runId: input.runId,
    planHash: currentPlanHash,
    approvedAt: input.approvedAt,
    acknowledgedDisclaimer: true,
    realPersonReconfirmed: input.realPersonReconfirmed
  };
}

export function assertCurrentPreflightApproval(
  plan: ExecutionPlan,
  runId: string,
  approval: PreflightApproval
): void {
  if (approval.runId !== runId || approval.planHash !== planHash(plan) || !approval.acknowledgedDisclaimer) {
    throw new Error("Preflight 核准與目前執行計畫不相符；拒絕執行。");
  }
}

/**
 * Canonical assembly of the full prompt sent to providers. Static/repeated
 * sections come first, per-Run content last. Both desktop providers and the
 * Python Skill share this single contract.
 */
export function assemblePrompt(plan: ExecutionPlan): string {
  const sections = plan.renderedPromptSections;
  const order =
    plan.promptTemplate.version === 1
      ? [
          sections.systemAndTaskRules,
          sections.persona,
          sections.sourceMaterial,
          sections.questions,
          sections.outputSchema,
          sections.modelAndSampling
        ]
      : [
          sections.systemAndTaskRules,
          sections.outputSchema,
          sections.modelAndSampling,
          sections.persona,
          sections.questions,
          sections.sourceMaterial
        ];
  return order.join("\n\n");
}

export function preflightView(plan: ExecutionPlan, createdAt: string, runId: string) {
  return {
    schemaVersion: "0.0",
    runId,
    createdAt,
    planHash: planHash(plan),
    approvalStatus: "pending",
    outbound: {
      source: plan.sourceRefs[0],
      personaVersion: plan.personaRefs[0],
      promptSections: plan.renderedPromptSections
    },
    destination: {
      provider: plan.provider,
      model: plan.model,
      endpointClass: plan.endpointClass
    },
    sampleCount: plan.sampleCount,
    sampleIds: plan.sampleIds,
    estimate: plan.estimate,
    truncation: plan.truncation,
    warnings: [
      "憑證只存在作業系統鑰匙圈（或主程序環境變數 fallback），不會出現在介面或專案檔。Live 呼叫只在你於 Preflight 承認預測聲明後發生。",
      DISCLAIMER
    ],
    predictionDisclaimer: DISCLAIMER,
    requiresRealPersonReconfirmation: false
  };
}

export interface BatchPreflightInput {
  batchId: string;
  sourceId: string;
  sourceTitle?: string;
  questionCount: number;
  sampleCount: number;
  plans: Array<{
    personaId: string;
    label: string;
    plan: ExecutionPlan;
    runId: string;
  }>;
  provider: ProviderId;
  model: string;
  endpointClass: string;
  createdAt: string;
}

export function computeBatchPlanHash(
  batchId: string,
  plans: Array<{ personaId: string; planHash: string }>
): string {
  const normalized = plans
    .map((p) => ({ personaId: p.personaId, planHash: p.planHash }))
    .sort((a, b) => a.personaId.localeCompare(b.personaId));
  return sha256Bytes(JSON.stringify({ batchId, plans: normalized }));
}

export function batchPreflightView(input: BatchPreflightInput) {
  const personaPlans = input.plans.map((p) => ({
    personaId: p.personaId,
    label: p.label,
    planHash: planHash(p.plan),
    runId: p.runId
  }));
  const bPlanHash = computeBatchPlanHash(input.batchId, personaPlans);
  const totalRequests = input.plans.length * input.sampleCount;
  const tokensPerSample = input.plans.reduce(
    (sum, item) => sum + item.plan.estimate.approximateInputTokensPerRequest,
    0
  );
  const tokenPerRequest = input.plans.length > 0 ? Math.ceil(tokensPerSample / input.plans.length) : 0;

  return {
    schemaVersion: "0.0",
    batchId: input.batchId,
    batchPlanHash: bPlanHash,
    createdAt: input.createdAt,
    approvalStatus: "pending",
    source: { sourceId: input.sourceId, title: input.sourceTitle },
    questionCount: input.questionCount,
    sampleCount: input.sampleCount,
    personas: personaPlans,
    matrix: {
      personaCount: input.plans.length,
      questionCount: input.questionCount,
      sampleCount: input.sampleCount,
      totalRequests
    },
    estimate: {
      approximateInputTokensPerRequest: tokenPerRequest,
      approximateTotalInputTokens: tokensPerSample * input.sampleCount
    },
    destination: {
      provider: input.provider,
      model: input.model,
      endpointClass: input.endpointClass
    },
    warnings: [
      "憑證只存在作業系統鑰匙圈（或主程序環境變數 fallback），不會出現在介面或專案檔。Live 呼叫只在承認預測聲明後發生。",
      DISCLAIMER
    ],
    predictionDisclaimer: DISCLAIMER
  };
}
