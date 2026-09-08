import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { confirmManualPersona } from "@opinion-simulator/core";
import {
  QUEUE_FILENAME,
  appendJob,
  configureQueueDirectory,
  listJobs,
  loadQueue,
  pendingArtifacts,
  type RunJob
} from "./run-queue";

function makeJob(runId: string): RunJob {
  const persona = confirmManualPersona({
    id: "persona-version-queue-v1",
    personaId: "persona-queue",
    label: "政策分析師",
    rawInput: "我是政策分析師。",
    fields: { roleAndContext: "我是政策分析師。" },
    confirmedAt: "2026-08-25T00:00:00Z",
    confirmedBy: "test",
    realPersonApplies: false
  });
  return {
    jobId: `job-${runId}`,
    projectDirectory: "/tmp/project",
    projectId: "project-queue",
    runId,
    reportId: runId.replace("run", "report"),
    mode: "mocked",
    planHash: "a".repeat(64),
    approval: {
      schemaVersion: "0.0",
      runId,
      planHash: "a".repeat(64),
      approvedAt: "2026-08-25T00:00:00Z",
      acknowledgedDisclaimer: true,
      realPersonReconfirmed: false
    },
    status: "queued",
    createdAt: "2026-08-25T00:00:00Z",
    startedAt: null,
    completedAt: null,
    error: null,
    attempt: 1,
    result: null,
    request: {
      title: "queue",
      sourceText: "材料",
      sourceId: "source-1",
      personaRaw: persona.rawInput,
      personaLabel: persona.label,
      realPersonApplies: false,
      questions: ["問題？"],
      persona,
      provider: "gemini",
      model: "gemini-3.6-flash",
      createdAt: "2026-08-25T00:00:00Z",
      questionSet: {
        id: "questions-1",
        title: "使用者問題",
        questions: ["問題？"],
        responseInstructions: ""
      },
      sampleCount: 1
    }
  };
}

describe("run queue persistence", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "opinion-run-queue-"));
    configureQueueDirectory(directory);
  });

  it("starts empty and stores jobs without credential-shaped fields", () => {
    expect(loadQueue().jobs).toEqual([]);
    appendJob(makeJob("run-001"));
    const listed = listJobs();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.runId).toBe("run-001");
    expect(listed[0]).not.toHaveProperty("request");
    const raw = readFileSync(join(directory, QUEUE_FILENAME), "utf8");
    expect(raw).not.toMatch(/apiKey|GEMINI_API_KEY|OPENAI_API_KEY/i);
    expect(pendingArtifacts("/tmp/project").runIds).toEqual(["run-001"]);
  });

  it("refuses a corrupt queue file instead of rewriting it", () => {
    const path = join(directory, QUEUE_FILENAME);
    writeFileSync(path, "{not-json", "utf8");
    expect(() => loadQueue()).toThrow(/無法解析/);
    expect(readFileSync(path, "utf8")).toBe("{not-json");
    writeFileSync(path, JSON.stringify({ schemaVersion: "9.9", jobs: [] }), "utf8");
    expect(() => loadQueue()).toThrow(/格式不符/);
  });
});
