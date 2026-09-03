import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  PersonaVersion,
  PreflightApproval,
  ProviderId,
  QuestionSet,
  StructuredResult
} from "@opinion-simulator/core";

/**
 * v0.2 increment 6: persistent Run queue in app-data.
 *
 * The queue file is the operational store for Jobs; completed Runs still live
 * only in the open Project. Restart resumes Jobs whose Run artifact is
 * missing; Jobs that already wrote a Run are marked completed and never
 * re-executed. This module holds no credentials.
 */

export const QUEUE_SCHEMA_VERSION = "0.0";
export const QUEUE_FILENAME = "run-queue.json";

export type JobMode = "mocked" | "live";
export type JobStatus = "queued" | "running" | "partial" | "completed" | "cancelled" | "failed";

export type JobRequest = {
  title: string;
  sourceText: string;
  sourceId: string;
  personaRaw: string;
  personaLabel: string;
  realPersonApplies: boolean;
  questions: string[];
  persona: PersonaVersion;
  provider: ProviderId;
  model: string;
  createdAt: string;
  questionSet: QuestionSet;
};

export type RunJob = {
  jobId: string;
  projectDirectory: string;
  projectId: string;
  runId: string;
  reportId: string;
  mode: JobMode;
  planHash: string;
  approval: PreflightApproval;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  attempt: number;
  /** A provider response saved before Project publication can be recovered without another call. */
  result: {
    result: StructuredResult;
    rawResponse: unknown;
    provider: ProviderId;
    model: string;
    completedAt: string;
  } | null;
  request: JobRequest;
};

export type JobSummary = {
  jobId: string;
  projectDirectory: string;
  projectId: string;
  runId: string;
  reportId: string;
  mode: JobMode;
  provider: ProviderId;
  model: string;
  planHash: string;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  attempt: number;
};

export type RunQueue = {
  schemaVersion: string;
  jobs: RunJob[];
};

let queueDirectory: string | null = null;
const cancelRequested = new Set<string>();

export function configureQueueDirectory(directory: string): void {
  queueDirectory = directory;
}

function defaultQueueDirectory(): string {
  return join(homedir(), ".config", "opinion-simulator");
}

function queuePath(): string {
  return join(queueDirectory ?? defaultQueueDirectory(), QUEUE_FILENAME);
}

function emptyQueue(): RunQueue {
  return { schemaVersion: QUEUE_SCHEMA_VERSION, jobs: [] };
}

export function loadQueue(): RunQueue {
  const path = queuePath();
  if (!existsSync(path)) {
    return emptyQueue();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Run queue 檔案無法解析（${path}）：${(error as Error).message}`);
  }
  const queue = parsed as Partial<RunQueue>;
  if (
    !queue ||
    typeof queue !== "object" ||
    queue.schemaVersion !== QUEUE_SCHEMA_VERSION ||
    !Array.isArray(queue.jobs)
  ) {
    throw new Error(`Run queue 檔案格式不符（${path}）；請手動檢查或備份後處理`);
  }
  for (const job of queue.jobs as RunJob[]) {
    if (
      !job?.jobId ||
      !job?.runId ||
      !job?.projectDirectory ||
      !job?.request?.persona?.id ||
      !job?.approval ||
      job.approval.planHash !== job.planHash ||
      !Object.prototype.hasOwnProperty.call(job, "result")
    ) {
      throw new Error(`Run queue 含不完整條目（${path}）`);
    }
  }
  return parsed as RunQueue;
}

export function saveQueue(queue: RunQueue): void {
  persistQueue(queue);
}

function persistQueue(queue: RunQueue): void {
  const directory = queueDirectory ?? defaultQueueDirectory();
  const path = queuePath();
  mkdirSync(directory, { recursive: true });
  const temp = join(directory, `.${QUEUE_FILENAME}.tmp-${process.pid}-${Date.now()}`);
  writeFileSync(temp, JSON.stringify(queue, null, 2), "utf8");
  renameSync(temp, path);
}

export function toSummary(job: RunJob): JobSummary {
  return {
    jobId: job.jobId,
    projectDirectory: job.projectDirectory,
    projectId: job.projectId,
    runId: job.runId,
    reportId: job.reportId,
    mode: job.mode,
    provider: job.request.provider,
    model: job.request.model,
    planHash: job.planHash,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    attempt: job.attempt
  };
}

export function listJobs(projectDirectory?: string): JobSummary[] {
  const jobs = loadQueue().jobs.filter((job) =>
    projectDirectory ? job.projectDirectory === projectDirectory : true
  );
  return jobs.map(toSummary);
}

export function getJob(jobId: string): RunJob | undefined {
  return loadQueue().jobs.find((job) => job.jobId === jobId);
}

export function appendJob(job: RunJob): JobSummary {
  const queue = loadQueue();
  queue.jobs.push(job);
  persistQueue(queue);
  return toSummary(job);
}

export function updateJob(jobId: string, patch: Partial<Omit<RunJob, "jobId" | "request">>): RunJob {
  const queue = loadQueue();
  const job = queue.jobs.find((item) => item.jobId === jobId);
  if (!job) {
    throw new Error("找不到這個 Job");
  }
  Object.assign(job, patch);
  persistQueue(queue);
  return job;
}

export function pendingArtifacts(projectDirectory: string): {
  runIds: string[];
  reportIds: string[];
  sourceIds: string[];
  questionSets: QuestionSet[];
} {
  const pending = loadQueue().jobs.filter(
    (job) =>
      job.projectDirectory === projectDirectory &&
      (job.status === "queued" || job.status === "running" || job.status === "partial")
  );
  return {
    runIds: pending.map((job) => job.runId),
    reportIds: pending.map((job) => job.reportId),
    sourceIds: pending.map((job) => job.request.sourceId),
    questionSets: pending.map((job) => job.request.questionSet)
  };
}

export function requestCancel(jobId: string): void {
  cancelRequested.add(jobId);
}

export function isCancelRequested(jobId: string): boolean {
  return cancelRequested.has(jobId);
}

export function clearCancel(jobId: string): void {
  cancelRequested.delete(jobId);
}

export function resetCancelFlagsForTests(): void {
  cancelRequested.clear();
}
