import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  cancelJob,
  confirmDraftPersona,
  createDraft,
  enqueueAndProcess,
  enqueueBatchAndProcess,
  enqueueRun,
  isDisclaimerAcknowledged,
  setDraftDisclaimer,
  importWorkbookToDraft,
  listQueuedJobs,
  openOrCreateDraft,
  processQueue,
  renderDraftPreflight,
  resumeMissingJobs,
  retryJob,
  runMocked,
  saveDraft,
  selectDraftPersonas,
  applyQuestionSetFromLibrary
} from "./session";
import { confirmManualPersona } from "@opinion-simulator/core";
import { addPersona, configureLibraryDirectory, listPersonas } from "./persona-library";
import { configureLastProjectDirectory } from "./last-project";
import { configureQueueDirectory, loadQueue, saveQueue } from "./run-queue";
import {
  configureQuestionLibraryDirectory,
  saveQuestionLibraryEntry
} from "./question-library";
import { readSnapshot } from "@opinion-simulator/project-store";

const GOLDEN_WORKBOOK = join(
  __dirname,
  "../../../../packages/core/fixtures/workbook/Opinion-Simulator-v0.3-Workbook-簡易模板.xlsx"
);

function configureSessionStores(): void {
  configureLibraryDirectory(mkdtempSync(join(tmpdir(), "opinion-persona-lib-session-")));
  configureQuestionLibraryDirectory(mkdtempSync(join(tmpdir(), "opinion-question-lib-session-")));
  configureQueueDirectory(mkdtempSync(join(tmpdir(), "opinion-run-queue-session-")));
  configureLastProjectDirectory(mkdtempSync(join(tmpdir(), "opinion-last-project-session-")));
}

function prepareDraft(
  projectDirectory: string,
  options: { acknowledgeDisclaimer?: boolean } = {}
): void {
  createDraft(projectDirectory, "桌面模擬");
  saveDraft({
    projectDirectory,
    sourceText: "第一階段先在三個行政區試辦，並公開每月支出。",
    personaRaw: "我是政策分析師，在意預算透明。",
    personaLabel: "政策分析師",
    questions: ["你會支持這項計畫嗎？", "推動時最大的阻力是什麼？"]
  });
  confirmDraftPersona(projectDirectory);
  if (options.acknowledgeDisclaimer !== false) {
    setDraftDisclaimer(projectDirectory, true);
  }
}

function currentPlanHash(projectDirectory: string): string {
  return (renderDraftPreflight(projectDirectory) as { planHash: string }).planHash;
}

describe("mocked desktop run", () => {
  beforeEach(() => {
    configureSessionStores();
  });

  it("writes an open Project without embedding credential-shaped fields", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-"));
    prepareDraft(projectDirectory);
    const snapshot = await runMocked(projectDirectory, currentPlanHash(projectDirectory), true);
    expect(snapshot.result?.directReaction).toBeTruthy();
    expect(snapshot.questions).toEqual(["你會支持這項計畫嗎？", "推動時最大的阻力是什麼？"]);
    expect(snapshot.persona?.fields.roleAndContext).toBe("我是政策分析師，在意預算透明。");
    expect(JSON.stringify(snapshot)).not.toMatch(/apiKey|GEMINI_API_KEY/i);
    const python = execFileSync(
      "python3",
      ["-B", ".agents/skills/opinion-simulator/scripts/opinion_simulator.py", "validate-project", projectDirectory],
      { encoding: "utf8", cwd: join(__dirname, "..", "..", "..", "..") }
    );
    expect(JSON.parse(python).status).toBe("valid");
  });

  it("derives roleAndContext directly from the single background input", () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-persona-"));
    createDraft(projectDirectory, "Persona 測試");
    saveDraft({
      projectDirectory,
      sourceText: "",
      personaRaw: "台北市中學校長，熟悉校務運作。",
      personaLabel: "校長",
      questions: []
    });
    const draft = confirmDraftPersona(projectDirectory);
    expect(draft.persona?.rawInput).toBe("台北市中學校長，熟悉校務運作。");
    expect(draft.persona?.fields.roleAndContext).toBe("台北市中學校長，熟悉校務運作。");
    expect(draft.persona?.inferences ?? []).toHaveLength(0);
  });

  it("appends a second mocked Run into the same Project directory", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-append-"));
    prepareDraft(projectDirectory);
    const first = await runMocked(projectDirectory, currentPlanHash(projectDirectory), true);
    expect(first.runIds).toEqual([`${first.projectId}-run-001`]);
    const firstRunBytes = readFileSync(join(projectDirectory, "runs", `${first.projectId}-run-001.json`));
    saveDraft({
      projectDirectory,
      questions: ["你會支持這項計畫嗎？", "推動時最大的阻力是什麼？", "還缺什麼資訊？"]
    });
    const second = await runMocked(projectDirectory, currentPlanHash(projectDirectory), true);
    expect(second.runIds).toEqual([`${first.projectId}-run-001`, `${first.projectId}-run-002`]);
    expect(second.runId).toBe(`${first.projectId}-run-002`);
    expect(second.questions).toEqual([
      "你會支持這項計畫嗎？",
      "推動時最大的阻力是什麼？",
      "還缺什麼資訊？"
    ]);
    expect(readFileSync(join(projectDirectory, "runs", `${first.projectId}-run-001.json`))).toEqual(
      firstRunBytes
    );
    const python = execFileSync(
      "python3",
      ["-B", ".agents/skills/opinion-simulator/scripts/opinion_simulator.py", "validate-project", projectDirectory],
      { encoding: "utf8", cwd: join(__dirname, "..", "..", "..", "..") }
    );
    const evidence = JSON.parse(python) as { status: string; runsChecked: number };
    expect(evidence.status).toBe("valid");
    expect(evidence.runsChecked).toBe(2);
  });

  it("opens an existing Project so a later Run appends instead of replacing it", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-reopen-"));
    prepareDraft(projectDirectory);
    const first = await runMocked(projectDirectory, currentPlanHash(projectDirectory), true);
    const reopened = openOrCreateDraft(projectDirectory, "ignored title");
    expect(reopened.openedExisting).toBe(true);
    expect(reopened.projectId).toBe(first.projectId);
    expect(reopened.sourceText).toBe(first.sourceText);
    expect(reopened.persona?.id).toBe(first.persona?.id);
    const second = await runMocked(projectDirectory, currentPlanHash(projectDirectory), true);
    expect(second.runIds).toHaveLength(2);
    const python = execFileSync(
      "python3",
      ["-B", ".agents/skills/opinion-simulator/scripts/opinion_simulator.py", "validate-project", projectDirectory],
      { encoding: "utf8", cwd: join(__dirname, "..", "..", "..", "..") }
    );
    expect(JSON.parse(python).status).toBe("valid");
  });

  it("rejects a mocked run before the Persona Version is confirmed", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-unconfirmed-"));
    createDraft(projectDirectory, "未確認測試");
    saveDraft({
      projectDirectory,
      sourceText: "材料",
      personaRaw: "角色背景",
      personaLabel: "角色",
      questions: ["問題？"]
    });
    await expect(runMocked(projectDirectory, "", true)).rejects.toThrow("尚未確認 Persona Version");
  });

  it("refuses to silently coerce an unsupported Workbook sample count", () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-sample-count-"));
    prepareDraft(projectDirectory);
    saveDraft({ projectDirectory, sampleCount: 2 });
    expect(() => renderDraftPreflight(projectDirectory)).toThrow(/樣本數.*1.*3/);
  });

  it("rejects an approval hash after the Source changes", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-stale-preflight-"));
    prepareDraft(projectDirectory);
    const presentedPlanHash = currentPlanHash(projectDirectory);
    saveDraft({ projectDirectory, sourceText: "變更後的材料。" });
    await expect(runMocked(projectDirectory, presentedPlanHash, true)).rejects.toThrow(
      /【Preflight】.*已過期/
    );
  });
});

describe("provider and model selection", () => {
  beforeEach(() => {
    configureSessionStores();
  });

  function prepareOpenAiDraft(projectDirectory: string): void {
    createDraft(projectDirectory, "OpenAI 模擬");
    saveDraft({
      projectDirectory,
      sourceText: "第一階段先在三個行政區試辦，並公開每月支出。",
      personaRaw: "我是政策分析師，在意預算透明。",
      personaLabel: "政策分析師",
      questions: ["你會支持這項計畫嗎？"],
      provider: "openai",
      model: "gpt-4o-mini"
    });
    confirmDraftPersona(projectDirectory);
  }

  it("renders the selected provider and model as the Preflight destination", () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-openai-"));
    prepareOpenAiDraft(projectDirectory);
    const view = renderDraftPreflight(projectDirectory) as unknown as {
      destination: { provider: string; model: string; endpointClass: string };
    };
    expect(view.destination).toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
      endpointClass: "openai-chat-completions"
    });
  });

  it("rejects unknown providers and blank model names through the draft seam", () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-bad-provider-"));
    createDraft(projectDirectory, "壞供應商測試");
    expect(() =>
      saveDraft({
        projectDirectory,
        sourceText: "材料",
        personaRaw: "背景",
        personaLabel: "角色",
        questions: ["問題？"],
        // @ts-expect-error intentionally invalid provider over the public seam
        provider: "claude"
      })
    ).toThrow("不支援的供應商");
    expect(() =>
      saveDraft({ projectDirectory, model: "   " })
    ).toThrow();
  });
});

describe("persona library integration", () => {
  beforeEach(() => {
    configureSessionStores();
  });

  it("auto-saves a confirmed Persona Version into the library", () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-lib-"));
    prepareDraft(projectDirectory);
    const listed = listPersonas();
    expect(listed.personas).toHaveLength(1);
    expect(listed.personas[0]?.personaVersion.label).toBe("政策分析師");
    expect(listed.personas[0]?.origin?.projectDirectory).toBe(projectDirectory);
  });

  it("imports a confirmed Persona Version from an existing Project without duplicating", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-import-"));
    prepareDraft(projectDirectory);
    const snapshot = await runMocked(projectDirectory, currentPlanHash(projectDirectory), true);
    expect(snapshot.persona).toBeTruthy();
    // Reset library then import from the written Project.
    configureLibraryDirectory(mkdtempSync(join(tmpdir(), "opinion-persona-lib-import-")));
    expect(listPersonas().personas).toHaveLength(0);
    const first = addPersona(snapshot.persona!, {
      projectId: snapshot.projectId,
      projectDirectory
    });
    expect(first.saved).toBe(true);
    const second = addPersona(snapshot.persona!, {
      projectId: snapshot.projectId,
      projectDirectory
    });
    expect(second.saved).toBe(false);
    expect(listPersonas().personas).toHaveLength(1);
  });

  it("selects 1-30 confirmed library Personas for a batch Preflight", () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-lib-batch-"));
    prepareDraft(projectDirectory);
    const second = confirmManualPersona({
      id: "persona-version-parent-v1",
      personaId: "persona-parent",
      label: "家長",
      rawInput: "我是學生家長，在意溝通透明。",
      fields: { roleAndContext: "我是學生家長，在意溝通透明。" },
      confirmedAt: "2026-09-03T00:00:00Z",
      confirmedBy: "desktop-user",
      realPersonApplies: false
    });
    addPersona(second, null);
    const ids = listPersonas().personas.map((entry) => entry.personaVersion.id);

    const draft = selectDraftPersonas(projectDirectory, ids);
    expect(draft.personas).toHaveLength(2);
    const view = renderDraftPreflight(projectDirectory) as { isBatch: boolean; personas: unknown[] };
    expect(view.isBatch).toBe(true);
    expect(view.personas).toHaveLength(2);
    expect(() => selectDraftPersonas(projectDirectory, [])).toThrow(/1.*30/);
  });
});

describe("persistent run queue", () => {
  beforeEach(() => {
    configureSessionStores();
  });

  it("enqueues a mocked Job, processes it, and skips it on resume because the Run exists", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-queue-"));
    prepareDraft(projectDirectory);
    const job = enqueueRun(projectDirectory, currentPlanHash(projectDirectory), true, "mocked");
    expect(job.status).toBe("queued");
    expect(job).not.toHaveProperty("request");
    const snapshot = await processQueue(projectDirectory);
    expect(snapshot?.runIds).toHaveLength(1);
    expect(listQueuedJobs(projectDirectory)[0]?.status).toBe("completed");
    const missing = resumeMissingJobs();
    expect(missing).toEqual([]);
    await processQueue(projectDirectory);
    expect(listQueuedJobs(projectDirectory)[0]?.status).toBe("completed");
    const python = execFileSync(
      "python3",
      ["-B", ".agents/skills/opinion-simulator/scripts/opinion_simulator.py", "validate-project", projectDirectory],
      { encoding: "utf8", cwd: join(__dirname, "..", "..", "..", "..") }
    );
    expect(JSON.parse(python).status).toBe("valid");
    expect(JSON.parse(python).runsChecked).toBe(1);
  });

  it("executes and persists all three approved Samples with an exact-text Stability Comparison", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-stability-"));
    prepareDraft(projectDirectory);
    saveDraft({ projectDirectory, sampleCount: 3 });

    const preflight = renderDraftPreflight(projectDirectory) as {
      planHash: string;
      sampleCount: number;
      sampleIds: string[];
    };
    expect(preflight.sampleCount).toBe(3);
    expect(preflight.sampleIds).toHaveLength(3);

    const completed = await enqueueAndProcess(projectDirectory, preflight.planHash, true, "mocked");
    expect(completed.jobs[0]?.status).toBe("completed");
    expect(completed.snapshot).not.toBeNull();

    const run = JSON.parse(
      readFileSync(join(projectDirectory, "runs", `${completed.jobs[0]?.runId}.json`), "utf8")
    ) as {
      executionPlan: { sampleIds: string[] };
      samples: Array<{ sampleId: string }>;
      stabilityComparison: { mode: string };
    };
    expect(run.samples.map((sample) => sample.sampleId)).toEqual(run.executionPlan.sampleIds);
    expect(run.samples).toHaveLength(3);
    expect(run.stabilityComparison.mode).toBe("three-sample-exact-normalized-comparison");

    const python = execFileSync(
      "python3",
      ["-B", ".agents/skills/opinion-simulator/scripts/opinion_simulator.py", "validate-project", projectDirectory],
      { encoding: "utf8", cwd: join(__dirname, "..", "..", "..", "..") }
    );
    expect(JSON.parse(python).status).toBe("valid");
  });

  it("surfaces a single Job execution error after recording it", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-job-error-"));
    prepareDraft(projectDirectory);
    const planHash = currentPlanHash(projectDirectory);
    writeFileSync(join(projectDirectory, "foreign.txt"), "do not overwrite", "utf8");

    await expect(enqueueAndProcess(projectDirectory, planHash, true, "mocked")).rejects.toThrow(
      /Refusing to write/
    );
    expect(listQueuedJobs(projectDirectory)).toMatchObject([
      { status: "partial", error: expect.stringMatching(/Refusing to write/) }
    ]);
  });

  it("resumes an interrupted running Job only when its Run artifact is missing", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-resume-"));
    prepareDraft(projectDirectory);
    const job = enqueueRun(projectDirectory, currentPlanHash(projectDirectory), true, "mocked");
    const queue = loadQueue();
    const stored = queue.jobs.find((item) => item.jobId === job.jobId);
    expect(stored).toBeTruthy();
    stored!.status = "running";
    saveQueue(queue);
    const missing = resumeMissingJobs();
    expect(missing.map((item) => item.jobId)).toEqual([job.jobId]);
    const snapshot = await processQueue(projectDirectory);
    expect(snapshot?.runIds).toEqual([job.runId]);
    expect(listQueuedJobs(projectDirectory)[0]?.status).toBe("completed");
  });

  it("cancels a queued Job without writing a Run, and retry then completes it", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-cancel-"));
    prepareDraft(projectDirectory);
    const job = enqueueRun(projectDirectory, currentPlanHash(projectDirectory), true, "mocked");
    expect(cancelJob(job.jobId).status).toBe("cancelled");
    await processQueue(projectDirectory);
    expect(() => readFileSync(join(projectDirectory, "project.json"), "utf8")).toThrow();
    retryJob(job.jobId);
    const snapshot = await processQueue(projectDirectory);
    expect(snapshot?.runId).toBe(job.runId);
    expect(listQueuedJobs(projectDirectory)[0]?.status).toBe("completed");
    expect(listQueuedJobs(projectDirectory)[0]?.attempt).toBe(2);
  });

  it("retains a completed provider result as a partial Job when Project publication fails, then publishes it on retry", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-partial-"));
    const sentinel = join(projectDirectory, "do-not-write-here.txt");
    writeFileSync(sentinel, "occupied", "utf8");
    prepareDraft(projectDirectory);
    const job = enqueueRun(projectDirectory, currentPlanHash(projectDirectory), true, "mocked");
    expect(await processQueue(projectDirectory)).toBeNull();
    expect(listQueuedJobs(projectDirectory)[0]?.status).toBe("partial");
    expect(loadQueue().jobs.find((item) => item.jobId === job.jobId)?.result).not.toBeNull();
    // Test-only cleanup inside a newly created temporary directory. This
    // permits the retry to exercise publication from the stored result.
    rmSync(sentinel);
    retryJob(job.jobId);
    const snapshot = await processQueue(projectDirectory);
    expect(snapshot?.runId).toBe(job.runId);
    expect(listQueuedJobs(projectDirectory)[0]?.status).toBe("completed");
    expect(loadQueue().jobs.find((item) => item.jobId === job.jobId)?.result).toBeNull();
  });

  it("rejects a reused Preflight hash after a mocked Run and accepts a refreshed hash", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-consumed-preflight-"));
    prepareDraft(projectDirectory);
    const firstHash = currentPlanHash(projectDirectory);
    await enqueueAndProcess(projectDirectory, firstHash, true, "mocked");
    expect(() => enqueueRun(projectDirectory, firstHash, true, "live")).toThrow(/上一筆 Run/);
    const second = await enqueueAndProcess(
      projectDirectory,
      currentPlanHash(projectDirectory),
      true,
      "mocked"
    );
    expect(second.snapshot?.runIds).toHaveLength(2);
  });

  it("continues later Jobs when one queued Job fails", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-queue-continue-"));
    prepareDraft(projectDirectory);
    const first = enqueueRun(projectDirectory, currentPlanHash(projectDirectory), true, "mocked");
    saveDraft({
      projectDirectory,
      questions: ["你會支持這項計畫嗎？", "推動時最大的阻力是什麼？", "還缺什麼資訊？"]
    });
    const second = enqueueRun(projectDirectory, currentPlanHash(projectDirectory), true, "mocked");
    const queue = loadQueue();
    const stored = queue.jobs.find((item) => item.jobId === first.jobId);
    expect(stored).toBeTruthy();
    stored!.planHash = "0".repeat(64);
    stored!.approval = { ...stored!.approval, planHash: stored!.planHash };
    saveQueue(queue);
    const snapshot = await processQueue(projectDirectory);
    expect(listQueuedJobs(projectDirectory).find((job) => job.jobId === first.jobId)?.status).toBe(
      "failed"
    );
    expect(listQueuedJobs(projectDirectory).find((job) => job.jobId === second.jobId)?.status).toBe(
      "completed"
    );
    expect(snapshot?.runIds).toEqual([second.runId]);
  });

  it("returns the same Job when enqueueAndProcess is called twice with one submissionId", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-sub-dedup-"));
    prepareDraft(projectDirectory);
    const planHash = currentPlanHash(projectDirectory);
    const [first, second] = await Promise.all([
      enqueueAndProcess(projectDirectory, planHash, true, "mocked", "sub-single-001"),
      enqueueAndProcess(projectDirectory, planHash, true, "mocked", "sub-single-001")
    ]);
    expect(listQueuedJobs(projectDirectory)).toHaveLength(1);
    expect(first.jobs.map((job) => job.jobId)).toEqual(second.jobs.map((job) => job.jobId));
    expect(first.submissionId).toBe("sub-single-001");
    expect(second.duplicate).toBe(true);
  });
});

describe("session prediction disclaimer", () => {
  beforeEach(() => {
    configureSessionStores();
  });

  it("keeps the session disclaimer after preview, input changes, and a completed Run", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-disclaimer-keep-"));
    prepareDraft(projectDirectory, { acknowledgeDisclaimer: false });
    expect(isDisclaimerAcknowledged(projectDirectory)).toBe(false);
    expect(setDraftDisclaimer(projectDirectory, true)).toEqual({ disclaimerAcknowledged: true });
    renderDraftPreflight(projectDirectory);
    expect(isDisclaimerAcknowledged(projectDirectory)).toBe(true);
    saveDraft({
      projectDirectory,
      questions: ["你會支持這項計畫嗎？", "推動時最大的阻力是什麼？", "還缺什麼資訊？"]
    });
    const secondView = renderDraftPreflight(projectDirectory) as { planHash: string };
    expect(isDisclaimerAcknowledged(projectDirectory)).toBe(true);
    await enqueueAndProcess(projectDirectory, secondView.planHash, true, "mocked");
    expect(isDisclaimerAcknowledged(projectDirectory)).toBe(true);
    expect(listQueuedJobs(projectDirectory)).toHaveLength(1);
  });

  it("does not treat checking the disclaimer as a plan approval", () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-disclaimer-no-approve-"));
    prepareDraft(projectDirectory, { acknowledgeDisclaimer: false });
    setDraftDisclaimer(projectDirectory, true);
    expect(listQueuedJobs(projectDirectory)).toEqual([]);
    expect(() => enqueueRun(projectDirectory, "0".repeat(64), true, "mocked")).toThrow(/Preflight/);
    expect(listQueuedJobs(projectDirectory)).toEqual([]);
  });

  it("resets the disclaimer when a different Project is opened", () => {
    const first = mkdtempSync(join(tmpdir(), "opinion-desktop-disclaimer-a-"));
    const second = mkdtempSync(join(tmpdir(), "opinion-desktop-disclaimer-b-"));
    prepareDraft(first, { acknowledgeDisclaimer: false });
    setDraftDisclaimer(first, true);
    expect(isDisclaimerAcknowledged(first)).toBe(true);
    createDraft(second, "另一個專案");
    expect(isDisclaimerAcknowledged(first)).toBe(false);
    expect(isDisclaimerAcknowledged(second)).toBe(false);
  });

  it("rejects enqueue when the session disclaimer is not checked", () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-disclaimer-required-"));
    prepareDraft(projectDirectory, { acknowledgeDisclaimer: false });
    const hash = currentPlanHash(projectDirectory);
    expect(() => enqueueRun(projectDirectory, hash, true, "mocked")).toThrow(/預測聲明/);
  });
});

describe("workbook draft import", () => {
  beforeEach(() => {
    configureSessionStores();
  });

  it("keeps an imported workbook draft when the empty folder is reopened", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-import-keep-"));
    createDraft(projectDirectory, "Import Target");
    const imported = await importWorkbookToDraft(projectDirectory, GOLDEN_WORKBOOK);
    expect(imported.personaCount).toBe(2);
    expect(imported.sourceText.length).toBeGreaterThan(0);
    expect(imported.questions.length).toBeGreaterThan(0);

    const reopened = openOrCreateDraft(projectDirectory, "should not wipe");
    expect(reopened.openedExisting).toBe(false);
    expect(reopened.sourceText).toBe(imported.sourceText);
    expect(reopened.personaRaw).toBe(imported.personaRaw);

    expect(() => renderDraftPreflight(projectDirectory)).toThrow(/確認.*Persona/);
    expect(imported.personas.map((persona) => persona.personaId)).toEqual([
      "persona-001",
      "persona-002"
    ]);

    confirmDraftPersona(projectDirectory);
    const view = renderDraftPreflight(projectDirectory) as {
      isBatch: boolean;
      personas: unknown[];
    };
    expect(view.isBatch).toBe(true);
    expect(view.personas).toHaveLength(2);
  });

  it("records one execution batch per submit and keeps a second submit separate", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-exec-batch-"));
    createDraft(projectDirectory, "Batch Compare");
    const imported = await importWorkbookToDraft(projectDirectory, GOLDEN_WORKBOOK);
    expect(imported.personaCount).toBe(2);
    confirmDraftPersona(projectDirectory);
    setDraftDisclaimer(projectDirectory, true);
    const firstView = renderDraftPreflight(projectDirectory) as { batchPlanHash: string };
    const first = await enqueueBatchAndProcess(
      projectDirectory,
      firstView.batchPlanHash,
      true,
      "mocked",
      "sub-compare-first"
    );
    expect(first.snapshot?.executionBatches).toHaveLength(1);
    expect(first.snapshot?.executionBatches[0]?.runIds).toHaveLength(2);
    expect(first.snapshot?.executionBatches[0]?.executionBatchId).toBe("sub-compare-first");
    const secondView = renderDraftPreflight(projectDirectory) as { batchPlanHash: string };
    const second = await enqueueBatchAndProcess(
      projectDirectory,
      secondView.batchPlanHash,
      true,
      "mocked",
      "sub-compare-second"
    );
    expect(second.snapshot?.executionBatches).toHaveLength(2);
    expect(second.snapshot?.executionBatches[1]?.executionBatchId).toBe("sub-compare-second");
    expect(second.snapshot?.executionBatches[0]?.runIds).toEqual(first.snapshot?.executionBatches[0]?.runIds);
    expect(second.snapshot?.unbatchedRuns).toEqual([]);
  });
});

describe("question library draft apply", () => {
  beforeEach(() => {
    configureSessionStores();
  });

  it("copies library questions into the draft and does not rewrite a completed Run", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-qlib-"));
    prepareDraft(projectDirectory);
    const saved = saveQuestionLibraryEntry({
      name: "加一題",
      questions: ["還缺什麼資訊？"]
    });
    const appended = applyQuestionSetFromLibrary(projectDirectory, saved.entry.id, "append");
    expect(appended.questions).toEqual([
      "你會支持這項計畫嗎？",
      "推動時最大的阻力是什麼？",
      "還缺什麼資訊？"
    ]);
    const snapshot = await enqueueAndProcess(
      projectDirectory,
      currentPlanHash(projectDirectory),
      true,
      "mocked"
    );
    expect(snapshot.snapshot?.questions).toEqual(appended.questions);
    saveQuestionLibraryEntry({
      id: saved.entry.id,
      name: "加一題",
      questions: ["庫已改寫。"]
    });
    expect(readSnapshot(projectDirectory).questions).toEqual(appended.questions);
    const replaced = applyQuestionSetFromLibrary(projectDirectory, saved.entry.id, "replace");
    expect(replaced.questions).toEqual(["庫已改寫。"]);
    expect(readSnapshot(projectDirectory).questions).toEqual(appended.questions);
  });
});
