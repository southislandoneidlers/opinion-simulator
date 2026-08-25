import { describe, expect, it } from "vitest";
import { confirmManualPersona } from "./persona";

describe("confirmManualPersona", () => {
  it("keeps unsupported fields not provided", () => {
    const persona = confirmManualPersona({
      id: "persona-version-analyst-v1",
      personaId: "persona-analyst",
      label: "政策分析師",
      rawInput: "我是政策分析師，在意預算透明。",
      fields: {
        roleAndContext: "我是政策分析師",
        concerns: "在意預算透明"
      },
      confirmedAt: "2026-08-24T07:00:00Z",
      confirmedBy: "desktop-user",
      realPersonApplies: false
    });
    expect(persona.status).toBe("confirmed");
    expect(persona.notProvidedFields).toContain("notes");
    expect(persona.inferences).toEqual([]);
    expect(persona.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a field that is not in rawInput", () => {
    expect(() =>
      confirmManualPersona({
        id: "persona-version-analyst-v1",
        personaId: "persona-analyst",
        label: "政策分析師",
        rawInput: "我是政策分析師。",
        fields: { roleAndContext: "縣市教育局長" },
        confirmedAt: "2026-08-24T07:00:00Z",
        confirmedBy: "desktop-user",
        realPersonApplies: false
      })
    ).toThrow(/rawInput/);
  });
});
