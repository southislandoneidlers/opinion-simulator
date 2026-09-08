import {
  closeSync,
  copyFileSync,
  ftruncateSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateWorkbook } from "@opinion-simulator/core";
import { createIpcHandlers, dispatchDesktopIpc } from "./ipc-handlers";
import { configureLibraryDirectory } from "./persona-library";
import { configureQueueDirectory } from "./run-queue";
import { configureLastProjectDirectory } from "./last-project";
import {
  fingerprintKey,
  markProviderVerified,
  resetProviderVerification,
  setCredentialStoreForTests
} from "./credentials";

const FAKE_KEY = "FAKE-KEY-FOR-TESTS-do-not-use-real-keys";

describe("renderer secret-access over IPC", () => {
  const previousEnv: Record<string, string | undefined> = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  };
  let handlers: ReturnType<typeof createIpcHandlers>;

  beforeEach(() => {
    configureLibraryDirectory(mkdtempSync(join(tmpdir(), "opinion-ipc-lib-")));
    configureQueueDirectory(mkdtempSync(join(tmpdir(), "opinion-ipc-queue-")));
    configureLastProjectDirectory(mkdtempSync(join(tmpdir(), "opinion-ipc-last-")));
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    resetProviderVerification();
    setCredentialStoreForTests({
      getPassword: async () => null,
      setPassword: async () => undefined,
      deletePassword: async () => false
    });
    handlers = createIpcHandlers({
      chooseDirectory: async () => "/tmp",
      chooseWorkbook: async () => null,
      chooseMaterialFile: async () => null
    });
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("rejects unknown channels and credential-shaped payload keys", async () => {
    await expect(dispatchDesktopIpc(handlers, "credential.load", {})).rejects.toThrow(
      /Unknown IPC channel/
    );
    await expect(
      dispatchDesktopIpc(handlers, "credential.set", { provider: "gemini", apiKey: FAKE_KEY })
    ).rejects.toThrow(/apiKey/);
    await expect(
      dispatchDesktopIpc(handlers, "credential.set", { provider: "gemini", value: FAKE_KEY, token: "x" })
    ).rejects.toThrow(/token/);
  });

  it("never returns key material from credential.status even when an env fallback exists", async () => {
    process.env.GEMINI_API_KEY = FAKE_KEY;
    const status = await dispatchDesktopIpc(handlers, "credential.status", {});
    expect(status).toEqual({
      providers: {
        gemini: {
          available: true,
          source: "env",
          fingerprint: fingerprintKey(FAKE_KEY),
          verifiedByUse: false
        },
        openai: { available: false, source: null, fingerprint: null, verifiedByUse: false }
      },
      disclaimer: expect.any(String)
    });
    expect(JSON.stringify(status)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(status)).not.toMatch(/apiKey|GEMINI_API_KEY/i);
  });

  it("returns a storage fingerprint after credential.set and never the key", async () => {
    const stored = new Map<string, string>();
    setCredentialStoreForTests({
      getPassword: async (_service, account) => stored.get(account) ?? null,
      setPassword: async (_service, account, value) => {
        stored.set(account, value);
      },
      deletePassword: async (_service, account) => stored.delete(account)
    });
    const result = await dispatchDesktopIpc(handlers, "credential.set", {
      provider: "gemini",
      value: FAKE_KEY
    });
    expect(result).toMatchObject({
      providers: {
        gemini: { available: true, source: "keychain", fingerprint: fingerprintKey(FAKE_KEY) }
      }
    });
    expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
  });

  it("publishes verifiedByUse after a successful provider use without exposing the key", async () => {
    process.env.GEMINI_API_KEY = FAKE_KEY;
    markProviderVerified("gemini", FAKE_KEY);

    const status = (await dispatchDesktopIpc(handlers, "credential.status", {})) as {
      providers: { gemini: { verifiedByUse: boolean } };
    };

    expect(status.providers.gemini.verifiedByUse).toBe(true);
    expect(JSON.stringify(status)).not.toContain(FAKE_KEY);
  });

  it("does not expose a channel that loads the raw key", async () => {
    await expect(dispatchDesktopIpc(handlers, "credential.get", {})).rejects.toThrow(
      /Unknown IPC channel/
    );
    await expect(dispatchDesktopIpc(handlers, "loadProviderApiKey", {})).rejects.toThrow(
      /Unknown IPC channel/
    );
  });
});

describe("workbook IPC", () => {
  const goldenPath = join(
    __dirname,
    "../../../../packages/core/fixtures/workbook/Opinion-Simulator-v0.3-Workbook-簡易模板.xlsx"
  );
  let handlers: ReturnType<typeof createIpcHandlers>;
  let tempRoot: string;

  beforeEach(() => {
    configureLibraryDirectory(mkdtempSync(join(tmpdir(), "opinion-ipc-lib-")));
    configureQueueDirectory(mkdtempSync(join(tmpdir(), "opinion-ipc-queue-")));
    configureLastProjectDirectory(mkdtempSync(join(tmpdir(), "opinion-ipc-last-")));
    tempRoot = mkdtempSync(join(tmpdir(), "opinion-ipc-workbook-"));
    handlers = createIpcHandlers({
      chooseDirectory: async () => "/tmp",
      chooseWorkbook: async () => goldenPath,
      chooseMaterialFile: async () => null
    });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("maps the golden Workbook through workbook.validate without altering core output", async () => {
    const core = validateWorkbook({
      bytes: new Uint8Array(readFileSync(goldenPath)),
      fileName: "Opinion-Simulator-v0.3-Workbook-簡易模板.xlsx"
    });
    const result = await dispatchDesktopIpc(handlers, "workbook.validate", { path: goldenPath });
    expect(result).toEqual({ path: goldenPath, ...core });
    expect(core.ok).toBe(true);
    if (core.ok) {
      expect(core.warnings).toEqual([]);
      expect(core.workbook.personas).toHaveLength(2);
      expect(core.workbook.batches[0].sampleCount).toBe(1);
    }
    expect(JSON.stringify(result)).not.toMatch(/planHash/);
  });

  it("lets desktop.chooseWorkbook return a path or cancel as null", async () => {
    await expect(dispatchDesktopIpc(handlers, "desktop.chooseWorkbook", {})).resolves.toBe(goldenPath);
    const canceled = createIpcHandlers({
      chooseDirectory: async () => "/tmp",
      chooseWorkbook: async () => null,
      chooseMaterialFile: async () => null
    });
    await expect(dispatchDesktopIpc(canceled, "desktop.chooseWorkbook", {})).resolves.toBeNull();
  });

  it("rejects renderer-supplied bytes and missing paths", async () => {
    await expect(
      dispatchDesktopIpc(handlers, "workbook.validate", { path: goldenPath, bytes: "nope" })
    ).rejects.toThrow(/主程序讀取/);
    await expect(dispatchDesktopIpc(handlers, "workbook.validate", {})).rejects.toThrow(
      /請選擇 Workbook 檔案/
    );
    await expect(dispatchDesktopIpc(handlers, "workbook.validate", { path: "   " })).rejects.toThrow(
      /請選擇 Workbook 檔案/
    );
    await expect(
      dispatchDesktopIpc(handlers, "workbook.validate", { path: join(tempRoot, "missing.xlsx") })
    ).rejects.toThrow(/找不到或無法讀取/);
    await expect(dispatchDesktopIpc(handlers, "workbook.validate", { path: tempRoot })).rejects.toThrow(
      /必須是檔案/
    );
  });

  it("returns stable Issues for empty, wrong-extension, and oversized files", async () => {
    const emptyPath = join(tempRoot, "empty.xlsx");
    writeFileSync(emptyPath, "");
    const empty = (await dispatchDesktopIpc(handlers, "workbook.validate", { path: emptyPath })) as {
      ok: false;
      errors: Array<{ code: string }>;
    };
    expect(empty.ok).toBe(false);
    expect(empty.errors[0].code).toBe("FILE_EMPTY");

    const txtPath = join(tempRoot, "notes.txt");
    writeFileSync(txtPath, "not a workbook");
    const txt = (await dispatchDesktopIpc(handlers, "workbook.validate", { path: txtPath })) as {
      ok: false;
      errors: Array<{ code: string }>;
    };
    expect(txt.ok).toBe(false);
    expect(txt.errors[0].code).toBe("FILE_EXTENSION_INVALID");

    const largePath = join(tempRoot, "large.xlsx");
    const fd = openSync(largePath, "w");
    ftruncateSync(fd, 8 * 1024 * 1024 + 1);
    closeSync(fd);
    const large = (await dispatchDesktopIpc(handlers, "workbook.validate", { path: largePath })) as {
      ok: false;
      errors: Array<{ code: string }>;
    };
    expect(large.ok).toBe(false);
    expect(large.errors[0].code).toBe("FILE_TOO_LARGE");
  });

  it("does not write a Project or mutate the Workbook file", async () => {
    const projectDir = join(tempRoot, "project");
    const workbookCopy = join(tempRoot, "book.xlsx");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "marker.txt"), "must remain unchanged\n");
    copyFileSync(goldenPath, workbookCopy);
    const beforeBytes = readFileSync(workbookCopy);
    const beforeProject = readdirSync(projectDir);

    const result = await dispatchDesktopIpc(handlers, "workbook.validate", { path: workbookCopy });
    expect(result).toMatchObject({ ok: true, path: workbookCopy });
    expect(readdirSync(projectDir)).toEqual(beforeProject);
    expect(readFileSync(join(projectDir, "marker.txt"), "utf8")).toBe("must remain unchanged\n");
    expect(readFileSync(workbookCopy)).toEqual(beforeBytes);
    expect(readdirSync(tempRoot).sort()).toEqual(["book.xlsx", "project"]);
  });

  it("remembers last opened project and supports startup inspection", async () => {
    const initial = (await dispatchDesktopIpc(handlers, "project.getLastProject", {})) as {
      status: string;
      remembered: unknown;
    };
    expect(initial.status).toBe("none");

    const projectDir = join(tempRoot, "my-project");
    mkdirSync(projectDir);
    await dispatchDesktopIpc(handlers, "project.create", {
      projectDirectory: projectDir,
      title: "My New Project"
    });

    const afterCreate = (await dispatchDesktopIpc(handlers, "project.getLastProject", {})) as {
      status: string;
      remembered: { projectDirectory: string };
    };
    expect(afterCreate.status).toBe("valid");
    expect(afterCreate.remembered.projectDirectory).toBe(projectDir);
  });

  it("imports a validated Workbook into a project draft", async () => {
    const projectDir = join(tempRoot, "import-project");
    mkdirSync(projectDir);
    await dispatchDesktopIpc(handlers, "project.create", {
      projectDirectory: projectDir,
      title: "Import Target"
    });

    const importResult = (await dispatchDesktopIpc(handlers, "workbook.importDraft", {
      projectDirectory: projectDir,
      path: goldenPath
    })) as {
      ok: boolean;
      batchId: string;
      personaCount: number;
      questionCount: number;
      sampleCount: number;
      sourceText: string;
      questions: string[];
      personaRaw: string;
      personas: Array<{ personaId: string }>;
    };

    expect(importResult.ok).toBe(true);
    expect(importResult.batchId).toBe("batch-001");
    expect(importResult.personaCount).toBe(2);
    expect(importResult.sampleCount).toBe(1);
    expect(importResult.sourceText.length).toBeGreaterThan(0);
    expect(importResult.questions.length).toBeGreaterThan(0);
    expect(importResult.personaRaw.length).toBeGreaterThan(0);
    expect(importResult.personas.map((persona) => persona.personaId)).toEqual([
      "persona-001",
      "persona-002"
    ]);

    const libraryBeforeConfirmation = (await dispatchDesktopIpc(
      handlers,
      "persona.library.list",
      {}
    )) as { personas: unknown[] };
    expect(libraryBeforeConfirmation.personas).toEqual([]);

    await expect(
      dispatchDesktopIpc(handlers, "preflight.render", { projectDirectory: projectDir })
    ).rejects.toThrow(/確認.*Persona/);

    await dispatchDesktopIpc(handlers, "project.confirmPersona", {
      projectDirectory: projectDir
    });

    const reopened = (await dispatchDesktopIpc(handlers, "project.create", {
      projectDirectory: projectDir,
      title: "Should not wipe import"
    })) as { sourceText: string; personaRaw: string };
    expect(reopened.sourceText).toBe(importResult.sourceText);
    expect(reopened.personaRaw).toBe(importResult.personaRaw);

    const preflight = (await dispatchDesktopIpc(handlers, "preflight.render", {
      projectDirectory: projectDir
    })) as {
      isBatch: boolean;
      batchPlanHash: string;
      personas: Array<{ personaId: string }>;
      matrix: { personaCount: number; totalRequests: number };
    };
    expect(preflight.isBatch).toBe(true);
    expect(preflight.batchPlanHash).toBeTruthy();
    expect(preflight.personas.length).toBe(2);
    expect(preflight.matrix.totalRequests).toBe(2);

    const enqueueRes = (await dispatchDesktopIpc(handlers, "queue.enqueueBatch", {
      projectDirectory: projectDir,
      batchPlanHash: preflight.batchPlanHash,
      acknowledgedDisclaimer: true,
      mode: "mocked"
    })) as {
      ok: boolean;
      queuedCount: number;
      jobs: Array<{ status: string }>;
      snapshot: { runIds: string[] } | null;
    };
    expect(enqueueRes.ok).toBe(true);
    expect(enqueueRes.queuedCount).toBe(2);
    expect(enqueueRes.jobs.every((job) => job.status === "completed")).toBe(true);
    expect(enqueueRes.snapshot?.runIds).toHaveLength(2);
  });

  it("extracts material file over IPC", async () => {
    const txtPath = join(tempRoot, "extracted.md");
    writeFileSync(txtPath, "# 政策草案材料\n\n具體內容說明", "utf8");

    const result = (await dispatchDesktopIpc(handlers, "material.extractFile", {
      path: txtPath
    })) as {
      format: string;
      text: string;
      fileName: string;
    };
    expect(result.format).toBe("md");
    expect(result.text).toContain("政策草案材料");
    expect(result.fileName).toBe("extracted.md");
  });

  it("rejects a compressed PDF stream that expands beyond the material limit", async () => {
    const pdfPath = join(tempRoot, "compressed-bomb.pdf");
    const compressed = deflateSync(Buffer.alloc(8 * 1024 * 1024 + 1, 65));
    writeFileSync(
      pdfPath,
      Buffer.concat([
        Buffer.from("%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n", "binary"),
        compressed,
        Buffer.from("\nendstream\nendobj\n%%EOF", "binary")
      ])
    );

    await expect(
      dispatchDesktopIpc(handlers, "material.extractFile", { path: pdfPath })
    ).rejects.toThrow(/解壓縮.*上限/);
  });
});
