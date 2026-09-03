import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DISCLAIMER,
  approvePreflight,
  assertCurrentPreflightApproval,
  confirmManualPersona,
  makeExecutionPlan,
  planHash,
  preflightView,
  PROVIDER_METADATA,
  sha256Bytes,
  slugId,
  type PersonaVersion,
  type PreflightApproval,
  type ProviderId,
  type QuestionSet,
  type StructuredResult
} from "@opinion-simulator/core";
import {
  classifyWriteTarget,
  findMatchingQuestionSet,
  inspectProject,
  nextNumberedId,
  readSnapshot,
  writeCompletedRun,
  type ProjectSnapshot
} from "@opinion-simulator/project-store";
import { liveGeminiGenerate, mockGeminiResult } from "@opinion-simulator/providers-gemini";
import { liveOpenaiGenerate } from "@opinion-simulator/providers-openai";
import {
  isProviderId,
  loadProviderApiKey,
  resolveProviderCredential,
  type CredentialSource
} from "./credentials";
import { stalePreflightMessage, wrapProviderCallError } from "./user-messages";
import { autoSavePersona } from "./persona-library";
import {
  appendJob,
  clearCancel,
  getJob,
  isCancelRequested,
  listJobs,
  loadQueue,
  pendingArtifacts,
  requestCancel,
  saveQueue,
  toSummary,
  updateJob,
  type JobMode,
  type JobSummary,
  type RunJob
} from "./run-queue";

export type FrozenArtifacts = {
  projectId: string;
  runId: string;
  reportId: string;
  sourceId: string;
  questionSet: QuestionSet;
};

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
  provider: ProviderId;
  model: string;
  createdAt: string;
  frozenArtifacts?: FrozenArtifacts | null;
};

export function defaultModelFor(provider: ProviderId): string {
  return PROVIDER_METADATA[provider].defaultModel;
}

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
    provider: "gemini",
    model: defaultModelFor("gemini"),
    createdAt,
    frozenArtifacts: null
  };
  drafts.set(projectDirectory, draft);
  return draft;
}

export function openOrCreateDraft(
  projectDirectory: string,
  title: string
): DraftState & { openedExisting: boolean } {
  const kind = classifyWriteTarget(projectDirectory);
  if (kind === "occupied") {
    throw new Error(
      `拒絕寫入：${projectDirectory} 不是空資料夾，也不是有效的專案。現有內容不會被刪除。`
    );
  }
  if (kind === "project") {
    const existing = inspectProject(projectDirectory);
    const snapshot = readSnapshot(projectDirectory);
    if (!existing) {
      throw new Error(
        `拒絕寫入：${projectDirectory} 不是空資料夾，也不是有效的專案。現有內容不會被刪除。`
      );
    }
    const provider: ProviderId = snapshot.provider === "openai" ? "openai" : "gemini";
    const draft: DraftState = {
      projectDirectory,
      projectId: existing.projectId,
      title: snapshot.title || title,
      sourceText: snapshot.sourceText,
      sourceId: snapshot.sourceId,
      personaRaw: snapshot.persona?.rawInput ?? "",
      personaLabel: snapshot.persona?.label ?? "",
      realPersonApplies: snapshot.persona?.review.realPerson.applies ?? false,
      questions: snapshot.questions,
      persona: snapshot.persona,
      provider,
      model: snapshot.model || defaultModelFor(provider),
      createdAt: existing.createdAt,
      frozenArtifacts: null
    };
    drafts.set(projectDirectory, draft);
    return { ...draft, openedExisting: true };
  }
  return { ...createDraft(projectDirectory, title), openedExisting: false };
}

export function saveDraft(input: Partial<DraftState> & { projectDirectory: string }): DraftState {
  const current = drafts.get(input.projectDirectory);
  if (!current) {
    throw new Error("【專案】目前沒有開啟的草稿。請先到「總覽」選擇專案資料夾。");
  }
  if (input.provider !== undefined && !isProviderId(input.provider)) {
    throw new Error("不支援的供應商");
  }
  if (input.model !== undefined && (!String(input.model).trim() || /[\r\n]/.test(String(input.model)))) {
    throw new Error("Model 名稱不可為空白或含換行");
  }
  const next = {
    ...current,
    ...input,
    persona: current.persona,
    frozenArtifacts: current.frozenArtifacts
  };
  drafts.set(input.projectDirectory, next);
  return next;
}

export function confirmDraftPersona(projectDirectory: string): DraftState {
  const current = drafts.get(projectDirectory);
  if (!current) {
    throw new Error("【專案】目前沒有開啟的草稿。請先到「總覽」選擇專案資料夾。");
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
  // v0.2 increment 4: auto-save the confirmed version into the reusable
  // Persona library (deduplicated by contentHash; toggleable in the library).
  try {
    autoSavePersona(persona, { projectId: current.projectId, projectDirectory: current.projectDirectory });
  } catch {
    // A broken library file must never block the draft flow; the UI surfaces
    // it through the dedicated library channels instead.
  }
  return next;
}

function resolveSourceId(
  draft: DraftState,
  existing: ReturnType<typeof inspectProject>
): string {
  const sourceText = draft.sourceText.replace(/\r\n/g, "\n");
  const hash = sha256Bytes(sourceText);
  if (existing) {
    const match = existing.sources.find((item) => item.textSha256 === hash || item.text === sourceText);
    if (match) {
      return match.sourceId;
    }
  }
  const pending = loadQueue().jobs.filter(
    (job) =>
      job.projectDirectory === draft.projectDirectory &&
      (job.status === "queued" || job.status === "running" || job.status === "partial")
  );
  const pendingMatch = pending.find((job) => job.request.sourceText === sourceText);
  if (pendingMatch) {
    return pendingMatch.request.sourceId;
  }
  const reservedIds = pending.map((job) => job.request.sourceId);
  if (!existing && !reservedIds.includes(draft.sourceId)) {
    return draft.sourceId;
  }
  return slugId("source", "pasted");
}

function runArtifactExists(projectDirectory: string, runId: string): boolean {
  const inspected = inspectProject(projectDirectory);
  return Boolean(inspected?.runIds.includes(runId));
}

function buildPlan(draft: DraftState) {
  if (!draft.persona) {
    throw new Error(
      "【Persona】尚未確認 Persona Version。請到「Persona」頁輸入背景後按「確認 Persona Version」。"
    );
  }
  const questions = draft.questions.map((item) => item.trim()).filter(Boolean);
  if (!draft.sourceText.trim() || questions.length === 0) {
    throw new Error(
      "【材料／問題】Source 與至少一題問題為必填。請到「材料」與「問題」頁補齊，再到「Preflight」產生預覽。"
    );
  }
  const existing = inspectProject(draft.projectDirectory);
  const reserved = pendingArtifacts(draft.projectDirectory);
  const frozen = draft.frozenArtifacts;
  const projectId = frozen?.projectId ?? existing?.projectId ?? draft.projectId;
  const sourceId = frozen?.sourceId ?? resolveSourceId(draft, existing);
  const sourceText = draft.sourceText.replace(/\r\n/g, "\n");
  const questionCandidate = {
    title: "使用者問題",
    questions,
    responseInstructions: ""
  };
  const knownQuestionSets = [...(existing?.questionSets ?? []), ...reserved.questionSets];
  const matched = frozen?.questionSet ?? findMatchingQuestionSet(knownQuestionSets, questionCandidate);
  const questionSet = matched ?? {
    id: nextNumberedId(
      knownQuestionSets.map((item) => item.id),
      `${projectId}-questions`
    ),
    ...questionCandidate
  };
  const runId =
    frozen?.runId ??
    nextNumberedId([...(existing?.runIds ?? []), ...reserved.runIds], `${projectId}-run`);
  const reportId =
    frozen?.reportId ??
    nextNumberedId([...(existing?.reportIds ?? []), ...reserved.reportIds], `${projectId}-report`);
  const plan = makeExecutionPlan({
    sourceId,
    sourceText,
    persona: draft.persona,
    questionSet,
    settings: {
      provider: draft.provider,
      model: draft.model || defaultModelFor(draft.provider),
      endpointClass: PROVIDER_METADATA[draft.provider].endpointClass,
      sampleCount: 1,
      temperature: null,
      maxOutputTokens: null,
      seed: null
    },
    runId
  });
  return { plan, runId, reportId, questionSet, planHashValue: planHash(plan), projectId, sourceId };
}

export function renderDraftPreflight(projectDirectory: string) {
  const draft = drafts.get(projectDirectory);
  if (!draft) {
    throw new Error("【專案】目前沒有開啟的草稿。請先到「總覽」選擇專案資料夾。");
  }
  const { plan, runId } = buildPlan(draft);
  return preflightView(plan, nowIso(), runId);
}

let activeJobId: string | null = null;
let processingQueue = false;

type BuiltPlan = ReturnType<typeof buildPlan>;
type ApprovedPlan = BuiltPlan & { approval: PreflightApproval };

function approveBuiltPlan(
  draft: DraftState,
  built: BuiltPlan,
  presentedPlanHash: string,
  acknowledgedDisclaimer: boolean
): ApprovedPlan {
  try {
    return {
      ...built,
      approval: approvePreflight({
        plan: built.plan,
        runId: built.runId,
        presentedPlanHash,
        acknowledgedDisclaimer,
        realPersonReconfirmed: draft.realPersonApplies,
        approvedAt: nowIso()
      })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Preflight 已過期")) {
      throw new Error(describeStalePreflight(draft, presentedPlanHash));
    }
    if (message.includes("必須先承認預測聲明")) {
      throw new Error(
        "【Preflight】尚未承認預測聲明。請到「Preflight」頁勾選「我承認這是 AI 模擬，不是真實引言」。"
      );
    }
    throw error;
  }
}

function publishedPlanIdentity(projectDirectory: string): { runId: string; planHash: string } | null {
  const inspected = inspectProject(projectDirectory);
  const runId = inspected?.runIds[inspected.runIds.length - 1];
  if (!runId) {
    return null;
  }
  try {
    const run = JSON.parse(readFileSync(join(projectDirectory, "runs", `${runId}.json`), "utf8")) as {
      executionPlan?: { planHash?: unknown };
      integrity?: { planHash?: unknown };
    };
    const planHash =
      (typeof run.executionPlan?.planHash === "string" && run.executionPlan.planHash) ||
      (typeof run.integrity?.planHash === "string" && run.integrity.planHash) ||
      null;
    return planHash ? { runId, planHash } : null;
  } catch {
    return null;
  }
}

function describeStalePreflight(draft: DraftState, presentedPlanHash: string): string {
  const queued = listJobs(draft.projectDirectory).find((job) => job.planHash === presentedPlanHash);
  if (queued && (queued.status === "completed" || queued.status === "partial")) {
    return stalePreflightMessage("consumed", queued.runId);
  }
  const published = publishedPlanIdentity(draft.projectDirectory);
  if (published && published.planHash === presentedPlanHash) {
    return stalePreflightMessage("consumed", published.runId);
  }
  return stalePreflightMessage("changed");
}

async function completeRun(
  draft: DraftState,
  approved: ApprovedPlan,
  result: StructuredResult,
  rawResponse: unknown,
  provider: ProviderId,
  model: string,
  completedAt = nowIso()
) {
  if (activeJobId && isCancelRequested(activeJobId)) {
    throw new Error("Job cancelled");
  }
  if (!draft.persona) {
    throw new Error(
      "【Persona】尚未確認 Persona Version。請到「Persona」頁輸入背景後按「確認 Persona Version」。"
    );
  }
  assertCurrentPreflightApproval(approved.plan, approved.runId, approved.approval);
  writeCompletedRun({
    projectDirectory: draft.projectDirectory,
    projectId: approved.projectId,
    title: draft.title,
    description: "v0.2 desktop tracer Project",
    locale: "zh-TW",
    createdAt: draft.createdAt,
    completedAt,
    sourceId: approved.sourceId,
    sourceText: draft.sourceText.replace(/\r\n/g, "\n"),
    persona: draft.persona,
    questionSet: approved.questionSet,
    plan: approved.plan,
    planHash: approved.planHashValue,
    runId: approved.runId,
    reportId: approved.reportId,
    sampleId: approved.plan.sampleIds[0],
    result,
    rawResponse,
    provider,
    model,
    approval: approved.approval
  });
  return readSnapshot(draft.projectDirectory);
}

export async function runMocked(
  projectDirectory: string,
  presentedPlanHash: string,
  acknowledgedDisclaimer: boolean
) {
  const draft = drafts.get(projectDirectory);
  if (!draft?.persona) {
    throw new Error(
      "【Persona】尚未確認 Persona Version。請到「Persona」頁輸入背景後按「確認 Persona Version」。"
    );
  }
  const approved = approveBuiltPlan(
    draft,
    buildPlan(draft),
    presentedPlanHash,
    acknowledgedDisclaimer
  );
  const mocked = mockGeminiResult({
    sourceId: approved.sourceId,
    sourceText: draft.sourceText.replace(/\r\n/g, "\n"),
    questions: draft.questions.map((item) => item.trim()).filter(Boolean)
  });
  return completeRun(
    draft,
    approved,
    mocked.result,
    mocked.rawResponse,
    approved.plan.provider,
    approved.plan.model
  );
}

export async function runLive(
  projectDirectory: string,
  presentedPlanHash: string,
  acknowledgedDisclaimer: boolean,
  provider: ProviderId
) {
  const draft = drafts.get(projectDirectory);
  if (!draft?.persona) {
    throw new Error(
      "【Persona】尚未確認 Persona Version。請到「Persona」頁輸入背景後按「確認 Persona Version」。"
    );
  }
  const approved = approveBuiltPlan(
    draft,
    buildPlan(draft),
    presentedPlanHash,
    acknowledgedDisclaimer
  );
  if (approved.plan.provider !== provider) {
    throw new Error(
      "【執行】Preflight 的供應商與按下的 Live 按鈕不相符。請到「Preflight」重新產生預覽後，再按對應供應商的 Live Run。"
    );
  }
  const credential = await resolveProviderCredential(provider);
  if (!credential.available) {
    throw wrapProviderCallError(provider, new Error("not available"));
  }
  const apiKey = await loadProviderApiKey(provider);
  let live;
  try {
    live =
      provider === "openai"
        ? await liveOpenaiGenerate(approved.plan, { apiKey })
        : await liveGeminiGenerate(approved.plan, { apiKey });
  } catch (error) {
    throw wrapProviderCallError(provider, error, apiKey);
  }
  return completeRun(
    draft,
    approved,
    live.result,
    live.rawResponse,
    approved.plan.provider,
    approved.plan.model
  );
}

export async function credentialStatus(): Promise<{
  providers: Record<
    ProviderId,
    { available: boolean; source: CredentialSource; fingerprint: string | null }
  >;
  disclaimer: string;
}> {
  const [gemini, openai] = await Promise.all([
    resolveProviderCredential("gemini"),
    resolveProviderCredential("openai")
  ]);
  return {
    providers: {
      gemini: {
        available: gemini.available,
        source: gemini.source,
        fingerprint: gemini.fingerprint
      },
      openai: {
        available: openai.available,
        source: openai.source,
        fingerprint: openai.fingerprint
      }
    },
    disclaimer: DISCLAIMER
  };
}

export function openSnapshot(projectDirectory: string) {
  return readSnapshot(projectDirectory);
}

function draftFromJob(job: RunJob): DraftState {
  return {
    projectDirectory: job.projectDirectory,
    projectId: job.projectId,
    title: job.request.title,
    sourceText: job.request.sourceText,
    sourceId: job.request.sourceId,
    personaRaw: job.request.personaRaw,
    personaLabel: job.request.personaLabel,
    realPersonApplies: job.request.realPersonApplies,
    questions: job.request.questions,
    persona: job.request.persona,
    provider: job.request.provider,
    model: job.request.model,
    createdAt: job.request.createdAt,
    frozenArtifacts: {
      projectId: job.projectId,
      runId: job.runId,
      reportId: job.reportId,
      sourceId: job.request.sourceId,
      questionSet: job.request.questionSet
    }
  };
}

export function enqueueRun(
  projectDirectory: string,
  presentedPlanHash: string,
  acknowledgedDisclaimer: boolean,
  mode: JobMode
): JobSummary {
  if (mode !== "mocked" && mode !== "live") {
    throw new Error("不支援的執行模式");
  }
  const draft = drafts.get(projectDirectory);
  if (!draft?.persona) {
    throw new Error(
      "【Persona】尚未確認 Persona Version。請到「Persona」頁輸入背景後按「確認 Persona Version」。"
    );
  }
  const built = approveBuiltPlan(
    draft,
    buildPlan(draft),
    presentedPlanHash,
    acknowledgedDisclaimer
  );
  const job: RunJob = {
    jobId: slugId("job", "run"),
    projectDirectory,
    projectId: built.projectId,
    runId: built.runId,
    reportId: built.reportId,
    mode,
    planHash: built.planHashValue,
    approval: built.approval,
    status: "queued",
    createdAt: nowIso(),
    startedAt: null,
    completedAt: null,
    error: null,
    attempt: 1,
    result: null,
    request: {
      title: draft.title,
      sourceText: draft.sourceText.replace(/\r\n/g, "\n"),
      sourceId: built.sourceId,
      personaRaw: draft.personaRaw,
      personaLabel: draft.personaLabel,
      realPersonApplies: draft.realPersonApplies,
      questions: draft.questions.map((item) => item.trim()).filter(Boolean),
      persona: draft.persona,
      provider: draft.provider,
      model: draft.model || defaultModelFor(draft.provider),
      createdAt: draft.createdAt,
      questionSet: built.questionSet
    }
  };
  return appendJob(job);
}

export function listQueuedJobs(projectDirectory?: string): JobSummary[] {
  return listJobs(projectDirectory);
}

export function cancelJob(jobId: string): JobSummary {
  const job = getJob(jobId);
  if (!job) {
    throw new Error("找不到這個 Job");
  }
  if (job.status === "completed") {
    throw new Error("已完成的 Job 不能取消");
  }
  requestCancel(jobId);
  if (job.status === "queued" || job.status === "failed" || job.status === "partial") {
    const next = updateJob(jobId, {
      status: "cancelled",
      completedAt: nowIso(),
      error: null
    });
    return toSummary(next);
  }
  return toSummary(job);
}

export function retryJob(jobId: string): JobSummary {
  const job = getJob(jobId);
  if (!job) {
    throw new Error("找不到這個 Job");
  }
  if (job.status !== "failed" && job.status !== "cancelled" && job.status !== "partial") {
    throw new Error("只有失敗、部分完成或已取消的 Job 可以重試");
  }
  if (runArtifactExists(job.projectDirectory, job.runId)) {
    throw new Error("此 Job 的 Run 已寫入專案，不會重跑");
  }
  clearCancel(jobId);
  const next = updateJob(jobId, {
    status: "queued",
    startedAt: null,
    completedAt: null,
    error: null,
    attempt: job.result ? job.attempt : job.attempt + 1
  });
  return toSummary(next);
}

export function resumeMissingJobs(): JobSummary[] {
  const queue = loadQueue();
  let changed = false;
  for (const job of queue.jobs) {
    if (job.status === "completed" || job.status === "cancelled" || job.status === "failed") {
      continue;
    }
    if (runArtifactExists(job.projectDirectory, job.runId)) {
      job.status = "completed";
      job.completedAt = job.completedAt ?? nowIso();
      job.error = null;
      job.result = null;
      changed = true;
      continue;
    }
    if (job.status === "running" || job.status === "partial") {
      job.status = "queued";
      job.error = null;
      changed = true;
    }
  }
  if (changed) {
    saveQueue(queue);
  }
  return listJobs().filter((job) => job.status === "queued");
}

async function executeJob(job: RunJob): Promise<ProjectSnapshot | null> {
  if (runArtifactExists(job.projectDirectory, job.runId)) {
    updateJob(job.jobId, { status: "completed", completedAt: nowIso(), error: null, result: null });
    return readSnapshot(job.projectDirectory);
  }
  if (isCancelRequested(job.jobId) || job.status === "cancelled") {
    updateJob(job.jobId, { status: "cancelled", completedAt: nowIso() });
    return null;
  }
  updateJob(job.jobId, { status: "running", startedAt: nowIso(), error: null });
  const previous = drafts.get(job.projectDirectory);
  activeJobId = job.jobId;
  try {
    const draft = draftFromJob(job);
    drafts.set(job.projectDirectory, draft);
    const built = buildPlan(draft);
    if (built.planHashValue !== job.planHash) {
      throw new Error("已排入佇列的計畫與原核准內容不相符；拒絕執行。");
    }
    assertCurrentPreflightApproval(built.plan, built.runId, job.approval);
    let completedResult = job.result;
    if (!completedResult) {
      if (job.mode === "mocked") {
        const mocked = mockGeminiResult({
          sourceId: built.sourceId,
          sourceText: draft.sourceText,
          questions: draft.questions
        });
        completedResult = {
          result: mocked.result,
          rawResponse: mocked.rawResponse,
          provider: built.plan.provider,
          model: built.plan.model,
          completedAt: nowIso()
        };
      } else {
        const credential = await resolveProviderCredential(built.plan.provider);
        if (!credential.available) {
          throw wrapProviderCallError(built.plan.provider, new Error("not available"));
        }
        const apiKey = await loadProviderApiKey(built.plan.provider);
        let live;
        try {
          live =
            built.plan.provider === "openai"
              ? await liveOpenaiGenerate(built.plan, { apiKey })
              : await liveGeminiGenerate(built.plan, { apiKey });
        } catch (error) {
          throw wrapProviderCallError(built.plan.provider, error, apiKey);
        }
        completedResult = {
          result: live.result,
          rawResponse: live.rawResponse,
          provider: built.plan.provider,
          model: built.plan.model,
          completedAt: nowIso()
        };
      }
      // Persist the provider response before touching the Project. If Project
      // publication later fails, retry resumes from this envelope and never
      // makes a second paid live-provider call.
      updateJob(job.jobId, {
        status: "partial",
        completedAt: null,
        error: null,
        result: completedResult
      });
    }
    const snapshot = await completeRun(
      draft,
      { ...built, approval: job.approval },
      completedResult.result,
      completedResult.rawResponse,
      completedResult.provider,
      completedResult.model,
      completedResult.completedAt
    );
    if (isCancelRequested(job.jobId)) {
      updateJob(job.jobId, { status: "cancelled", completedAt: nowIso() });
      return snapshot;
    }
    updateJob(job.jobId, { status: "completed", completedAt: nowIso(), error: null, result: null });
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isCancelRequested(job.jobId) || /cancelled/i.test(message)) {
      updateJob(job.jobId, { status: "cancelled", completedAt: nowIso(), error: message });
      return null;
    }
    const savedResult = getJob(job.jobId)?.result;
    if (savedResult) {
      updateJob(job.jobId, { status: "partial", completedAt: null, error: message });
      return null;
    }
    updateJob(job.jobId, { status: "failed", completedAt: nowIso(), error: message });
    throw error;
  } finally {
    activeJobId = null;
    clearCancel(job.jobId);
    if (previous) {
      drafts.set(job.projectDirectory, previous);
    } else {
      drafts.delete(job.projectDirectory);
    }
  }
}

export async function processQueue(projectDirectory?: string): Promise<ProjectSnapshot | null> {
  if (processingQueue) {
    return null;
  }
  processingQueue = true;
  let last: ProjectSnapshot | null = null;
  try {
    while (true) {
      const next = loadQueue().jobs.find(
        (job) => job.status === "queued" && (!projectDirectory || job.projectDirectory === projectDirectory)
      );
      if (!next) {
        break;
      }
      last = await executeJob(next);
    }
  } finally {
    processingQueue = false;
  }
  return last;
}

export async function enqueueAndProcess(
  projectDirectory: string,
  presentedPlanHash: string,
  acknowledgedDisclaimer: boolean,
  mode: JobMode
): Promise<{ jobs: JobSummary[]; snapshot: ProjectSnapshot | null }> {
  enqueueRun(projectDirectory, presentedPlanHash, acknowledgedDisclaimer, mode);
  const snapshot = await processQueue(projectDirectory);
  return { jobs: listJobs(projectDirectory), snapshot };
}

export async function retryAndProcess(
  jobId: string
): Promise<{ jobs: JobSummary[]; snapshot: ProjectSnapshot | null }> {
  const job = retryJob(jobId);
  const snapshot = await processQueue(job.projectDirectory);
  return { jobs: listJobs(job.projectDirectory), snapshot };
}

export async function resumeAndProcess(
  projectDirectory?: string
): Promise<{ jobs: JobSummary[]; snapshot: ProjectSnapshot | null }> {
  resumeMissingJobs();
  const snapshot = await processQueue(projectDirectory);
  return { jobs: projectDirectory ? listJobs(projectDirectory) : listJobs(), snapshot };
}

export function ping(): { ok: true; requestId: string } {
  return { ok: true, requestId: randomUUID() };
}
