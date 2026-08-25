import { DEFAULT_RULES, DISCLAIMER } from "./disclaimer";
import { hashJson, sha256Bytes } from "./hash";
import type { PersonaVersion } from "./persona";

export type QuestionSet = {
  id: string;
  title: string;
  questions: string[];
  responseInstructions: string;
};

export type ExecutionSettings = {
  provider: "gemini";
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
  provider: "gemini";
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
  const questions = questionSet.questions.map((question, index) => `${index + 1}. ${question}`).join("\n");
  const schema = {
    ...RESULT_SHAPE,
    sourceMappings: [{ sourceId, excerpt: "exact text", supports: "claim" }]
  };
  return {
    systemAndTaskRules: DEFAULT_RULES,
    persona: JSON.stringify(
      {
        personaVersionId: persona.id,
        label: persona.label,
        fields: persona.fields,
        notProvidedFields: persona.notProvidedFields,
        acceptedInferences: persona.inferences.filter((item) => item.decision === "accepted")
      },
      null,
      2
    ),
    sourceMaterial: sourceText,
    questions,
    outputSchema: JSON.stringify(schema, null, 2),
    modelAndSampling: JSON.stringify(
      {
        provider: settings.provider,
        model: settings.model,
        sampleCount: settings.sampleCount,
        settings: {
          temperature: settings.temperature,
          maxOutputTokens: settings.maxOutputTokens,
          seed: settings.seed
        }
      },
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
      version: 1,
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
      "v0.1 desktop tracer: Keychain storage is a later milestone. Live Gemini, if used, reads a process credential in the main process only.",
      DISCLAIMER
    ],
    predictionDisclaimer: DISCLAIMER,
    requiresRealPersonReconfirmation: false
  };
}
