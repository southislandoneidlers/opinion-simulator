import { randomUUID } from "node:crypto";
import {
  DISCLAIMER,
  confirmManualPersona,
  makeExecutionPlan,
  planHash,
  preflightView,
  slugId,
  type PersonaVersion,
  type StructuredResult
} from "@opinion-simulator/core";
import { readSnapshot, writeCompletedRun } from "@opinion-simulator/project-store";
import { geminiCredentialAvailable, liveGeminiGenerate, mockGeminiResult } from "@opinion-simulator/providers-gemini";

export type DraftState = {
  projectDirectory: string;
  projectId: string;
  title: string;
  sourceText: string;
  sourceId: string;
  personaRaw: string;
  personaLabel: string;
  realPersonApplies: boolean;
  questions: string[];
  persona: PersonaVersion | null;
  createdAt: string;
};

// 目前寫死單一 Gemini 型號；v0.2 多供應商工作將加入選擇器。
const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

const drafts = new Map<string, DraftState>();

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function createDraft(projectDirectory: string, title: string): DraftState {
  const createdAt = nowIso();
  const projectId = slugId("project", title);
  const draft: DraftState = {
    projectDirectory,
    projectId,
    title,
    sourceText: "",
    sourceId: slugId("source", "pasted"),
    personaRaw: "",
    personaLabel: "",
    realPersonApplies: false,
    questions: [],
    persona: null,
    createdAt
  };
  drafts.set(projectDirectory, draft);
  return draft;
}

export function saveDraft(input: Partial<DraftState> & { projectDirectory: string }): DraftState {
  const current = drafts.get(input.projectDirectory);
  if (!current) {
    throw new Error("Project draft is not open");
  }
  const next = { ...current, ...input, persona: current.persona };
  drafts.set(input.projectDirectory, next);
  return next;
}

export function confirmDraftPersona(projectDirectory: string): DraftState {
  const current = drafts.get(projectDirectory);
  if (!current) {
    throw new Error("Project draft is not open");
  }
  // 單一背景輸入：整段原文即為直接支援的角色與情境，不需使用者重複填寫。
  const persona = confirmManualPersona({
    id: slugId("persona-version", current.personaLabel || "persona"),
    personaId: slugId("persona", current.personaLabel || "persona"),
    label: current.personaLabel,
    rawInput: current.personaRaw,
    fields: { roleAndContext: current.personaRaw.trim() },
    confirmedAt: nowIso(),
    confirmedBy: "desktop-user",
    realPersonApplies: current.realPersonApplies,
    warningAcknowledgedAt: current.realPersonApplies ? nowIso() : null
  });
  const next = { ...current, persona };
  drafts.set(projectDirectory, next);
  return next;
}

function buildPlan(draft: DraftState) {
  if (!draft.persona) {
    throw new Error("尚未確認 Persona Version");
  }
  const questions = draft.questions.map((item) => item.trim()).filter(Boolean);
  if (!draft.sourceText.trim() || questions.length === 0) {
    throw new Error("Source 與至少一題問題為必填");
  }
  const runId = `${draft.projectId}-run-001`;
  const questionSet = {
    id: `${draft.projectId}-questions-001`,
    title: "使用者問題",
    questions,
    responseInstructions: ""
  };
  const plan = makeExecutionPlan({
    sourceId: draft.sourceId,
    sourceText: draft.sourceText.replace(/\r\n/g, "\n"),
    persona: draft.persona,
    questionSet,
    settings: {
      provider: "gemini",
      model: DEFAULT_GEMINI_MODEL,
      endpointClass: "google-generativelanguage",
      sampleCount: 1,
      temperature: null,
      maxOutputTokens: null,
      seed: null
    },
    runId
  });
  return { plan, runId, questionSet, planHashValue: planHash(plan) };
}

export function renderDraftPreflight(projectDirectory: string) {
  const draft = drafts.get(projectDirectory);
  if (!draft) {
    throw new Error("Project draft is not open");
  }
  const { plan, runId } = buildPlan(draft);
  return preflightView(plan, nowIso(), runId);
}

async function completeRun(
  draft: DraftState,
  result: StructuredResult,
  rawResponse: unknown,
  provider: string,
  model: string
) {
  const { plan, runId, questionSet, planHashValue } = buildPlan(draft);
  if (!draft.persona) {
    throw new Error("尚未確認 Persona Version");
  }
  const approvedAt = nowIso();
  const reportId = `${draft.projectId}-report-001`;
  writeCompletedRun({
    projectDirectory: draft.projectDirectory,
    projectId: draft.projectId,
    title: draft.title,
    description: "v0.1 desktop tracer Project",
    locale: "zh-TW",
    createdAt: draft.createdAt,
    completedAt: nowIso(),
    sourceId: draft.sourceId,
    sourceText: draft.sourceText.replace(/\r\n/g, "\n"),
    persona: draft.persona,
    questionSet,
    plan,
    planHash: planHashValue,
    runId,
    reportId,
    sampleId: plan.sampleIds[0],
    result,
    rawResponse,
    provider,
    model,
    approval: {
      schemaVersion: "0.0",
      runId,
      planHash: planHashValue,
      approvedAt,
      acknowledgedDisclaimer: true,
      realPersonReconfirmed: draft.realPersonApplies
    }
  });
  return readSnapshot(draft.projectDirectory);
}

export async function runMocked(projectDirectory: string, acknowledgedDisclaimer: boolean) {
  if (!acknowledgedDisclaimer) {
    throw new Error("Preflight 必須先承認預測聲明");
  }
  const draft = drafts.get(projectDirectory);
  if (!draft?.persona) {
    throw new Error("尚未確認 Persona Version");
  }
  const mocked = mockGeminiResult({
    sourceId: draft.sourceId,
    sourceText: draft.sourceText.replace(/\r\n/g, "\n"),
    questions: draft.questions.map((item) => item.trim()).filter(Boolean)
  });
  return completeRun(draft, mocked.result, mocked.rawResponse, "gemini", DEFAULT_GEMINI_MODEL);
}

export async function runLiveGemini(projectDirectory: string, acknowledgedDisclaimer: boolean) {
  if (!acknowledgedDisclaimer) {
    throw new Error("Preflight 必須先承認預測聲明");
  }
  if (!geminiCredentialAvailable()) {
    throw new Error("主程序未偵測到 Gemini 憑證");
  }
  const draft = drafts.get(projectDirectory);
  if (!draft?.persona) {
    throw new Error("尚未確認 Persona Version");
  }
  const { plan } = buildPlan(draft);
  const live = await liveGeminiGenerate(plan);
  return completeRun(draft, live.result, live.rawResponse, "gemini", plan.model);
}

export function credentialStatus(): { geminiAvailable: boolean; disclaimer: string } {
  return { geminiAvailable: geminiCredentialAvailable(), disclaimer: DISCLAIMER };
}

export function openSnapshot(projectDirectory: string) {
  return readSnapshot(projectDirectory);
}

export function ping(): { ok: true; requestId: string } {
  return { ok: true, requestId: randomUUID() };
}
