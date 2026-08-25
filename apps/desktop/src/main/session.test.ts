import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { confirmDraftPersona, createDraft, runMocked, saveDraft } from "./session";

function prepareDraft(projectDirectory: string): void {
  createDraft(projectDirectory, "桌面模擬");
  saveDraft({
    projectDirectory,
    sourceText: "第一階段先在三個行政區試辦，並公開每月支出。",
    personaRaw: "我是政策分析師，在意預算透明。",
    personaLabel: "政策分析師",
    questions: ["你會支持這項計畫嗎？", "推動時最大的阻力是什麼？"]
  });
  confirmDraftPersona(projectDirectory);
}

describe("mocked desktop run", () => {
  it("writes an open Project without embedding credential-shaped fields", async () => {
    const projectDirectory = mkdtempSync(join(tmpdir(), "opinion-desktop-"));
    prepareDraft(projectDirectory);
    const snapshot = await runMocked(projectDirectory, true);
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
    await expect(runMocked(projectDirectory, true)).rejects.toThrow("尚未確認 Persona Version");
  });
});
