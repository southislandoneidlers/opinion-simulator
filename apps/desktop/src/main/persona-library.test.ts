import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmManualPersona } from "@opinion-simulator/core";
import {
  addPersona,
  autoSavePersona,
  configureLibraryDirectory,
  listPersonas,
  loadPersonaLibrary,
  removePersona,
  setAutoSave
} from "./persona-library";

function makePersona(label = "政策分析師", slug = "analyst"): ReturnType<typeof confirmManualPersona> {
  return confirmManualPersona({
    id: `persona-version-${slug}-v1`,
    personaId: `persona-${slug}`,
    label,
    rawInput: `${label}，在意預算透明。`,
    fields: { roleAndContext: `${label}，在意預算透明。` },
    confirmedAt: "2026-08-24T07:00:00Z",
    confirmedBy: "desktop-user",
    realPersonApplies: false
  });
}

describe("persona library (app-data)", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "opinion-persona-lib-"));
    configureLibraryDirectory(directory);
  });

  afterEach(() => {
    configureLibraryDirectory(mkdtempSync(join(tmpdir(), "opinion-persona-lib-reset-")));
  });

  it("starts empty and auto-saves a confirmed version, then deduplicates by contentHash", () => {
    const persona = makePersona();
    expect(listPersonas().personas).toHaveLength(0);
    expect(autoSavePersona(persona, { projectId: "project-a", projectDirectory: "/tmp/a" }).saved).toBe(true);
    expect(autoSavePersona(persona, { projectId: "project-b", projectDirectory: "/tmp/b" }).saved).toBe(false);
    const listed = listPersonas();
    expect(listed.personas).toHaveLength(1);
    expect(listed.personas[0]?.personaVersion.contentHash).toBe(persona.contentHash);
    expect(listed.personas[0]?.origin?.projectId).toBe("project-a");
  });

  it("honours the auto-save toggle", () => {
    setAutoSave(false);
    const persona = makePersona("校長", "principal");
    expect(autoSavePersona(persona, { projectId: "p", projectDirectory: null }).saved).toBe(false);
    expect(listPersonas().personas).toHaveLength(0);
    setAutoSave(true);
    expect(autoSavePersona(persona, { projectId: "p", projectDirectory: null }).saved).toBe(true);
    expect(listPersonas().personas).toHaveLength(1);
  });

  it("removes an entry by personaVersionId and is a no-op for unknown ids", () => {
    const persona = makePersona("里長", "warden");
    addPersona(persona, null);
    expect(removePersona(persona.id).removed).toBe(true);
    expect(listPersonas().personas).toHaveLength(0);
    expect(removePersona(persona.id).removed).toBe(false);
  });

  it("refuses a corrupt library file instead of rewriting it", () => {
    writeFileSync(join(directory, "persona-library.json"), "{not-json", "utf8");
    expect(() => loadPersonaLibrary()).toThrow(/無法解析/);
    mkdirSync(join(directory, "nested"), { recursive: true });
    configureLibraryDirectory(join(directory, "nested"));
    writeFileSync(join(directory, "nested", "persona-library.json"), JSON.stringify({ schemaVersion: "9.9" }), "utf8");
    expect(() => loadPersonaLibrary()).toThrow(/格式不符/);
  });
});
