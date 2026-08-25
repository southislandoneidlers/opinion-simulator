import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
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
import { writeCompletedRun } from "./store";

describe("writeCompletedRun", () => {
  it("writes a Project that the v0.0 validator accepts", () => {
    const output = mkdtempSync(join(tmpdir(), "opinion-simulator-store-"));
    const createdAt = "2026-08-24T07:00:00Z";
    const sourceText = "第一階段先在三個行政區試辦，並公開每月支出與接種人次。";
    const sourceId = "source-desktop-001";
    const persona = confirmManualPersona({
      id: "persona-version-desktop-analyst-v1",
      personaId: "persona-desktop-analyst",
      label: "政策分析師",
      rawInput: "我是政策分析師，在意預算透明。",
      fields: { roleAndContext: "我是政策分析師", concerns: "在意預算透明" },
      confirmedAt: createdAt,
      confirmedBy: "test",
      realPersonApplies: false
    });
    const questionSet = {
      id: "questions-desktop-001",
      title: "試辦評估",
      questions: ["你會支持這項計畫嗎？"],
      responseInstructions: ""
    };
    const runId = slugId("run", "desktop");
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
      question: questionSet.questions[0]
    });
    writeCompletedRun({
      projectDirectory: output,
      projectId: "project-desktop-001",
      title: "桌面模擬測試",
      description: "v0.1 mocked fixture",
      locale: "zh-TW",
      createdAt,
      completedAt: "2026-08-24T07:01:00Z",
      sourceId,
      sourceText,
      persona,
      questionSet,
      plan,
      planHash: planHash(plan),
      runId,
      reportId: "report-desktop-001",
      sampleId: plan.sampleIds[0],
      result,
      rawResponse,
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
    const python = execFileSync(
      "python3",
      [
        "-B",
        ".agents/skills/opinion-simulator/scripts/opinion_simulator.py",
        "validate-project",
        output
      ],
      { encoding: "utf8", cwd: join(__dirname, "..", "..", "..") }
    );
    expect(JSON.parse(python).status).toBe("valid");
    expect(python).not.toMatch(/apiKey|GEMINI_API_KEY/i);
  });
});

describe("writeCompletedRun safety guard", () => {
  it("refuses to write into a non-empty directory and leaves it untouched", () => {
    const parent = mkdtempSync(join(tmpdir(), "opinion-simulator-guard-"));
    const target = join(parent, "project");
    mkdirSync(target);
    writeFileSync(join(target, "sentinel.txt"), "keep", "utf8");
    const createdAt = "2026-08-24T07:00:00Z";
    const persona = confirmManualPersona({
      id: "persona-version-guard-v1",
      personaId: "persona-guard",
      label: "政策分析師",
      rawInput: "我是政策分析師。",
      fields: { roleAndContext: "我是政策分析師" },
      confirmedAt: createdAt,
      confirmedBy: "test",
      realPersonApplies: false
    });
    const questionSet = {
      id: "questions-guard-001",
      title: "評估",
      questions: ["你會支持嗎？"],
      responseInstructions: ""
    };
    const plan = makeExecutionPlan({
      sourceId: "source-guard-001",
      sourceText: "材料內容。",
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
      runId: "run-guard-001"
    });
    const { result, rawResponse } = mockGeminiResult({
      sourceId: "source-guard-001",
      sourceText: "材料內容。",
      questions: questionSet.questions
    });
    expect(() =>
      writeCompletedRun({
        projectDirectory: target,
        projectId: "project-guard-001",
        title: "防護測試",
        description: "guard fixture",
        locale: "zh-TW",
        createdAt,
        completedAt: "2026-08-24T07:01:00Z",
        sourceId: "source-guard-001",
        sourceText: "材料內容。",
        persona,
        questionSet,
        plan,
        planHash: planHash(plan),
        runId: "run-guard-001",
        reportId: "report-guard-001",
        sampleId: plan.sampleIds[0],
        result,
        rawResponse,
        provider: "gemini",
        model: "gemini-2.0-flash",
        approval: {
          schemaVersion: "0.0",
          runId: "run-guard-001",
          planHash: planHash(plan),
          approvedAt: createdAt,
          acknowledgedDisclaimer: true,
          realPersonReconfirmed: false
        }
      })
    ).toThrow(/not empty/);
    expect(readdirSync(target)).toEqual(["sentinel.txt"]);
  });
});
