import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import {
  DISCLAIMER,
  canonicalJson,
  methodologyHash,
  methodologyMarkdown,
  renderSimulationReport,
  sha256Bytes,
  type ExecutionPlan,
  type PersonaVersion,
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
  reportMarkdown: string | null;
  result: StructuredResult | null;
  rawResponse: unknown;
};

function isCanonical(relativePath: string): boolean {
  return !relativePath.split(sep).some((part) => part.startsWith("."));
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

function writeChecksums(projectDir: string): void {
  const lines = walkFiles(projectDir).map((file) => {
    const rel = relative(projectDir, file).split(sep).join("/");
    return `${sha256Bytes(readFileSync(file))}  ${rel}`;
  });
  writeFileSync(join(projectDir, "checksums.sha256"), `${lines.join("\n")}\n`);
}

function atomicWrite(path: string, data: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

export function createProjectDirectory(output: string, input: {
  projectId: string;
  title: string;
  description: string;
  locale: "zh-TW" | "en";
  createdAt: string;
}): void {
  mkdirSync(output, { recursive: true });
  const project = {
    schemaVersion: "0.0",
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    locale: input.locale,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    sourceIds: [] as string[],
    currentPersonaVersionIds: [] as string[],
    questionSets: [] as unknown[],
    promptTemplateVersions: [] as unknown[],
    runIds: [] as string[],
    reportIds: [] as string[],
    compatibility: {
      writer: "opinion-simulator-desktop",
      writerVersion: "0.1.0",
      minimumReaderVersion: "0.0"
    }
  };
  atomicWrite(join(output, "project.json"), canonicalJson(project));
  atomicWrite(join(output, "personas.json"), canonicalJson({ schemaVersion: "0.0", drafts: [], versions: [] }));
  mkdirSync(join(output, "sources"), { recursive: true });
  atomicWrite(
    join(output, "sources", "index.json"),
    canonicalJson({ schemaVersion: "0.0", sources: [] })
  );
  mkdirSync(join(output, "runs"), { recursive: true });
  mkdirSync(join(output, "reports"), { recursive: true });
  writeChecksums(output);
}

export function writeCompletedRun(input: {
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
  questionSet: { id: string; title: string; questions: string[]; responseInstructions: string };
  plan: ExecutionPlan;
  planHash: string;
  runId: string;
  reportId: string;
  sampleId: string;
  result: StructuredResult;
  rawResponse: unknown;
  provider: string;
  model: string;
  approval: {
    schemaVersion: "0.0";
    runId: string;
    planHash: string;
    approvedAt: string;
    acknowledgedDisclaimer: true;
    realPersonReconfirmed: boolean;
  };
}): void {
  const methodology = methodologyMarkdown();
  const methodHash = methodologyHash();
  const report = renderSimulationReport({
    title: input.title,
    personaLabel: input.persona.label,
    questionTitle: input.questionSet.title,
    questions: input.questionSet.questions,
    sourceText: input.sourceText,
    result: input.result,
    runId: input.runId,
    methodologyHash: methodHash
  });
  const run = {
    schemaVersion: "0.0",
    runId: input.runId,
    projectId: input.projectId,
    kind: "persona-simulation",
    status: "completed",
    createdAt: input.createdAt,
    startedAt: input.approval.approvedAt,
    completedAt: input.completedAt,
    skillVersion: "0.1.0",
    executionPlan: {
      ...input.plan,
      preflightApproval: input.approval,
      planHash: input.planHash
    },
    samples: [
      {
        sampleId: input.sampleId,
        personaRef: input.plan.personaRefs[0],
        status: "completed",
        attemptEvents: [
          { attempt: 1, status: "completed", timestamp: input.completedAt, error: null }
        ],
        normalizedRequest: {
          runId: input.runId,
          sampleId: input.sampleId,
          planHash: input.planHash,
          provider: input.provider,
          model: input.model
        },
        normalizedResponse: {
          provider: input.provider,
          model: input.model,
          responseFormat: "structured-json",
          validationState: input.result.validationState
        },
        rawProviderResponse: input.rawResponse,
        parsedResult: input.result,
        validationWarnings: [],
        providerUsage: { reported: false, note: "v0.1 desktop tracer" },
        startedAt: input.approval.approvedAt,
        completedAt: input.completedAt,
        latencyMs: 0
      }
    ],
    stabilityComparison: {
      mode: "not-applicable",
      reason: "One-Sample quick mode does not produce a Stability Comparison."
    },
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
  const project = {
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
    promptTemplateVersions: [input.plan.promptTemplate],
    runIds: [input.runId],
    reportIds: [input.reportId],
    compatibility: {
      writer: "opinion-simulator-desktop",
      writerVersion: "0.1.0",
      minimumReaderVersion: "0.0"
    }
  };
  const staging = join(tmpdir(), `.${input.projectId}-${Date.now()}`);
  mkdirSync(join(staging, "sources"), { recursive: true });
  mkdirSync(join(staging, "runs"), { recursive: true });
  mkdirSync(join(staging, "reports"), { recursive: true });
  atomicWrite(join(staging, "project.json"), canonicalJson(project));
  atomicWrite(
    join(staging, "personas.json"),
    canonicalJson({ schemaVersion: "0.0", drafts: [], versions: [input.persona] })
  );
  atomicWrite(
    join(staging, "sources", "index.json"),
    canonicalJson({
      schemaVersion: "0.0",
      sources: [
        {
          sourceId: input.sourceId,
          filename: "pasted-source.txt",
          mediaType: "text/plain",
          provenance: { kind: "pasted-text", recordedAt: input.createdAt },
          extraction: { method: "pasted-text", version: "0.0", lineEndings: "LF" },
          warnings: [],
          textSha256: input.plan.sourceRefs[0].sha256,
          originalCopied: false
        }
      ]
    })
  );
  atomicWrite(join(staging, "sources", `${input.sourceId}.txt`), input.sourceText.replace(/\r\n/g, "\n"));
  atomicWrite(join(staging, "runs", `${input.runId}.json`), canonicalJson(run));
  atomicWrite(join(staging, "reports", `${input.reportId}.md`), report);
  atomicWrite(join(staging, "methodology.md"), methodology);
  writeChecksums(staging);
  // Safety guard (added after the 2026-08-24 accidental mass deletion):
  // the target must be absent or an EMPTY directory. This tool never deletes
  // existing content; a non-empty target is a user mistake and must fail.
  const target = resolve(input.projectDirectory);
  if (existsSync(target)) {
    const remaining = readdirSync(target);
    if (remaining.length > 0) {
      rmSync(staging, { recursive: true, force: true });
      throw new Error(
        `Refusing to write: ${target} exists and is not empty. Choose an empty directory; existing content is never deleted.`
      );
    }
    rmdirSync(target);
  }
  mkdirSync(dirname(target), { recursive: true });
  renameSync(staging, target);
}

export function readSnapshot(projectDirectory: string): ProjectSnapshot {
  const project = JSON.parse(readFileSync(join(projectDirectory, "project.json"), "utf8"));
  const personas = JSON.parse(readFileSync(join(projectDirectory, "personas.json"), "utf8"));
  const sourceIndex = JSON.parse(readFileSync(join(projectDirectory, "sources", "index.json"), "utf8"));
  const sourceId = project.sourceIds[0] ?? "";
  const sourceText = sourceId
    ? readFileSync(join(projectDirectory, "sources", `${sourceId}.txt`), "utf8")
    : "";
  const persona = (personas.versions[0] ?? null) as PersonaVersion | null;
  const questionSet = project.questionSets[0] ?? { title: "", questions: [] };
  const runId = project.runIds[0] ?? null;
  let result: StructuredResult | null = null;
  let rawResponse: unknown = null;
  let reportMarkdown: string | null = null;
  if (runId) {
    const run = JSON.parse(readFileSync(join(projectDirectory, "runs", `${runId}.json`), "utf8"));
    result = run.samples[0]?.parsedResult ?? null;
    rawResponse = run.samples[0]?.rawProviderResponse ?? null;
  }
  const reportId = project.reportIds[0];
  if (reportId) {
    reportMarkdown = readFileSync(join(projectDirectory, "reports", `${reportId}.md`), "utf8");
  }
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
    reportMarkdown,
    result,
    rawResponse
  };
}
