import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DISCLAIMER,
  approvePreflight,
  assertCurrentPreflightApproval,
  batchPreflightView,
  computeBatchPlanHash,
  confirmManualPersona,
  isId,
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
  markProviderVerified,
  resolveProviderCredential,
  type CredentialSource
} from "./credentials";
import { stalePreflightMessage, wrapProviderCallError } from "./user-messages";
import { autoSavePersona, listPersonas } from "./persona-library";
import { saveLastProjectMemory } from "./last-project";
import { validateWorkbookAtPath } from "./workbook-file";
import {
  appendJob,
  clearCancel,
  deriveSubmissionStatus,
  getJob,
  getSubmission,
  isCancelRequested,
  listJobs,
  loadQueue,
  pendingArtifacts,
  putSubmission,
  requestCancel,
  saveQueue,
  toSummary,
  updateJob,
  type JobMode,
  type JobSummary,
  type RunJob,
  type StoredSampleResult,
  type SubmissionRecord
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
  personas?: PersonaVersion[];
  importedPersonas?: Array<{ personaId: string; label: string; rawInput: string }>;
  batchId?: string;
  sampleCount?: number;
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

function hasUnpublishedBatch(draft: DraftState): boolean {
  return (
    Boolean(draft.batchId) ||
    Boolean(draft.personas && draft.personas.length > 0) ||
    Boolean(draft.importedPersonas && draft.importedPersonas.length > 0)
  );
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
  const current = drafts.get(projectDirectory);
  if (current && (kind === "empty" || kind === "absent")) {
    saveLastProjectMemory({ projectDirectory });
    return { ...current, openedExisting: false };
  }
  if (kind === "project") {
    if (current && hasUnpublishedBatch(current)) {
      saveLastProjectMemory({ projectDirectory });
      return { ...current, openedExisting: true };
    }
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
    saveLastProjectMemory({ projectDirectory });
    return { ...draft, openedExisting: true };
  }
  const created = createDraft(projectDirectory, title);
  saveLastProjectMemory({ projectDirectory });
  return { ...created, openedExisting: false };
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
    frozenArtifacts: current.frozenArtifacts,
    personas: input.personas ?? current.personas,
    batchId: input.batchId ?? current.batchId,
    sampleCount: input.sampleCount ?? current.sampleCount
  };
  drafts.set(input.projectDirectory, next);
  return next;
}

export function confirmDraftPersona(projectDirectory: string): DraftState {
  const current = drafts.get(projectDirectory);
  if (!current) {
    throw new Error("【專案】目前沒有開啟的草稿。請先到「總覽」選擇專案資料夾。");
  }
  const confirmedAt = nowIso();
  const imported = current.importedPersonas?.length ? current.importedPersonas : null;
  const personas = (imported ?? [
    {
      personaId: current.persona?.personaId ?? slugId("persona", current.personaLabel || "persona"),
      label: current.personaLabel,
      rawInput: current.personaRaw
    }
  ]).map((candidate) =>
    // Confirmation is an App-owned action. Workbook ids remain stable; only
    // the PersonaVersion id is minted here.
    confirmManualPersona({
      id: slugId("persona-version", candidate.personaId),
      personaId: candidate.personaId,
      label: candidate.label,
      rawInput: candidate.rawInput,
      fields: { roleAndContext: candidate.rawInput.trim() },
      confirmedAt,
      confirmedBy: "desktop-user",
      realPersonApplies: imported ? false : current.realPersonApplies,
      warningAcknowledgedAt: !imported && current.realPersonApplies ? confirmedAt : null
    })
  );
  const persona = personas[0];
  const next = {
    ...current,
    persona,
    personas: imported ? personas : undefined,
    importedPersonas: undefined,
    batchId: imported ? current.batchId : undefined,
    sampleCount: imported ? current.sampleCount : 1
  };
  drafts.set(projectDirectory, next);
  // v0.2 increment 4: auto-save the confirmed version into the reusable
  // Persona library (deduplicated by contentHash; toggleable in the library).
  for (const confirmed of personas) {
    try {
      autoSavePersona(confirmed, {
        projectId: current.projectId,
        projectDirectory: current.projectDirectory
      });
    } catch {
      // A broken library file must never block the draft flow; the UI surfaces
      // it through the dedicated library channels instead.
    }
  }
  return next;
}

export function selectDraftPersonas(
  projectDirectory: string,
  personaVersionIds: string[]
): DraftState {
  const current = drafts.get(projectDirectory);
  if (!current) {
    throw new Error("【專案】目前沒有開啟的草稿。請先到「總覽」選擇專案資料夾。");
  }
  const ids = [...new Set(personaVersionIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length < 1 || ids.length > 30) {
    throw new Error("【Persona】批次必須選擇 1–30 個已確認的 Persona Version。");
  }
  const byId = new Map(
    listPersonas().personas.map((entry) => [entry.personaVersion.id, entry.personaVersion])
  );
  const personas = ids.map((id) => {
    const persona = byId.get(id);
    if (!persona || persona.status !== "confirmed") {
      throw new Error(`【Persona】找不到已確認的 Persona Version：${id}`);
    }
    return persona;
  });
  const first = personas[0];
  const next: DraftState = {
    ...current,
    persona: first,
    personas,
    importedPersonas: undefined,
    personaLabel: first.label,
    personaRaw: first.rawInput,
    batchId: personas.length > 1 ? current.batchId || slugId("batch", "library-selection") : undefined,
    frozenArtifacts: null
  };
  drafts.set(projectDirectory, next);
  return next;
}

export async function importWorkbookToDraft(
  projectDirectory: string,
  workbookPath: string
): Promise<{
  ok: true;
  batchId: string;
  sourceTitle: string;
  sourceText: string;
  questions: string[];
  questionCount: number;
  personaCount: number;
  sampleCount: number;
  personaLabel: string;
  personaRaw: string;
  personas: Array<{ personaId: string; label: string }>;
}> {
  const current = drafts.get(projectDirectory);
  if (!current) {
    throw new Error("【專案】目前沒有開啟的草稿。請先到「總覽」選擇專案資料夾。");
  }

  const result = await validateWorkbookAtPath(workbookPath);
  if (!result.ok) {
    const errText = result.errors.map((e) => `[${e.code}] ${e.message}`).join("; ");
    throw new Error(`【Workbook 匯入】校驗失敗：${errText}`);
  }

  const wb = result.workbook;
  const batch = wb.batches.find((b) => b.rows.some((r) => r.enabled)) ?? wb.batches[0];
  if (!batch) {
    throw new Error("【Workbook 匯入】Workbook 未包含任何 Simulation Batch。");
  }

  const source = wb.sources.find((s) => s.sourceId === batch.sourceId && s.enabled) ?? wb.sources[0];
  if (!source) {
    throw new Error("【Workbook 匯入】找不到對應且啟用的 Source。");
  }

  const qs = wb.questionSets.find((q) => q.questionSetId === batch.questionSetId) ?? wb.questionSets[0];
  if (!qs) {
    throw new Error("【Workbook 匯入】找不到對應的 Question Set。");
  }

  const questions = [...qs.items].sort((a, b) => a.order - b.order).map((i) => i.text);
  const enabledRowPersonaIds = batch.rows.filter((r) => r.enabled).map((r) => r.personaId);
  const matchedPersonas = wb.personas.filter((p) => enabledRowPersonaIds.includes(p.personaId) && p.enabled);

  if (matchedPersonas.length === 0) {
    throw new Error("【Workbook 匯入】Batch 未包含任何已啟用的 Persona。");
  }
  if (matchedPersonas.length > 30) {
    throw new Error("【Workbook 匯入】批次 Persona 數量超過上限（最多 30 位）。");
  }

  const firstPersona = matchedPersonas[0];

  const next: DraftState = {
    ...current,
    title: source.title,
    sourceText: source.text,
    sourceId: source.sourceId,
    questions,
    persona: null,
    personaRaw: firstPersona.rawInput,
    personaLabel: firstPersona.label,
    personas: undefined,
    importedPersonas: matchedPersonas.map((p) => ({
      personaId: p.personaId,
      label: p.label,
      rawInput: p.rawInput
    })),
    batchId: batch.batchId,
    sampleCount: batch.sampleCount,
    frozenArtifacts: null
  };

  drafts.set(projectDirectory, next);
  saveLastProjectMemory({ projectDirectory, workbookPath });

  return {
    ok: true,
    batchId: batch.batchId,
    sourceTitle: source.title,
    sourceText: source.text,
    questions,
    questionCount: questions.length,
    personaCount: matchedPersonas.length,
    sampleCount: batch.sampleCount,
    personaLabel: firstPersona.label,
    personaRaw: firstPersona.rawInput,
    personas: matchedPersonas.map((p) => ({ personaId: p.personaId, label: p.label }))
  };
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

function executableSampleCount(value: number | undefined): 1 | 3 {
  const sampleCount = value ?? 1;
  if (sampleCount !== 1 && sampleCount !== 3) {
    throw new Error("【Preflight】目前可執行的樣本數只有 1 或 3；請修改 Workbook 後重新匯入。");
  }
  return sampleCount;
}

function buildPlanForPersona(
  draft: DraftState,
  persona: PersonaVersion,
  explicitRunId?: string,
  explicitReportId?: string
) {
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
    explicitRunId ??
    frozen?.runId ??
    nextNumberedId([...(existing?.runIds ?? []), ...reserved.runIds], `${projectId}-run`);
  const reportId =
    explicitReportId ??
    frozen?.reportId ??
    nextNumberedId([...(existing?.reportIds ?? []), ...reserved.reportIds], `${projectId}-report`);
  const sampleCount = executableSampleCount(draft.sampleCount);
  const plan = makeExecutionPlan({
    sourceId,
    sourceText,
    persona,
    questionSet,
    settings: {
      provider: draft.provider,
      model: draft.model || defaultModelFor(draft.provider),
      endpointClass: PROVIDER_METADATA[draft.provider].endpointClass,
      sampleCount,
      temperature: null,
      maxOutputTokens: null,
      seed: null
    },
    runId
  });
  return { plan, runId, reportId, questionSet, planHashValue: planHash(plan), projectId, sourceId };
}

function buildPlan(draft: DraftState) {
  if (!draft.persona) {
    throw new Error(
      "【Persona】尚未確認 Persona Version。請到「Persona」頁輸入背景後按「確認 Persona Version」。"
    );
  }
  return buildPlanForPersona(draft, draft.persona);
}

export function renderDraftPreflight(projectDirectory: string) {
  const draft = drafts.get(projectDirectory);
  if (!draft) {
    throw new Error("【專案】目前沒有開啟的草稿。請先到「總覽」選擇專案資料夾。");
  }
  const personas = draft.personas && draft.personas.length > 1 ? draft.personas : null;
  if (personas) {
    const existing = inspectProject(projectDirectory);
    const reserved = pendingArtifacts(projectDirectory);
    const existingRunIds = [...(existing?.runIds ?? []), ...reserved.runIds];
    const existingReportIds = [...(existing?.reportIds ?? []), ...reserved.reportIds];
    const projectId = existing?.projectId ?? draft.projectId;

    const plans = personas.map((persona) => {
      const runId = nextNumberedId(existingRunIds, `${projectId}-run`);
      existingRunIds.push(runId);
      const reportId = nextNumberedId(existingReportIds, `${projectId}-report`);
      existingReportIds.push(reportId);
      const built = buildPlanForPersona(draft, persona, runId, reportId);
      return {
        personaId: persona.personaId,
        label: persona.label,
        plan: built.plan,
        runId
      };
    });

    return {
      isBatch: true,
      ...batchPreflightView({
        batchId: draft.batchId || slugId("batch", "simulation"),
        sourceId: resolveSourceId(draft, existing),
        sourceTitle: draft.title,
        questionCount: draft.questions.length,
        sampleCount: executableSampleCount(draft.sampleCount),
        plans,
        provider: draft.provider,
        model: draft.model || defaultModelFor(draft.provider),
        endpointClass: PROVIDER_METADATA[draft.provider].endpointClass,
        createdAt: nowIso()
      })
    };
  }

  const { plan, runId } = buildPlan(draft);
  return {
    isBatch: false,
    ...preflightView(plan, nowIso(), runId)
  };
}

function resolveSubmissionId(submissionId: string | undefined, prefix: string): string {
  if (submissionId !== undefined && submissionId !== "") {
    if (!isId(submissionId)) {
      throw new Error("【送出】送出識別格式無效。請重新送出，不要連點建立第二批。");
    }
    return submissionId;
  }
  return slugId("sub", prefix);
}

function submissionResult(
  record: SubmissionRecord,
  duplicate: boolean,
  snapshot: ProjectSnapshot | null
) {
  const stored = loadQueue().jobs.filter((job) => record.jobIds.includes(job.jobId));
  return {
    ok: record.status === "accepted" && !record.acceptError,
    submissionId: record.submissionId,
    submissionStatus: deriveSubmissionStatus(record, stored),
    duplicate,
    batchId: record.batchId,
    batchPlanHash: record.planHash,
    queuedCount: record.jobIds.length,
    jobs: listJobs(record.projectDirectory),
    snapshot,
    error: record.acceptError
  };
}

function readSnapshotIfPresent(projectDirectory: string): ProjectSnapshot | null {
  try {
    return readSnapshot(projectDirectory);
  } catch {
    return null;
  }
}

async function replaySubmission(record: SubmissionRecord) {
  if (record.acceptError || record.status === "failed") {
    throw new Error(record.acceptError || "【送出】這個送出先前未被接受。請重新預覽後再送出。");
  }
  const snapshot = (await processQueue(record.projectDirectory)) ?? readSnapshotIfPresent(record.projectDirectory);
  const latest = getSubmission(record.submissionId) ?? record;
  return submissionResult(latest, true, snapshot);
}

function persistFailedSubmission(
  input: Omit<SubmissionRecord, "acceptError" | "status" | "jobIds" | "batchId"> & {
    batchId?: string | null;
    jobIds?: string[];
  },
  error: unknown
): never {
  const message = error instanceof Error ? error.message : String(error);
  putSubmission({
    submissionId: input.submissionId,
    projectDirectory: input.projectDirectory,
    batchId: input.batchId ?? null,
    jobIds: input.jobIds ?? [],
    planHash: input.planHash,
    mode: input.mode,
    createdAt: input.createdAt,
    acceptError: message,
    status: "failed"
  });
  throw error instanceof Error ? error : new Error(message);
}

export async function enqueueBatchAndProcess(
  projectDirectory: string,
  batchPlanHash: string,
  acknowledgedDisclaimer: boolean,
  mode: JobMode,
  submissionId?: string
) {
  const resolvedId = resolveSubmissionId(submissionId, "batch");
  const existingSubmission = getSubmission(resolvedId);
  if (existingSubmission) {
    return replaySubmission(existingSubmission);
  }

  const createdAt = nowIso();
  putSubmission({
    submissionId: resolvedId,
    projectDirectory,
    batchId: null,
    jobIds: [],
    planHash: batchPlanHash,
    mode,
    createdAt,
    acceptError: null,
    status: "accepting"
  });

  try {
    const draft = drafts.get(projectDirectory);
    if (!draft) {
      throw new Error("【專案】目前沒有開啟的草稿。");
    }
    if (!acknowledgedDisclaimer) {
      throw new Error("【Preflight】必須確認預測聲明才能排入佇列。");
    }
    const personas = draft.personas && draft.personas.length > 0 ? draft.personas : (draft.persona ? [draft.persona] : []);
    if (personas.length === 0) {
      throw new Error("【Persona】沒有已確認的 Persona。");
    }

    const existing = inspectProject(projectDirectory);
    const reserved = pendingArtifacts(projectDirectory);
    const existingRunIds = [...(existing?.runIds ?? []), ...reserved.runIds];
    const existingReportIds = [...(existing?.reportIds ?? []), ...reserved.reportIds];
    const projectId = existing?.projectId ?? draft.projectId;
    const batchId = draft.batchId || slugId("batch", "simulation");

    const builtPlans = personas.map((persona) => {
      const runId = nextNumberedId(existingRunIds, `${projectId}-run`);
      existingRunIds.push(runId);
      const reportId = nextNumberedId(existingReportIds, `${projectId}-report`);
      existingReportIds.push(reportId);
      const built = buildPlanForPersona(draft, persona, runId, reportId);
      return { persona, built };
    });

    const calculatedBatchHash = computeBatchPlanHash(
      batchId,
      builtPlans.map((b) => ({ personaId: b.persona.personaId, planHash: b.built.planHashValue }))
    );

    if (calculatedBatchHash !== batchPlanHash) {
      throw new Error("【Preflight】批次執行計畫已變更。請重新整理 Preflight 後再送出。");
    }

    const enqueuedJobs: JobSummary[] = [];
    for (const item of builtPlans) {
      const approval = approvePreflight({
        runId: item.built.runId,
        plan: item.built.plan,
        presentedPlanHash: item.built.planHashValue,
        approvedAt: nowIso(),
        acknowledgedDisclaimer: true,
        realPersonReconfirmed: false
      });
      const job = appendJob({
        jobId: slugId("job", `${batchId}-${item.persona.personaId}`),
        projectDirectory,
        projectId,
        runId: item.built.runId,
        reportId: item.built.reportId,
        mode,
        planHash: approval.planHash,
        approval,
        status: "queued",
        createdAt: nowIso(),
        startedAt: null,
        completedAt: null,
        error: null,
        attempt: 1,
        submissionId: resolvedId,
        result: null,
        request: {
          title: draft.title,
          sourceId: item.built.sourceId,
          sourceText: draft.sourceText.replace(/\r\n/g, "\n"),
          personaRaw: item.persona.rawInput,
          personaLabel: item.persona.label,
          realPersonApplies: item.persona.review?.realPerson?.applies ?? false,
          questions: draft.questions.map((q) => q.trim()).filter(Boolean),
          persona: item.persona,
          provider: draft.provider,
          model: draft.model || defaultModelFor(draft.provider),
          createdAt: draft.createdAt,
          questionSet: item.built.questionSet,
          sampleCount: item.built.plan.sampleCount
        }
      });
      enqueuedJobs.push(job);
    }

    const record: SubmissionRecord = {
      submissionId: resolvedId,
      projectDirectory,
      batchId,
      jobIds: enqueuedJobs.map((job) => job.jobId),
      planHash: batchPlanHash,
      mode,
      createdAt,
      acceptError: null,
      status: "accepted"
    };
    putSubmission(record);
    const snapshot = await processQueue(projectDirectory);
    return submissionResult(getSubmission(resolvedId) ?? record, false, snapshot);
  } catch (error) {
    persistFailedSubmission(
      {
        submissionId: resolvedId,
        projectDirectory,
        planHash: batchPlanHash,
        mode,
        createdAt
      },
      error
    );
  }
}

export function getSubmissionStatus(submissionId: string, projectDirectory?: string) {
  if (!isId(submissionId)) {
    throw new Error("【送出】送出識別格式無效。請重新送出，不要連點建立第二批。");
  }
  const record = getSubmission(submissionId);
  if (!record || (projectDirectory && record.projectDirectory !== projectDirectory)) {
    return {
      found: false,
      ok: false,
      submissionId,
      submissionStatus: null,
      duplicate: false,
      batchId: null,
      queuedCount: 0,
      jobs: [] as JobSummary[],
      snapshot: null,
      error: null
    };
  }
  const jobs = listJobs(record.projectDirectory).filter((job) => record.jobIds.includes(job.jobId));
  return {
    found: true,
    ...submissionResult(record, false, readSnapshotIfPresent(record.projectDirectory)),
    jobs
  };
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
  samples: StoredSampleResult[],
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
    samples,
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
  const completedAt = nowIso();
  return completeRun(
    draft,
    approved,
    approved.plan.sampleIds.map((sampleId) => ({
      sampleId,
      result: mocked.result,
      rawResponse: mocked.rawResponse,
      provider: approved.plan.provider,
      model: approved.plan.model,
      completedAt
    })),
    completedAt
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
  if (!apiKey) {
    throw wrapProviderCallError(provider, new Error("not available"));
  }
  const samples: StoredSampleResult[] = [];
  try {
    for (const sampleId of approved.plan.sampleIds) {
      const live =
        provider === "openai"
          ? await liveOpenaiGenerate(approved.plan, { apiKey })
          : await liveGeminiGenerate(approved.plan, { apiKey });
      markProviderVerified(provider, apiKey);
      samples.push({
        sampleId,
        result: live.result,
        rawResponse: live.rawResponse,
        provider: approved.plan.provider,
        model: approved.plan.model,
        completedAt: nowIso()
      });
    }
  } catch (error) {
    throw wrapProviderCallError(provider, error, apiKey);
  }
  return completeRun(draft, approved, samples, samples[samples.length - 1].completedAt);
}

export async function credentialStatus(): Promise<{
  providers: Record<
    ProviderId,
    {
      available: boolean;
      source: CredentialSource;
      fingerprint: string | null;
      verifiedByUse: boolean;
    }
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
        fingerprint: gemini.fingerprint,
        verifiedByUse: gemini.verifiedByUse
      },
      openai: {
        available: openai.available,
        source: openai.source,
        fingerprint: openai.fingerprint,
        verifiedByUse: openai.verifiedByUse
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
    sampleCount: job.request.sampleCount,
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
  mode: JobMode,
  submissionId?: string
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
    submissionId,
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
      questionSet: built.questionSet,
      sampleCount: built.plan.sampleCount
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
    const completedSamples = [...(job.result?.samples ?? [])];
    while (completedSamples.length < built.plan.sampleIds.length) {
      if (isCancelRequested(job.jobId)) {
        throw new Error("Job cancelled");
      }
      const sampleId = built.plan.sampleIds[completedSamples.length];
      let completedSample: StoredSampleResult;
      if (job.mode === "mocked") {
        const mocked = mockGeminiResult({
          sourceId: built.sourceId,
          sourceText: draft.sourceText,
          questions: draft.questions
        });
        completedSample = {
          sampleId,
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
        if (!apiKey) {
          throw wrapProviderCallError(built.plan.provider, new Error("not available"));
        }
        let live;
        try {
          live =
            built.plan.provider === "openai"
              ? await liveOpenaiGenerate(built.plan, { apiKey })
              : await liveGeminiGenerate(built.plan, { apiKey });
          markProviderVerified(built.plan.provider, apiKey);
        } catch (error) {
          throw wrapProviderCallError(built.plan.provider, error, apiKey);
        }
        completedSample = {
          sampleId,
          result: live.result,
          rawResponse: live.rawResponse,
          provider: built.plan.provider,
          model: built.plan.model,
          completedAt: nowIso()
        };
      }
      completedSamples.push(completedSample);
      // Persist every provider response before requesting the next Sample or
      // touching the Project. Retry resumes only the missing Samples.
      updateJob(job.jobId, {
        status: "partial",
        completedAt: null,
        error: null,
        result: { samples: completedSamples }
      });
    }
    const snapshot = await completeRun(
      draft,
      { ...built, approval: job.approval },
      completedSamples,
      completedSamples[completedSamples.length - 1].completedAt
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
      try {
        const snapshot = await executeJob(next);
        if (snapshot) {
          last = snapshot;
        }
      } catch {
        // executeJob already recorded failed/cancelled; remaining Jobs continue.
      }
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
  mode: JobMode,
  submissionId?: string
): Promise<{
  jobs: JobSummary[];
  snapshot: ProjectSnapshot | null;
  ok: boolean;
  submissionId: string;
  submissionStatus: ReturnType<typeof deriveSubmissionStatus>;
  duplicate: boolean;
  batchId: string | null;
  queuedCount: number;
  error: string | null;
}> {
  const resolvedId = resolveSubmissionId(submissionId, "run");
  const existingSubmission = getSubmission(resolvedId);
  if (existingSubmission) {
    return replaySubmission(existingSubmission);
  }

  const createdAt = nowIso();
  putSubmission({
    submissionId: resolvedId,
    projectDirectory,
    batchId: null,
    jobIds: [],
    planHash: presentedPlanHash,
    mode,
    createdAt,
    acceptError: null,
    status: "accepting"
  });

  let enqueued: JobSummary;
  try {
    enqueued = enqueueRun(
      projectDirectory,
      presentedPlanHash,
      acknowledgedDisclaimer,
      mode,
      resolvedId
    );
    putSubmission({
      submissionId: resolvedId,
      projectDirectory,
      batchId: null,
      jobIds: [enqueued.jobId],
      planHash: presentedPlanHash,
      mode,
      createdAt,
      acceptError: null,
      status: "accepted"
    });
  } catch (error) {
    persistFailedSubmission(
      {
        submissionId: resolvedId,
        projectDirectory,
        planHash: presentedPlanHash,
        mode,
        createdAt
      },
      error
    );
  }

  const snapshot = await processQueue(projectDirectory);
  const completed = getJob(enqueued.jobId);
  const record = getSubmission(resolvedId);
  if (completed && (completed.status === "failed" || completed.status === "partial")) {
    throw new Error(completed.error || "Job 執行失敗");
  }
  return submissionResult(
    record ?? {
      submissionId: resolvedId,
      projectDirectory,
      batchId: null,
      jobIds: [enqueued.jobId],
      planHash: presentedPlanHash,
      mode,
      createdAt,
      acceptError: null,
      status: "accepted"
    },
    false,
    snapshot
  );
}

export async function retryAndProcess(
  jobId: string
): Promise<{ jobs: JobSummary[]; snapshot: ProjectSnapshot | null }> {
  const job = retryJob(jobId);
  const snapshot = await processQueue(job.projectDirectory);
  const completed = getJob(job.jobId);
  if (completed && (completed.status === "failed" || completed.status === "partial")) {
    throw new Error(completed.error || "Job 執行失敗");
  }
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
