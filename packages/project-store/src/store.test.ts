import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  confirmManualPersona,
  makeExecutionPlan,
  planHash,
  slugId
} from "@opinion-simulator/core";
import { mockGeminiResult } from "../../providers-gemini/src/mock";
import {
  classifyWriteTarget,
  inspectProject,
  nextNumberedId,
  readSnapshot,
  writeCompletedRun
} from "./store";

const REPO_ROOT = join(__dirname, "..", "..", "..");

function makePersona(createdAt: string) {
  return confirmManualPersona({
    id: "persona-version-desktop-analyst-v1",
    personaId: "persona-desktop-analyst",
    label: "政策分析師",
    rawInput: "我是政策分析師，在意預算透明。",
    fields: { roleAndContext: "我是政策分析師，在意預算透明。" },
    confirmedAt: createdAt,
    confirmedBy: "test",
    realPersonApplies: false
  });
}

function writeRun(output: string, overrides: {
  projectId?: string;
  title?: string;
  sourceId?: string;
  sourceText?: string;
  persona?: ReturnType<typeof confirmManualPersona>;
  questionSet?: { id: string; title: string; questions: string[]; responseInstructions: string };
  runId?: string;
  reportId?: string;
  createdAt?: string;
  completedAt?: string;
  rawResponse?: unknown;
}) {
  const createdAt = overrides.createdAt ?? "2026-08-24T07:00:00Z";
  const sourceText = overrides.sourceText ?? "第一階段先在三個行政區試辦，並公開每月支出與接種人次。";
  const sourceId = overrides.sourceId ?? "source-desktop-001";
  const persona = overrides.persona ?? makePersona(createdAt);
  const questionSet = overrides.questionSet ?? {
    id: "questions-desktop-001",
    title: "試辦評估",
    questions: ["你會支持這項計畫嗎？"],
    responseInstructions: ""
  };
  const runId = overrides.runId ?? slugId("run", "desktop");
  const plan = makeExecutionPlan({
    sourceId,
    sourceText,
    persona,
    questionSet,
    settings: {
      provider: "gemini",
      model: "gemini-2.0-flash",
      endpointClass: "google-generativelanguage",
      sampleCount: 1,
      temperature: null,
      maxOutputTokens: null,
      seed: null
    },
    runId
  });
  const { result, rawResponse } = mockGeminiResult({
    sourceId,
    sourceText,
    questions: questionSet.questions,
    // src/mock.js (stale CJS sibling) still reads `question`; mock.ts reads `questions`.
    question: questionSet.questions[0]
  } as { sourceId: string; sourceText: string; questions: string[] });
  writeCompletedRun({
    projectDirectory: output,
    projectId: overrides.projectId ?? "project-desktop-001",
    title: overrides.title ?? "桌面模擬測試",
    description: "v0.1 mocked fixture",
    locale: "zh-TW",
    createdAt,
    completedAt: overrides.completedAt ?? "2026-08-24T07:01:00Z",
    sourceId,
    sourceText,
    persona,
    questionSet,
    plan,
    planHash: planHash(plan),
    runId,
    reportId: overrides.reportId ?? "report-desktop-001",
    sampleId: plan.sampleIds[0],
    result,
    rawResponse: overrides.rawResponse ?? rawResponse,
    provider: "gemini",
    model: "gemini-2.0-flash",
    approval: {
      schemaVersion: "0.0",
      runId,
      planHash: planHash(plan),
      approvedAt: "2026-08-24T07:00:30Z",
      acknowledgedDisclaimer: true,
      realPersonReconfirmed: false
    }
  });
}

function validateProject(output: string) {
  const python = execFileSync(
    "python3",
    ["-B", ".agents/skills/opinion-simulator/scripts/opinion_simulator.py", "validate-project", output],
    { encoding: "utf8", cwd: REPO_ROOT }
  );
  return JSON.parse(python) as { status: string; runsChecked: number };
}

describe("writeCompletedRun", () => {
  it("writes a Project that the v0.0 validator accepts", () => {
    const output = mkdtempSync(join(tmpdir(), "opinion-simulator-store-"));
    writeRun(output, { runId: "run-desktop-001", reportId: "report-desktop-001" });
    const evidence = validateProject(output);
    expect(evidence.status).toBe("valid");
    expect(JSON.stringify(readSnapshot(output))).not.toMatch(/apiKey|GEMINI_API_KEY/i);
  });

  it("finishes a new Project publication after an interruption that left only its hidden journal", () => {
    const parent = mkdtempSync(join(tmpdir(), "opinion-simulator-fresh-recovery-"));
    const completed = join(parent, "completed");
    const interrupted = join(parent, "interrupted");
    writeRun(completed, {
      runId: "project-desktop-001-run-001",
      reportId: "project-desktop-001-report-001"
    });
    const journalName = readdirSync(completed).find((name) =>
      name.startsWith(".opinion-simulator-append-project-desktop-001-run-001")
    );
    expect(journalName).toBeTruthy();
    mkdirSync(interrupted);
    writeFileSync(join(interrupted, journalName!), readFileSync(join(completed, journalName!)));
    writeRun(interrupted, {
      runId: "project-desktop-001-run-001",
      reportId: "project-desktop-001-report-001"
    });
    expect(validateProject(interrupted).status).toBe("valid");
  });
});

describe("writeCompletedRun safety guard", () => {
  it("refuses to write into a non-empty non-project directory and leaves it untouched", () => {
    const parent = mkdtempSync(join(tmpdir(), "opinion-simulator-guard-"));
    const target = join(parent, "project");
    mkdirSync(target);
    writeFileSync(join(target, "sentinel.txt"), "keep", "utf8");
    expect(classifyWriteTarget(target)).toBe("occupied");
    expect(() =>
      writeRun(target, { runId: "run-guard-001", reportId: "report-guard-001" })
    ).toThrow(/not empty/);
    expect(readdirSync(target)).toEqual(["sentinel.txt"]);
  });

  it("refuses a Project whose tracked Source was altered, even when the folder shape still looks valid", () => {
    const output = mkdtempSync(join(tmpdir(), "opinion-simulator-tampered-"));
    writeRun(output, {
      runId: "project-desktop-001-run-001",
      reportId: "project-desktop-001-report-001"
    });
    writeFileSync(join(output, "sources", "source-desktop-001.txt"), "被竄改的材料", "utf8");
    expect(inspectProject(output)).toBeNull();
    expect(classifyWriteTarget(output)).toBe("occupied");
    expect(() => readSnapshot(output)).toThrow(/完整性驗證失敗/);
    expect(() =>
      writeRun(output, {
        runId: "project-desktop-001-run-002",
        reportId: "project-desktop-001-report-002"
      })
    ).toThrow(/not empty/);
  });

  it("refuses raw provider payloads with credential-shaped fields before any Project is written", () => {
    const output = mkdtempSync(join(tmpdir(), "opinion-simulator-secret-shape-"));
    expect(() =>
      writeRun(output, {
        runId: "project-desktop-001-run-001",
        reportId: "project-desktop-001-report-001",
        rawResponse: { apiKey: "synthetic-prohibited-value" }
      })
    ).toThrow(/credential-shaped/);
    expect(readdirSync(output)).toEqual([]);
  });
});

describe("writeCompletedRun append", () => {
  it("appends a second Run into a valid Project without deleting the first", () => {
    const output = mkdtempSync(join(tmpdir(), "opinion-simulator-append-"));
    writeRun(output, {
      runId: "project-desktop-001-run-001",
      reportId: "project-desktop-001-report-001"
    });
    const firstRun = readFileSync(join(output, "runs", "project-desktop-001-run-001.json"));
    const firstReport = readFileSync(join(output, "reports", "project-desktop-001-report-001.md"));
    const methodology = readFileSync(join(output, "methodology.md"));
    writeRun(output, {
      runId: "project-desktop-001-run-002",
      reportId: "project-desktop-001-report-002",
      completedAt: "2026-08-24T07:05:00Z"
    });
    expect(readFileSync(join(output, "runs", "project-desktop-001-run-001.json"))).toEqual(firstRun);
    expect(readFileSync(join(output, "reports", "project-desktop-001-report-001.md"))).toEqual(firstReport);
    expect(readFileSync(join(output, "methodology.md"))).toEqual(methodology);
    const inspected = inspectProject(output);
    expect(inspected?.runIds).toEqual([
      "project-desktop-001-run-001",
      "project-desktop-001-run-002"
    ]);
    expect(inspected?.questionSets).toHaveLength(1);
    expect(inspected?.sourceIds).toEqual(["source-desktop-001"]);
    const snapshot = readSnapshot(output);
    expect(snapshot.runId).toBe("project-desktop-001-run-002");
    expect(snapshot.runIds).toHaveLength(2);
    const evidence = validateProject(output);
    expect(evidence.status).toBe("valid");
    expect(evidence.runsChecked).toBe(2);
  });

  it("appends a new question set when questions change and keeps the old set", () => {
    const output = mkdtempSync(join(tmpdir(), "opinion-simulator-qset-"));
    writeRun(output, {
      runId: "project-desktop-001-run-001",
      reportId: "project-desktop-001-report-001",
      questionSet: {
        id: "project-desktop-001-questions-001",
        title: "使用者問題",
        questions: ["你會支持這項計畫嗎？"],
        responseInstructions: ""
      }
    });
    writeRun(output, {
      runId: "project-desktop-001-run-002",
      reportId: "project-desktop-001-report-002",
      questionSet: {
        id: "project-desktop-001-questions-002",
        title: "使用者問題",
        questions: ["最大的阻力是什麼？"],
        responseInstructions: ""
      }
    });
    const inspected = inspectProject(output);
    expect(inspected?.questionSets.map((item) => item.id)).toEqual([
      "project-desktop-001-questions-001",
      "project-desktop-001-questions-002"
    ]);
    expect(inspected?.questionSets[0]?.questions).toEqual(["你會支持這項計畫嗎？"]);
    const evidence = validateProject(output);
    expect(evidence.status).toBe("valid");
    expect(evidence.runsChecked).toBe(2);
  });

  it("appends a new Source when the pasted text changes and leaves the old file", () => {
    const output = mkdtempSync(join(tmpdir(), "opinion-simulator-source-"));
    const original = "第一階段先在三個行政區試辦，並公開每月支出與接種人次。";
    writeRun(output, {
      sourceId: "source-desktop-001",
      sourceText: original,
      runId: "project-desktop-001-run-001",
      reportId: "project-desktop-001-report-001"
    });
    writeRun(output, {
      sourceId: "source-desktop-002",
      sourceText: "改寫後的材料：改為全國同步，並公布週報。",
      runId: "project-desktop-001-run-002",
      reportId: "project-desktop-001-report-002"
    });
    expect(readFileSync(join(output, "sources", "source-desktop-001.txt"), "utf8")).toBe(original);
    expect(readFileSync(join(output, "sources", "source-desktop-002.txt"), "utf8")).toContain("全國同步");
    const inspected = inspectProject(output);
    expect(inspected?.sourceIds).toEqual(["source-desktop-001", "source-desktop-002"]);
    expect(validateProject(output).status).toBe("valid");
  });

  it("refuses to overwrite an existing Run id", () => {
    const output = mkdtempSync(join(tmpdir(), "opinion-simulator-overwrite-"));
    writeRun(output, {
      runId: "project-desktop-001-run-001",
      reportId: "project-desktop-001-report-001"
    });
    const firstRun = readFileSync(join(output, "runs", "project-desktop-001-run-001.json"));
    expect(() =>
      writeRun(output, {
        runId: "project-desktop-001-run-001",
        reportId: "project-desktop-001-report-002"
      })
    ).toThrow(/overwrite existing Run/);
    expect(readFileSync(join(output, "runs", "project-desktop-001-run-001.json"))).toEqual(firstRun);
  });

  it("writes a new Project beside ignored dotfiles without deleting them", () => {
    const output = mkdtempSync(join(tmpdir(), "opinion-simulator-dot-"));
    writeFileSync(join(output, ".DS_Store"), "finder", "utf8");
    writeRun(output, {
      runId: "project-desktop-001-run-001",
      reportId: "project-desktop-001-report-001"
    });
    expect(readFileSync(join(output, ".DS_Store"), "utf8")).toBe("finder");
    expect(validateProject(output).status).toBe("valid");
  });

  it("keeps an extra user file in the Project directory after append", () => {
    const output = mkdtempSync(join(tmpdir(), "opinion-simulator-notes-"));
    writeRun(output, {
      runId: "project-desktop-001-run-001",
      reportId: "project-desktop-001-report-001"
    });
    writeFileSync(join(output, "notes.txt"), "keep me", "utf8");
    writeRun(output, {
      runId: "project-desktop-001-run-002",
      reportId: "project-desktop-001-report-002"
    });
    expect(readFileSync(join(output, "notes.txt"), "utf8")).toBe("keep me");
    expect(validateProject(output).status).toBe("valid");
  });

  it("recovers an interrupted append from its hidden transaction journal without replacing the provider result", () => {
    const output = mkdtempSync(join(tmpdir(), "opinion-simulator-append-recovery-"));
    writeRun(output, {
      runId: "project-desktop-001-run-001",
      reportId: "project-desktop-001-report-001"
    });
    const originalProject = readFileSync(join(output, "project.json"));
    const originalChecksums = readFileSync(join(output, "checksums.sha256"));
    writeRun(output, {
      runId: "project-desktop-001-run-002",
      reportId: "project-desktop-001-report-002"
    });
    // Simulate a process stopping after the immutable Run/Report artifacts
    // were written but before project.json and checksums were published.
    writeFileSync(join(output, "project.json"), originalProject);
    writeFileSync(join(output, "checksums.sha256"), originalChecksums);
    expect(inspectProject(output)).toBeNull();
    writeRun(output, {
      runId: "project-desktop-001-run-002",
      reportId: "project-desktop-001-report-002"
    });
    expect(inspectProject(output)?.runIds).toEqual([
      "project-desktop-001-run-001",
      "project-desktop-001-run-002"
    ]);
    expect(validateProject(output).status).toBe("valid");
  });
});

describe("nextNumberedId", () => {
  it("increments from the highest trailing number", () => {
    expect(nextNumberedId([], "project-a-run")).toBe("project-a-run-001");
    expect(nextNumberedId(["project-a-run-001"], "project-a-run")).toBe("project-a-run-002");
    expect(nextNumberedId(["run-golden-quick-001"], "project-golden-quick-001-run")).toBe(
      "project-golden-quick-001-run-002"
    );
  });
});
