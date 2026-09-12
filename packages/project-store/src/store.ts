import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import {
  DISCLAIMER,
  compareStability,
  assertSafeIpcValue,
  canonicalJson,
  hashJson,
  methodologyHash,
  methodologyMarkdown,
  planHash as hashExecutionPlan,
  renderSimulationReport,
  sha256Bytes,
  type ExecutionPlan,
  type PersonaVersion,
  type QuestionSet,
  type StructuredResult
} from "@opinion-simulator/core";

export type ProjectSnapshot = {
  projectDirectory: string;
  projectId: string;
  title: string;
  sourceText: string;
  sourceId: string;
  persona: PersonaVersion | null;
  questions: string[];
  questionTitle: string;
  runId: string | null;
  runIds: string[];
  reportMarkdown: string | null;
  result: StructuredResult | null;
  rawResponse: unknown;
  provider: string | null;
  model: string | null;
  runs?: SnapshotRun[];
  executionBatches: ExecutionBatchView[];
  unbatchedRuns: SnapshotRun[];
};

export type SnapshotRun = {
  runId: string;
  reportId?: string;
  personaId?: string;
  personaVersionId?: string;
  personaLabel: string;
  result: StructuredResult | null;
  answers: Array<{ question: string; answer: string }>;
  rawResponse: unknown;
  stabilityComparison?: unknown;
  provider: string | null;
  model: string | null;
  reportMarkdown: string | null;
  samples: Array<{ sampleId: string; result: StructuredResult | null }>;
};

export type ExecutionBatchView = {
  executionBatchId: string;
  createdAt: string;
  sourceId: string;
  sourceText: string;
  questions: string[];
  questionTitle: string;
  provider: string | null;
  model: string | null;
  runIds: string[];
  reportIds: string[];
  runs: SnapshotRun[];
};

export type ExecutionBatchRecord = {
  executionBatchId: string;
  createdAt: string;
  sourceId: string;
  questionSetId: string;
  provider: string;
  model: string;
  runIds: string[];
  reportIds: string[];
};

export type WriteTargetKind = "absent" | "empty" | "project" | "occupied";

export type ProjectSource = {
  sourceId: string;
  textSha256: string;
  text: string;
};

export type ProjectInspection = {
  projectDirectory: string;
  projectId: string;
  title: string;
  description: string;
  locale: "zh-TW" | "en";
  createdAt: string;
  updatedAt: string;
  sourceIds: string[];
  sources: ProjectSource[];
  personas: PersonaVersion[];
  currentPersonaVersionIds: string[];
  questionSets: QuestionSet[];
  promptTemplateVersions: Array<{ id: string; version: number; contentHash: string }>;
  runIds: string[];
  reportIds: string[];
  executionBatches: ExecutionBatchRecord[];
  compatibility: {
    writer: string;
    writerVersion: string;
    minimumReaderVersion: string;
  };
};

type CompletedRunInput = {
  projectDirectory: string;
  projectId: string;
  title: string;
  description: string;
  locale: "zh-TW" | "en";
  createdAt: string;
  completedAt: string;
  sourceId: string;
  sourceText: string;
  persona: PersonaVersion;
  questionSet: QuestionSet;
  plan: ExecutionPlan;
  planHash: string;
  runId: string;
  reportId: string;
  samples: Array<{
    sampleId: string;
    result: StructuredResult;
    rawResponse: unknown;
    provider: string;
    model: string;
    completedAt: string;
  }>;
  approval: {
    schemaVersion: "0.0";
    runId: string;
    planHash: string;
    approvedAt: string;
    acknowledgedDisclaimer: true;
    realPersonReconfirmed: boolean;
  };
  executionBatchId?: string;
};

function isCanonical(relativePath: string): boolean {
  return !relativePath.split(sep).some((part) => part.startsWith("."));
}

function canonicalEntries(dir: string): string[] {
  return readdirSync(dir).filter((name) => !name.startsWith("."));
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const rel = relative(root, full);
      if (!isCanonical(rel)) {
        continue;
      }
      if (statSync(full).isDirectory()) {
        stack.push(full);
      } else if (entry !== "checksums.sha256") {
        out.push(full);
      }
    }
  }
  return out.sort();
}

type JsonObject = Record<string, unknown>;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function areExecutionBatchesValid(
  project: JsonObject,
  runIds: string[],
  reportIds: string[]
): boolean {
  if (!Array.isArray(project.executionBatches)) {
    return false;
  }
  const seenBatchIds = new Set<string>();
  const seenRunIds = new Set<string>();
  const seenReportIds = new Set<string>();
  for (const batch of project.executionBatches) {
    if (
      !isRecord(batch) ||
      !hasOnlyKeys(batch, [
        "executionBatchId",
        "createdAt",
        "sourceId",
        "questionSetId",
        "provider",
        "model",
        "runIds",
        "reportIds"
      ]) ||
      !isIdentifier(batch.executionBatchId) ||
      !isIsoDate(batch.createdAt) ||
      !isIdentifier(batch.sourceId) ||
      !isIdentifier(batch.questionSetId) ||
      !isNonEmptyString(batch.provider) ||
      !isNonEmptyString(batch.model) ||
      !isUniqueStringArray(batch.runIds) ||
      !isUniqueStringArray(batch.reportIds) ||
      seenBatchIds.has(batch.executionBatchId) ||
      !batch.runIds.every((id) => runIds.includes(id) && !seenRunIds.has(id)) ||
      !batch.reportIds.every((id) => reportIds.includes(id) && !seenReportIds.has(id))
    ) {
      return false;
    }
    seenBatchIds.add(batch.executionBatchId);
    for (const id of batch.runIds) {
      seenRunIds.add(id);
    }
    for (const id of batch.reportIds) {
      seenReportIds.add(id);
    }
  }
  return true;
}

function isUniqueStringArray(value: unknown, allowEmpty = false): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every((item) => typeof item === "string") &&
    new Set(value).size === value.length
  );
}

function isCredentialSafeObject(value: unknown): boolean {
  try {
    assertSafeIpcValue(value);
    return true;
  } catch {
    return false;
  }
}

function readChecksumManifest(projectDir: string): Map<string, string> | null {
  const checksumPath = join(projectDir, "checksums.sha256");
  if (!existsSync(checksumPath)) {
    return null;
  }
  const recorded = new Map<string, string>();
  for (const line of readFileSync(checksumPath, "utf8").split(/\r?\n/)) {
    if (!line) {
      continue;
    }
    const match = line.match(/^([a-f0-9]{64})  ([^\r\n]+)$/);
    if (!match || recorded.has(match[2])) {
      return null;
    }
    recorded.set(match[2], match[1]);
  }
  return recorded;
}

function checksumManifestIsComplete(projectDir: string): boolean {
  const recorded = readChecksumManifest(projectDir);
  if (!recorded) {
    return false;
  }
  const files = walkFiles(projectDir);
  if (files.length !== recorded.size) {
    return false;
  }
  return files.every((file) => {
    const path = relative(projectDir, file).split(sep).join("/");
    return recorded.get(path) === sha256Bytes(readFileSync(file));
  });
}

/**
 * A user may add a root-level note after a completed Run. It is not a Project
 * artifact and contains no index or executable semantics. Preserve it on the
 * next append, where the regenerated checksum manifest records it. Missing
 * checksum entries are never tolerated under sources/, runs/, reports/, nor
 * for any existing Project document.
 */
function checksumManifestAllowsAuxiliaryRootFiles(projectDir: string): boolean {
  const recorded = readChecksumManifest(projectDir);
  if (!recorded) {
    return false;
  }
  const files = walkFiles(projectDir);
  const paths = files.map((file) => relative(projectDir, file).split(sep).join("/"));
  if (
    ![...recorded.entries()].every(([path, hash]) => {
      const index = paths.indexOf(path);
      return index >= 0 && hash === sha256Bytes(readFileSync(files[index]));
    })
  ) {
    return false;
  }
  return paths
    .filter((path) => !recorded.has(path))
    .every(
      (path) =>
        !path.includes("/") &&
        path !== "project.json" &&
        path !== "personas.json" &&
        path !== "methodology.md"
    );
}

function isQuestionSet(value: unknown): value is QuestionSet {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "title", "questions", "responseInstructions"])) {
    return false;
  }
  return (
    isIdentifier(value.id) &&
    isNonEmptyString(value.title) &&
    isUniqueStringArray(value.questions) &&
    typeof value.responseInstructions === "string"
  );
}

function isTemplateVersion(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "version", "contentHash"]) &&
    isNonEmptyString(value.id) &&
    Number.isInteger(value.version) &&
    typeof value.contentHash === "string" &&
    /^[a-f0-9]{64}$/.test(value.contentHash)
  );
}

function isConfirmedPersona(value: unknown): value is PersonaVersion {
  if (!isRecord(value)) {
    return false;
  }
  const {
    contentHash,
    id,
    personaId,
    status,
    label,
    rawInput,
    version,
    createdAt,
    ...withoutHash
  } = value;
  return (
    isIdentifier(id) &&
    isIdentifier(personaId) &&
    status === "confirmed" &&
    isNonEmptyString(label) &&
    isNonEmptyString(rawInput) &&
    Number.isInteger(version) &&
    isIsoDate(createdAt) &&
    typeof contentHash === "string" &&
    /^[a-f0-9]{64}$/.test(contentHash) &&
    contentHash === hashJson({ id, personaId, status, label, rawInput, version, createdAt, ...withoutHash })
  );
}

function exactIdSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function projectDocumentsAreValid(
  dir: string,
  project: JsonObject,
  personasDoc: JsonObject,
  sourceIndex: JsonObject
): ProjectSource[] | null {
  const projectKeys = [
    "schemaVersion",
    "projectId",
    "title",
    "description",
    "locale",
    "createdAt",
    "updatedAt",
    "sourceIds",
    "currentPersonaVersionIds",
    "questionSets",
    "promptTemplateVersions",
    "runIds",
    "reportIds",
    "compatibility"
  ];
  const projectKeysWithBatches = [...projectKeys, "executionBatches"];
  if (
    !(hasOnlyKeys(project, projectKeys) || hasOnlyKeys(project, projectKeysWithBatches)) ||
    project.schemaVersion !== "0.0" ||
    !isIdentifier(project.projectId) ||
    !isNonEmptyString(project.title) ||
    typeof project.description !== "string" ||
    (project.locale !== "zh-TW" && project.locale !== "en") ||
    !isIsoDate(project.createdAt) ||
    !isIsoDate(project.updatedAt) ||
    !isUniqueStringArray(project.sourceIds) ||
    !isUniqueStringArray(project.currentPersonaVersionIds) ||
    !isUniqueStringArray(project.runIds) ||
    !isUniqueStringArray(project.reportIds) ||
    !Array.isArray(project.questionSets) ||
    !project.questionSets.every(isQuestionSet) ||
    new Set(project.questionSets.map((item) => item.id)).size !== project.questionSets.length ||
    !Array.isArray(project.promptTemplateVersions) ||
    !project.promptTemplateVersions.every(isTemplateVersion) ||
    !isRecord(project.compatibility) ||
    !hasOnlyKeys(project.compatibility, ["writer", "writerVersion", "minimumReaderVersion"]) ||
    (project.compatibility.writer !== "opinion-simulator-skill" &&
      project.compatibility.writer !== "opinion-simulator-desktop") ||
    !isNonEmptyString(project.compatibility.writerVersion) ||
    !isNonEmptyString(project.compatibility.minimumReaderVersion) ||
    project.runIds.length !== project.reportIds.length
  ) {
    return null;
  }
  if (project.executionBatches !== undefined && !areExecutionBatchesValid(project, project.runIds, project.reportIds)) {
    return null;
  }
  if (
    !hasOnlyKeys(personasDoc, ["schemaVersion", "drafts", "versions"]) ||
    personasDoc.schemaVersion !== "0.0" ||
    !Array.isArray(personasDoc.drafts) ||
    personasDoc.drafts.length !== 0 ||
    !Array.isArray(personasDoc.versions) ||
    personasDoc.versions.length === 0 ||
    !personasDoc.versions.every(isConfirmedPersona)
  ) {
    return null;
  }
  const personas = personasDoc.versions as PersonaVersion[];
  const personaIds = personas.map((persona) => persona.id);
  if (
    new Set(personaIds).size !== personaIds.length ||
    !project.currentPersonaVersionIds.every((id) => personaIds.includes(id))
  ) {
    return null;
  }
  if (
    !hasOnlyKeys(sourceIndex, ["schemaVersion", "sources"]) ||
    sourceIndex.schemaVersion !== "0.0" ||
    !Array.isArray(sourceIndex.sources) ||
    sourceIndex.sources.length === 0
  ) {
    return null;
  }
  const sources: ProjectSource[] = [];
  for (const source of sourceIndex.sources) {
    if (
      !isRecord(source) ||
      !hasOnlyKeys(source, [
        "sourceId",
        "filename",
        "mediaType",
        "provenance",
        "extraction",
        "warnings",
        "textSha256",
        "originalCopied"
      ]) ||
      !isIdentifier(source.sourceId) ||
      !isNonEmptyString(source.filename) ||
      source.mediaType !== "text/plain" ||
      !isRecord(source.provenance) ||
      !hasOnlyKeys(source.provenance, ["kind", "recordedAt"]) ||
      source.provenance.kind !== "pasted-text" ||
      !isIsoDate(source.provenance.recordedAt) ||
      !isRecord(source.extraction) ||
      !hasOnlyKeys(source.extraction, ["method", "version", "lineEndings"]) ||
      source.extraction.method !== "pasted-text" ||
      source.extraction.version !== "0.0" ||
      source.extraction.lineEndings !== "LF" ||
      !Array.isArray(source.warnings) ||
      !source.warnings.every((warning) => typeof warning === "string") ||
      typeof source.textSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(source.textSha256) ||
      source.originalCopied !== false
    ) {
      return null;
    }
    const sourcePath = join(dir, "sources", source.sourceId + ".txt");
    if (!existsSync(sourcePath)) {
      return null;
    }
    const text = readFileSync(sourcePath, "utf8");
    if (sha256Bytes(text) !== source.textSha256) {
      return null;
    }
    sources.push({ sourceId: source.sourceId, textSha256: source.textSha256, text });
  }
  const sourceIds = sources.map((source) => source.sourceId);
  if (new Set(sourceIds).size !== sourceIds.length || !exactIdSet(project.sourceIds, sourceIds)) {
    return null;
  }
  const files = walkFiles(dir).map((file) => relative(dir, file).split(sep).join("/"));
  if (!files.includes("methodology.md")) {
    return null;
  }
  const expectedRunFiles = new Set(project.runIds.map((id) => "runs/" + id + ".json"));
  const expectedReportFiles = new Set(project.reportIds.map((id) => "reports/" + id + ".md"));
  const expectedSourceFiles = new Set(["sources/index.json", ...sourceIds.map((id) => "sources/" + id + ".txt")]);
  const actualRunFiles = files.filter((file) => file.startsWith("runs/"));
  const actualReportFiles = files.filter((file) => file.startsWith("reports/"));
  const actualSourceFiles = files.filter((file) => file.startsWith("sources/"));
  if (
    actualRunFiles.length !== expectedRunFiles.size ||
    actualRunFiles.some((file) => !expectedRunFiles.has(file)) ||
    actualReportFiles.length !== expectedReportFiles.size ||
    actualReportFiles.some((file) => !expectedReportFiles.has(file)) ||
    actualSourceFiles.length !== expectedSourceFiles.size ||
    actualSourceFiles.some((file) => !expectedSourceFiles.has(file))
  ) {
    return null;
  }
  for (const runId of project.runIds) {
    const run = JSON.parse(readFileSync(join(dir, "runs", runId + ".json"), "utf8"));
    if (
      !isRecord(run) ||
      run.schemaVersion !== "0.0" ||
      run.runId !== runId ||
      run.projectId !== project.projectId ||
      run.status !== "completed" ||
      !isRecord(run.executionPlan) ||
      !Array.isArray(run.samples) ||
      run.samples.length === 0 ||
      !run.samples.every(
        (sample) =>
          isRecord(sample) &&
          Object.prototype.hasOwnProperty.call(sample, "rawProviderResponse") &&
          isCredentialSafeObject(sample.rawProviderResponse)
      )
    ) {
      return null;
    }
    const executionPlan = run.executionPlan;
    const storedPlanHash = executionPlan.planHash;
    const approval = executionPlan.preflightApproval;
    const { planHash: _planHash, preflightApproval: _approval, ...plan } = executionPlan;
    if (
      typeof storedPlanHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(storedPlanHash) ||
      hashExecutionPlan(plan as ExecutionPlan) !== storedPlanHash ||
      !isRecord(approval) ||
      approval.runId !== runId ||
      approval.planHash !== storedPlanHash ||
      approval.acknowledgedDisclaimer !== true
    ) {
      return null;
    }
  }
  return sources;
}

function writeChecksums(projectDir: string): void {
  const lines = walkFiles(projectDir).map((file) => {
    const rel = relative(projectDir, file).split(sep).join("/");
    return `${sha256Bytes(readFileSync(file))}  ${rel}`;
  });
  atomicWrite(join(projectDir, "checksums.sha256"), `${lines.join("\n")}\n`);
}

function atomicWrite(path: string, data: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.tmp-${process.pid}-${Date.now()}`);
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

type AppendEntry = {
  relativePath: string;
  beforeSha256: string | null;
  after: string;
};

type AppendJournal = {
  schemaVersion: "0.0";
  kind: "append-pending";
  runId: string;
  entries: AppendEntry[];
};

function appendJournalPath(target: string, runId: string): string {
  return join(target, ".opinion-simulator-append-" + runId + ".json");
}

function isSafeAppendPath(relativePath: string): boolean {
  if (
    relativePath === "project.json" ||
    relativePath === "personas.json" ||
    relativePath === "methodology.md" ||
    relativePath === "sources/index.json"
  ) {
    return true;
  }
  const parts = relativePath.split("/");
  if (parts.length !== 2 || !isIdentifier(parts[1].replace(/\.(txt|json|md)$/, ""))) {
    return false;
  }
  return (
    (parts[0] === "sources" && parts[1].endsWith(".txt")) ||
    (parts[0] === "runs" && parts[1].endsWith(".json")) ||
    (parts[0] === "reports" && parts[1].endsWith(".md"))
  );
}

function currentFileHash(target: string, relativePath: string): string | null {
  const path = join(target, ...relativePath.split("/"));
  return existsSync(path) ? sha256Bytes(readFileSync(path)) : null;
}

function journalEntryIsSafe(entry: JsonObject): boolean {
  if (typeof entry.after !== "string") {
    return false;
  }
  if (!String(entry.relativePath).endsWith(".json")) {
    return true;
  }
  try {
    const document = JSON.parse(entry.after);
    if (String(entry.relativePath).startsWith("runs/")) {
      return (
        isRecord(document) &&
        Array.isArray(document.samples) &&
        document.samples.every(
          (sample) =>
            isRecord(sample) &&
            Object.prototype.hasOwnProperty.call(sample, "rawProviderResponse") &&
            isCredentialSafeObject(sample.rawProviderResponse)
        )
      );
    }
    return isCredentialSafeObject(document);
  } catch {
    return false;
  }
}

function isAppendJournal(value: unknown): value is AppendJournal {
  return (
    isRecord(value) &&
    value.schemaVersion === "0.0" &&
    value.kind === "append-pending" &&
    isIdentifier(value.runId) &&
    Array.isArray(value.entries) &&
    value.entries.length > 0 &&
    value.entries.every(
      (entry) =>
        isRecord(entry) &&
        isSafeAppendPath(String(entry.relativePath ?? "")) &&
        (entry.beforeSha256 === null ||
          (typeof entry.beforeSha256 === "string" && /^[a-f0-9]{64}$/.test(entry.beforeSha256))) &&
        journalEntryIsSafe(entry)
    ) &&
    new Set(value.entries.map((entry) => (entry as AppendEntry).relativePath)).size === value.entries.length
  );
}

function persistAppendJournal(target: string, journal: AppendJournal): void {
  const path = appendJournalPath(target, journal.runId);
  const encoded = canonicalJson(journal);
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== encoded) {
      throw new Error("Refusing to reuse incomplete append transaction for Run " + journal.runId + ".");
    }
    return;
  }
  atomicWrite(path, encoded);
}

function replayAppendJournal(target: string, journal: AppendJournal): void {
  for (const entry of journal.entries) {
    const current = currentFileHash(target, entry.relativePath);
    const desired = sha256Bytes(entry.after);
    if (current === desired) {
      continue;
    }
    if (current !== entry.beforeSha256) {
      throw new Error("Refusing to recover conflicting append artifact " + entry.relativePath + ".");
    }
    atomicWrite(join(target, ...entry.relativePath.split("/")), entry.after);
  }
  writeChecksums(target);
}

function recoverPendingAppend(target: string, runId: string): boolean {
  const path = appendJournalPath(target, runId);
  if (!existsSync(path)) {
    return false;
  }
  let journal: unknown;
  try {
    journal = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
  if (!isAppendJournal(journal) || journal.runId !== runId) {
    return false;
  }
  replayAppendJournal(target, journal);
  return Boolean(inspectProject(target)?.runIds.includes(runId));
}

function appendUnique(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value];
}

function appendById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((entry) => entry.id === item.id) ? list : [...list, item];
}

function refuseOccupied(target: string): never {
  throw new Error(
    `Refusing to write: ${target} exists and is not empty. Choose an empty directory or an existing valid Project; existing content is never deleted.`
  );
}

export function nextNumberedId(existing: string[], prefix: string): string {
  let max = 0;
  for (const id of existing) {
    const match = id.match(/(\d+)$/);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  let n = max + 1;
  let candidate = `${prefix}-${String(n).padStart(3, "0")}`;
  while (existing.includes(candidate)) {
    n += 1;
    candidate = `${prefix}-${String(n).padStart(3, "0")}`;
  }
  return candidate;
}

export function questionSetKey(questionSet: {
  title: string;
  questions: string[];
  responseInstructions: string;
}): string {
  return canonicalJson({
    title: questionSet.title,
    questions: questionSet.questions,
    responseInstructions: questionSet.responseInstructions
  });
}

export function findMatchingQuestionSet(
  existing: QuestionSet[],
  candidate: { title: string; questions: string[]; responseInstructions: string }
): QuestionSet | undefined {
  const key = questionSetKey(candidate);
  return existing.find((item) => questionSetKey(item) === key);
}

export function inspectProject(projectDirectory: string): ProjectInspection | null {
  const dir = resolve(projectDirectory);
  const projectPath = join(dir, "project.json");
  const personasPath = join(dir, "personas.json");
  const sourceIndexPath = join(dir, "sources", "index.json");
  if (!existsSync(projectPath) || !existsSync(personasPath) || !existsSync(sourceIndexPath)) {
    return null;
  }
  try {
    const project = JSON.parse(readFileSync(projectPath, "utf8"));
    const personasDoc = JSON.parse(readFileSync(personasPath, "utf8"));
    const sourceIndex = JSON.parse(readFileSync(sourceIndexPath, "utf8"));
    if (
      !isRecord(project) ||
      !isRecord(personasDoc) ||
      !isRecord(sourceIndex) ||
      (!checksumManifestIsComplete(dir) && !checksumManifestAllowsAuxiliaryRootFiles(dir))
    ) {
      return null;
    }
    const sources = projectDocumentsAreValid(dir, project, personasDoc, sourceIndex);
    if (!sources) {
      return null;
    }
    const validProject = project as unknown as {
      projectId: string;
      title: string;
      description: string;
      locale: "zh-TW" | "en";
      createdAt: string;
      updatedAt: string;
      sourceIds: string[];
      currentPersonaVersionIds: string[];
      questionSets: QuestionSet[];
      promptTemplateVersions: Array<{ id: string; version: number; contentHash: string }>;
      runIds: string[];
      reportIds: string[];
      executionBatches?: ExecutionBatchRecord[];
      compatibility: { writer: string; writerVersion: string; minimumReaderVersion: string };
    };
    const validPersonas = personasDoc.versions as PersonaVersion[];
    return {
      projectDirectory: dir,
      projectId: validProject.projectId,
      title: validProject.title,
      description: validProject.description,
      locale: validProject.locale,
      createdAt: validProject.createdAt,
      updatedAt: validProject.updatedAt,
      sourceIds: validProject.sourceIds,
      sources,
      personas: validPersonas,
      currentPersonaVersionIds: validProject.currentPersonaVersionIds,
      questionSets: validProject.questionSets,
      promptTemplateVersions: validProject.promptTemplateVersions,
      runIds: validProject.runIds,
      reportIds: validProject.reportIds,
      executionBatches: validProject.executionBatches ?? [],
      compatibility: validProject.compatibility
    };
  } catch {
    return null;
  }
}

export function classifyWriteTarget(projectDirectory: string): WriteTargetKind {
  const target = resolve(projectDirectory);
  if (!existsSync(target)) {
    return "absent";
  }
  if (!statSync(target).isDirectory()) {
    return "occupied";
  }
  if (canonicalEntries(target).length === 0) {
    return "empty";
  }
  return inspectProject(target) ? "project" : "occupied";
}

function sourceRecord(input: CompletedRunInput) {
  return {
    sourceId: input.sourceId,
    filename: "pasted-source.txt",
    mediaType: "text/plain",
    provenance: { kind: "pasted-text", recordedAt: input.createdAt },
    extraction: { method: "pasted-text", version: "0.0", lineEndings: "LF" },
    warnings: [] as string[],
    textSha256: input.plan.sourceRefs[0].sha256,
    originalCopied: false as const
  };
}

function buildRunDocument(input: CompletedRunInput) {
  if (input.samples.length !== input.plan.sampleCount) {
    throw new Error("Completed Samples do not match the approved Execution Plan.");
  }
  const stabilityComparison =
    input.samples.length >= 2
      ? compareStability(
          input.samples.map((sample) => ({
            sampleId: sample.sampleId,
            parsedResult: sample.result
          }))
        )
      : {
          mode: "not-applicable",
          reason: "One-Sample quick mode does not produce a Stability Comparison."
        };
  return {
    schemaVersion: "0.0",
    runId: input.runId,
    projectId: input.projectId,
    kind: "persona-simulation",
    status: "completed",
    createdAt: input.createdAt,
    startedAt: input.approval.approvedAt,
    completedAt: input.completedAt,
    skillVersion: "0.2.0",
    executionPlan: {
      ...input.plan,
      preflightApproval: input.approval,
      planHash: input.planHash
    },
    samples: input.samples.map((sample) =>
      ({
        sampleId: sample.sampleId,
        personaRef: input.plan.personaRefs[0],
        status: "completed",
        attemptEvents: [
          { attempt: 1, status: "completed", timestamp: input.completedAt, error: null }
        ],
        normalizedRequest: {
          runId: input.runId,
          sampleId: sample.sampleId,
          planHash: input.planHash,
          provider: sample.provider,
          model: sample.model
        },
        normalizedResponse: {
          provider: sample.provider,
          model: sample.model,
          responseFormat: "structured-json",
          validationState: sample.result.validationState
        },
        rawProviderResponse: sample.rawResponse,
        parsedResult: sample.result,
        validationWarnings: [],
        providerUsage: { reported: false, note: "v0.1 desktop tracer" },
        startedAt: input.approval.approvedAt,
        completedAt: sample.completedAt,
        latencyMs: 0
      })
    ),
    stabilityComparison,
    synthesisAttribution: null,
    report: {
      reportId: input.reportId,
      path: `reports/${input.reportId}.md`,
      generationMethod: "deterministic-v0.1-desktop",
      createdAt: input.completedAt,
      disclaimer: DISCLAIMER
    },
    integrity: {
      algorithm: "sha256",
      sourceHashes: { [input.sourceId]: input.plan.sourceRefs[0].sha256 },
      personaContentHashes: { [input.persona.id]: input.persona.contentHash },
      templateContentHash: input.plan.promptTemplate.contentHash,
      planHash: input.planHash
    }
  };
}

function executionBatchFromInput(input: CompletedRunInput): ExecutionBatchRecord {
  return {
    executionBatchId: input.executionBatchId as string,
    createdAt: input.completedAt,
    sourceId: input.sourceId,
    questionSetId: input.questionSet.id,
    provider: input.plan.provider,
    model: input.plan.model,
    runIds: [input.runId],
    reportIds: [input.reportId]
  };
}

function upsertExecutionBatches(
  existing: ExecutionBatchRecord[],
  input: CompletedRunInput
): ExecutionBatchRecord[] {
  if (!input.executionBatchId) {
    return existing;
  }
  const next = existing.map((batch) => ({ ...batch, runIds: [...batch.runIds], reportIds: [...batch.reportIds] }));
  const found = next.find((batch) => batch.executionBatchId === input.executionBatchId);
  if (found) {
    found.runIds = appendUnique(found.runIds, input.runId);
    found.reportIds = appendUnique(found.reportIds, input.reportId);
    return next;
  }
  return [...next, executionBatchFromInput(input)];
}

function buildProjectDocument(input: CompletedRunInput, existing: ProjectInspection | null) {
  const promptTemplate = input.plan.promptTemplate;
  if (!existing) {
    const fresh: Record<string, unknown> = {
      schemaVersion: "0.0",
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      locale: input.locale,
      createdAt: input.createdAt,
      updatedAt: input.completedAt,
      sourceIds: [input.sourceId],
      currentPersonaVersionIds: [input.persona.id],
      questionSets: [input.questionSet],
      promptTemplateVersions: [promptTemplate],
      runIds: [input.runId],
      reportIds: [input.reportId],
      compatibility: {
        writer: "opinion-simulator-desktop",
        writerVersion: "0.2.0",
        minimumReaderVersion: "0.0"
      }
    };
    if (input.executionBatchId) {
      fresh.executionBatches = [executionBatchFromInput(input)];
    }
    return fresh;
  }
  const templates = existing.promptTemplateVersions.some(
    (item) =>
      item.id === promptTemplate.id &&
      item.version === promptTemplate.version &&
      item.contentHash === promptTemplate.contentHash
  )
    ? existing.promptTemplateVersions
    : [...existing.promptTemplateVersions, promptTemplate];
  const next: Record<string, unknown> = {
    schemaVersion: "0.0",
    projectId: existing.projectId,
    title: input.title.trim() ? input.title : existing.title,
    description: existing.description,
    locale: existing.locale,
    createdAt: existing.createdAt,
    updatedAt: input.completedAt,
    sourceIds: appendUnique(existing.sourceIds, input.sourceId),
    currentPersonaVersionIds: appendUnique(existing.currentPersonaVersionIds, input.persona.id),
    questionSets: appendById(existing.questionSets, input.questionSet),
    promptTemplateVersions: templates,
    runIds: appendUnique(existing.runIds, input.runId),
    reportIds: appendUnique(existing.reportIds, input.reportId),
    compatibility: {
      writer: "opinion-simulator-desktop",
      writerVersion: "0.2.0",
      minimumReaderVersion: existing.compatibility.minimumReaderVersion || "0.0"
    }
  };
  const executionBatches = upsertExecutionBatches(existing.executionBatches ?? [], input);
  if (executionBatches.length > 0) {
    next.executionBatches = executionBatches;
  }
  return next;
}

function writeFreshProject(target: string, input: CompletedRunInput): void {
  const methodology = methodologyMarkdown();
  const methodHash = methodologyHash();
  const report = renderSimulationReport({
    title: input.title,
    personaLabel: input.persona.label,
    questionTitle: input.questionSet.title,
    questions: input.questionSet.questions,
    sourceText: input.sourceText,
    result: input.samples[0].result,
    runId: input.runId,
    methodologyHash: methodHash
  });
  const staging = join(tmpdir(), `.${input.projectId}-${Date.now()}`);
  mkdirSync(join(staging, "sources"), { recursive: true });
  mkdirSync(join(staging, "runs"), { recursive: true });
  mkdirSync(join(staging, "reports"), { recursive: true });
  atomicWrite(join(staging, "project.json"), canonicalJson(buildProjectDocument(input, null)));
  atomicWrite(
    join(staging, "personas.json"),
    canonicalJson({ schemaVersion: "0.0", drafts: [], versions: [input.persona] })
  );
  atomicWrite(
    join(staging, "sources", "index.json"),
    canonicalJson({ schemaVersion: "0.0", sources: [sourceRecord(input)] })
  );
  atomicWrite(join(staging, "sources", `${input.sourceId}.txt`), input.sourceText.replace(/\r\n/g, "\n"));
  atomicWrite(join(staging, "runs", `${input.runId}.json`), canonicalJson(buildRunDocument(input)));
  atomicWrite(join(staging, "reports", `${input.reportId}.md`), report);
  atomicWrite(join(staging, "methodology.md"), methodology);
  writeChecksums(staging);
  const journal: AppendJournal = {
    schemaVersion: "0.0",
    kind: "append-pending",
    runId: input.runId,
    entries: walkFiles(staging).map((file) => {
      const relativePath = relative(staging, file).split(sep).join("/");
      return { relativePath, beforeSha256: null, after: readFileSync(file, "utf8") };
    })
  };
  persistAppendJournal(target, journal);
  try {
    replayAppendJournal(target, journal);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function appendCompletedRun(target: string, existing: ProjectInspection, input: CompletedRunInput): void {
  const runPath = join(target, "runs", input.runId + ".json");
  const reportPath = join(target, "reports", input.reportId + ".md");
  if (existsSync(runPath) || existing.runIds.includes(input.runId)) {
    throw new Error("Refusing to overwrite existing Run " + input.runId + "; existing content is never deleted.");
  }
  if (existsSync(reportPath) || existing.reportIds.includes(input.reportId)) {
    throw new Error("Refusing to overwrite existing Report " + input.reportId + "; existing content is never deleted.");
  }
  const sourceText = input.sourceText.replace(/\r\n/g, "\n");
  const sourcePath = join(target, "sources", input.sourceId + ".txt");
  const knownSource = existing.sources.find((item) => item.sourceId === input.sourceId);
  if (knownSource) {
    if (knownSource.text !== sourceText) {
      throw new Error(
        "Refusing to overwrite existing Source " + input.sourceId + "; existing content is never deleted."
      );
    }
  } else {
    if (existsSync(sourcePath)) {
      throw new Error(
        "Refusing to overwrite existing Source " + input.sourceId + "; existing content is never deleted."
      );
    }
  }
  const methodHash = methodologyHash();
  const report = renderSimulationReport({
    title: input.title.trim() ? input.title : existing.title,
    personaLabel: input.persona.label,
    questionTitle: input.questionSet.title,
    questions: input.questionSet.questions,
    sourceText,
    result: input.samples[0].result,
    runId: input.runId,
    methodologyHash: methodHash
  });
  const storedInput = {
    ...input,
    projectId: existing.projectId,
    locale: existing.locale,
    createdAt: existing.createdAt
  };
  const personasPath = join(target, "personas.json");
  const personasDoc = JSON.parse(readFileSync(personasPath, "utf8")) as {
    drafts: unknown[];
    versions: PersonaVersion[];
  };
  const versions = [...personasDoc.versions];
  if (!versions.some((item) => item.id === input.persona.id)) {
    versions.push(input.persona);
  }
  const sourceIndexPath = join(target, "sources", "index.json");
  const sourceIndex = JSON.parse(readFileSync(sourceIndexPath, "utf8")) as {
    sources: unknown[];
  };
  const sourceEntries = [...sourceIndex.sources];
  if (!sourceEntries.some((entry) => isRecord(entry) && entry.sourceId === input.sourceId)) {
    sourceEntries.push(sourceRecord(storedInput));
  }
  const methodologyPath = join(target, "methodology.md");
  const methodology = existsSync(methodologyPath)
    ? readFileSync(methodologyPath, "utf8")
    : methodologyMarkdown();
  const journal: AppendJournal = {
    schemaVersion: "0.0",
    kind: "append-pending",
    runId: input.runId,
    entries: [
      {
        relativePath: "sources/" + input.sourceId + ".txt",
        beforeSha256: currentFileHash(target, "sources/" + input.sourceId + ".txt"),
        after: sourceText
      },
      {
        relativePath: "runs/" + input.runId + ".json",
        beforeSha256: null,
        after: canonicalJson(buildRunDocument(storedInput))
      },
      {
        relativePath: "reports/" + input.reportId + ".md",
        beforeSha256: null,
        after: report
      },
      {
        relativePath: "methodology.md",
        beforeSha256: currentFileHash(target, "methodology.md"),
        after: methodology
      },
      {
        relativePath: "personas.json",
        beforeSha256: currentFileHash(target, "personas.json"),
        after: canonicalJson({ schemaVersion: "0.0", drafts: personasDoc.drafts, versions })
      },
      {
        relativePath: "sources/index.json",
        beforeSha256: currentFileHash(target, "sources/index.json"),
        after: canonicalJson({ schemaVersion: "0.0", sources: sourceEntries })
      },
      {
        relativePath: "project.json",
        beforeSha256: currentFileHash(target, "project.json"),
        after: canonicalJson(buildProjectDocument(storedInput, existing))
      }
    ]
  };
  persistAppendJournal(target, journal);
  replayAppendJournal(target, journal);
}

export function writeCompletedRun(input: CompletedRunInput): void {
  if (input.samples.length === 0 || input.samples.some((sample) => !isCredentialSafeObject(sample.rawResponse))) {
    throw new Error("Refusing to persist a raw provider response with credential-shaped fields.");
  }
  const target = resolve(input.projectDirectory);
  const kind = classifyWriteTarget(target);
  if (kind === "occupied") {
    if (recoverPendingAppend(target, input.runId)) {
      return;
    }
    refuseOccupied(target);
  }
  if (kind === "project") {
    const existing = inspectProject(target);
    if (!existing) {
      refuseOccupied(target);
    }
    appendCompletedRun(target, existing, {
      ...input,
      projectId: existing.projectId,
      locale: existing.locale,
      createdAt: existing.createdAt
    });
    return;
  }
  writeFreshProject(target, input);
}

export function readSnapshot(projectDirectory: string): ProjectSnapshot {
  if (!inspectProject(projectDirectory)) {
    throw new Error("Project 完整性驗證失敗，拒絕讀取可能遭竄改或不完整的資料夾。");
  }
  const project = JSON.parse(readFileSync(join(projectDirectory, "project.json"), "utf8"));
  const personas = JSON.parse(readFileSync(join(projectDirectory, "personas.json"), "utf8"));
  const versions = (personas.versions ?? []) as PersonaVersion[];
  const sourceId =
    (Array.isArray(project.sourceIds) ? project.sourceIds[project.sourceIds.length - 1] : "") ?? "";
  const sourceText = sourceId
    ? readFileSync(join(projectDirectory, "sources", `${sourceId}.txt`), "utf8")
    : "";
  const currentPersonaId =
    (Array.isArray(project.currentPersonaVersionIds)
      ? project.currentPersonaVersionIds[project.currentPersonaVersionIds.length - 1]
      : undefined) ?? versions[versions.length - 1]?.id;
  const persona =
    (currentPersonaId ? versions.find((item) => item.id === currentPersonaId) : null) ??
    versions[versions.length - 1] ??
    null;
  const questionSet =
    (Array.isArray(project.questionSets) ? project.questionSets[project.questionSets.length - 1] : null) ?? {
      title: "",
      questions: []
    };
  const runIds: string[] = Array.isArray(project.runIds) ? project.runIds : [];
  const runId = runIds[runIds.length - 1] ?? null;
  let result: StructuredResult | null = null;
  let rawResponse: unknown = null;
  let provider: string | null = null;
  let model: string | null = null;
  let reportMarkdown: string | null = null;
  if (runId) {
    const run = JSON.parse(readFileSync(join(projectDirectory, "runs", `${runId}.json`), "utf8"));
    result = run.samples[0]?.parsedResult ?? null;
    rawResponse = run.samples[0]?.rawProviderResponse ?? null;
    provider = run.samples[0]?.normalizedRequest?.provider ?? run.executionPlan?.provider ?? null;
    model = run.samples[0]?.normalizedRequest?.model ?? run.executionPlan?.model ?? null;
  }
  const reportId =
    (Array.isArray(project.reportIds) ? project.reportIds[project.reportIds.length - 1] : undefined) ??
    undefined;
  if (reportId) {
    reportMarkdown = readFileSync(join(projectDirectory, "reports", `${reportId}.md`), "utf8");
  }
  const runs: SnapshotRun[] = [];
  for (const rId of runIds) {
    try {
      const run = JSON.parse(readFileSync(join(projectDirectory, "runs", `${rId}.json`), "utf8"));
      const pRef = run.executionPlan?.personaRefs?.[0];
      const matchedPersona = versions.find((v) => v.id === pRef?.personaVersionId);
      const parsed = (run.samples[0]?.parsedResult ?? null) as StructuredResult | null;
      const reportRef = typeof run.report?.reportId === "string" ? run.report.reportId : undefined;
      const runReport =
        reportRef && existsSync(join(projectDirectory, "reports", `${reportRef}.md`))
          ? readFileSync(join(projectDirectory, "reports", `${reportRef}.md`), "utf8")
          : null;
      runs.push({
        runId: rId,
        reportId: reportRef,
        personaId: pRef?.personaId,
        personaVersionId: pRef?.personaVersionId,
        personaLabel: matchedPersona?.label ?? pRef?.personaId ?? rId,
        result: parsed,
        answers: Array.isArray(parsed?.answers) ? parsed.answers : [],
        rawResponse: run.samples[0]?.rawProviderResponse ?? null,
        stabilityComparison: run.stabilityComparison ?? null,
        provider: run.samples[0]?.normalizedRequest?.provider ?? run.executionPlan?.provider ?? null,
        model: run.samples[0]?.normalizedRequest?.model ?? run.executionPlan?.model ?? null,
        reportMarkdown: runReport,
        samples: Array.isArray(run.samples)
          ? run.samples.map((sample: { sampleId?: string; parsedResult?: StructuredResult | null }) => ({
              sampleId: String(sample.sampleId ?? ""),
              result: sample.parsedResult ?? null
            }))
          : []
      });
    } catch {
      // Skip unreadable Run files; inspectProject already required them to parse.
    }
  }

  const batchRecords = Array.isArray(project.executionBatches)
    ? (project.executionBatches as ExecutionBatchRecord[])
    : [];
  const batchedRunIds = new Set(batchRecords.flatMap((batch) => batch.runIds));
  const executionBatches: ExecutionBatchView[] = batchRecords.map((batch) => {
    const batchRuns: SnapshotRun[] = [];
    for (const id of batch.runIds) {
      const match = runs.find((run) => run.runId === id);
      if (match) {
        batchRuns.push(match);
      }
    }
    const matchedQuestionSet =
      (Array.isArray(project.questionSets)
        ? project.questionSets.find((item: QuestionSet) => item.id === batch.questionSetId)
        : null) ?? questionSet;
    const batchSource = sourceId === batch.sourceId ? sourceText : sourceText;
    const sourceFromBatch =
      batch.sourceId && existsSync(join(projectDirectory, "sources", `${batch.sourceId}.txt`))
        ? readFileSync(join(projectDirectory, "sources", `${batch.sourceId}.txt`), "utf8")
        : batchSource;
    return {
      executionBatchId: batch.executionBatchId,
      createdAt: batch.createdAt,
      sourceId: batch.sourceId,
      sourceText: sourceFromBatch,
      questions: matchedQuestionSet.questions ?? [],
      questionTitle: matchedQuestionSet.title ?? "",
      provider: batch.provider,
      model: batch.model,
      runIds: batch.runIds,
      reportIds: batch.reportIds,
      runs: batchRuns
    };
  });
  const unbatchedRuns = runs.filter((run) => !batchedRunIds.has(run.runId));

  return {
    projectDirectory,
    projectId: project.projectId,
    title: project.title,
    sourceText,
    sourceId,
    persona,
    questions: questionSet.questions ?? [],
    questionTitle: questionSet.title ?? "",
    runId,
    runIds,
    reportMarkdown,
    result,
    rawResponse,
    provider,
    model,
    runs,
    executionBatches,
    unbatchedRuns
  };
}
