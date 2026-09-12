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
export type SubmissionAcceptStatus = "accepting" | "accepted" | "failed";
export type SubmissionPhase =
  | "accepted"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "submit_failed";

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
  sampleCount: number;
};

export type StoredSampleResult = {
  sampleId: string;
  result: StructuredResult;
  rawResponse: unknown;
  provider: ProviderId;
  model: string;
  completedAt: string;
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
  submissionId?: string;
  /** A provider response saved before Project publication can be recovered without another call. */
  result: { samples: StoredSampleResult[] } | null;
  request: JobRequest;
};

export type SubmissionRecord = {
  submissionId: string;
  projectDirectory: string;
  batchId: string | null;
  jobIds: string[];
  planHash: string;
  mode: JobMode;
  createdAt: string;
  acceptError: string | null;
  status: SubmissionAcceptStatus;
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
  submissionId: string | null;
};

export type RunQueue = {
  schemaVersion: string;
  jobs: RunJob[];
  submissions: SubmissionRecord[];
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
  return { schemaVersion: QUEUE_SCHEMA_VERSION, jobs: [], submissions: [] };
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
    if (job.request && job.request.sampleCount === undefined) {
      job.request.sampleCount = 1;
    }
    const legacyResult = job.result as unknown as StoredSampleResult | null;
    if (legacyResult && !Array.isArray((job.result as { samples?: unknown }).samples)) {
      job.result = {
        samples: [
          {
            sampleId: `${job.runId}-sample-001`,
            result: legacyResult.result,
            rawResponse: legacyResult.rawResponse,
            provider: legacyResult.provider,
            model: legacyResult.model,
            completedAt: legacyResult.completedAt
          }
        ]
      };
    }
    if (
      !job?.jobId ||
      !job?.runId ||
      !job?.projectDirectory ||
      !job?.request?.persona?.id ||
      !job?.approval ||
      job.approval.planHash !== job.planHash ||
      !Object.prototype.hasOwnProperty.call(job, "result") ||
      (!Number.isInteger(job.request.sampleCount) ||
        job.request.sampleCount < 1 ||
        job.request.sampleCount > 10)
    ) {
      throw new Error(`Run queue 含不完整條目（${path}）`);
    }
  }
  const rawSubmissions = (queue as { submissions?: unknown }).submissions;
  let submissions: SubmissionRecord[] = [];
  if (rawSubmissions !== undefined) {
    if (!Array.isArray(rawSubmissions)) {
      throw new Error(`Run queue 檔案格式不符（${path}）；請手動檢查或備份後處理`);
    }
    for (const submission of rawSubmissions as SubmissionRecord[]) {
      if (
        !submission?.submissionId ||
        typeof submission.projectDirectory !== "string" ||
        !Array.isArray(submission.jobIds) ||
        (submission.status !== "accepting" &&
          submission.status !== "accepted" &&
          submission.status !== "failed")
      ) {
        throw new Error(`Run queue 含不完整送出紀錄（${path}）`);
      }
    }
    submissions = rawSubmissions as SubmissionRecord[];
  }
  return { ...(parsed as RunQueue), jobs: queue.jobs as RunJob[], submissions };
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
    attempt: job.attempt,
    submissionId: job.submissionId ?? null
  };
}

export function getSubmission(submissionId: string): SubmissionRecord | undefined {
  return loadQueue().submissions.find((item) => item.submissionId === submissionId);
}

export function putSubmission(record: SubmissionRecord): SubmissionRecord {
  const queue = loadQueue();
  const index = queue.submissions.findIndex((item) => item.submissionId === record.submissionId);
  if (index >= 0) {
    queue.submissions[index] = record;
  } else {
    queue.submissions.push(record);
  }
  persistQueue(queue);
  return record;
}

export function deriveSubmissionStatus(
  record: Pick<SubmissionRecord, "acceptError" | "status">,
  jobs: Array<{ status: JobStatus }>
): SubmissionPhase {
  if (record.acceptError || record.status === "failed") {
    return "submit_failed";
  }
  if (jobs.length === 0) {
    return "accepted";
  }
  if (jobs.some((job) => job.status === "queued" || job.status === "running")) {
    return jobs.every((job) => job.status === "queued") ? "accepted" : "running";
  }
  if (jobs.every((job) => job.status === "completed")) {
    return "completed";
  }
  if (jobs.some((job) => job.status === "completed" || job.status === "partial")) {
    return "partial";
  }
  return "failed";
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
