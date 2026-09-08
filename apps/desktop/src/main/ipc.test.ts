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
    await dispatchDesktopIpc(handlers, "preflight.setDisclaimer", {
      projectDirectory: projectDir,
      acknowledged: true
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
      mode: "mocked",
      submissionId: "sub-workbook-import-001"
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

type EnqueueBatchResponse = {
  ok: boolean;
  submissionId: string;
  submissionStatus: string;
  duplicate: boolean;
  queuedCount: number;
  jobs: Array<{ jobId: string; runId: string; status: string }>;
  snapshot: { runIds: string[] } | null;
  error: string | null;
};

async function confirmImportedBatch(
  handlers: ReturnType<typeof createIpcHandlers>,
  projectDir: string,
  workbookPath: string
): Promise<{ batchPlanHash: string; disclaimerAcknowledged: boolean }> {
  await dispatchDesktopIpc(handlers, "project.create", {
    projectDirectory: projectDir,
    title: "Submission Dedup"
  });
  await dispatchDesktopIpc(handlers, "workbook.importDraft", {
    projectDirectory: projectDir,
    path: workbookPath
  });
  await dispatchDesktopIpc(handlers, "project.confirmPersona", {
    projectDirectory: projectDir
  });
  await dispatchDesktopIpc(handlers, "preflight.setDisclaimer", {
    projectDirectory: projectDir,
    acknowledged: true
  });
  const preflight = (await dispatchDesktopIpc(handlers, "preflight.render", {
    projectDirectory: projectDir
  })) as { batchPlanHash: string; disclaimerAcknowledged?: boolean };
  return {
    batchPlanHash: preflight.batchPlanHash,
    disclaimerAcknowledged: Boolean(preflight.disclaimerAcknowledged)
  };
}

describe("submission identity over IPC", () => {
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
    tempRoot = mkdtempSync(join(tmpdir(), "opinion-ipc-sub-"));
    handlers = createIpcHandlers({
      chooseDirectory: async () => "/tmp",
      chooseWorkbook: async () => goldenPath,
      chooseMaterialFile: async () => null
    });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("creates only one batch when the same submissionId is sent in parallel", async () => {
    const projectDir = join(tempRoot, "dedup-project");
    mkdirSync(projectDir);
    const preflight = await confirmImportedBatch(handlers, projectDir, goldenPath);
    const payload = {
      projectDirectory: projectDir,
      batchPlanHash: preflight.batchPlanHash,
      acknowledgedDisclaimer: true,
      mode: "mocked",
      submissionId: "sub-parallel-001"
    };

    const [first, second] = (await Promise.all([
      dispatchDesktopIpc(handlers, "queue.enqueueBatch", payload),
      dispatchDesktopIpc(handlers, "queue.enqueueBatch", payload)
    ])) as [EnqueueBatchResponse, EnqueueBatchResponse];

    const listed = (await dispatchDesktopIpc(handlers, "queue.list", {
      projectDirectory: projectDir
    })) as { jobs: Array<{ jobId: string; runId: string }> };

    expect(listed.jobs).toHaveLength(2);
    expect(new Set(listed.jobs.map((job) => job.runId)).size).toBe(2);
    expect(new Set(first.jobs.map((job) => job.jobId))).toEqual(
      new Set(second.jobs.map((job) => job.jobId))
    );
    expect(first.submissionId).toBe("sub-parallel-001");
    expect(second.submissionId).toBe("sub-parallel-001");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(first.submissionStatus).toBe("completed");
  });

  it("rejects enqueueBatch without a submissionId", async () => {
    const projectDir = join(tempRoot, "missing-id");
    mkdirSync(projectDir);
    const preflight = await confirmImportedBatch(handlers, projectDir, goldenPath);
    await expect(
      dispatchDesktopIpc(handlers, "queue.enqueueBatch", {
        projectDirectory: projectDir,
        batchPlanHash: preflight.batchPlanHash,
        acknowledgedDisclaimer: true,
        mode: "mocked"
      })
    ).rejects.toThrow(/送出識別/);
    const listed = (await dispatchDesktopIpc(handlers, "queue.list", {
      projectDirectory: projectDir
    })) as { jobs: unknown[] };
    expect(listed.jobs).toEqual([]);
  });

  it("replays the same accepted batch and does not create jobs for an unknown status query", async () => {
    const projectDir = join(tempRoot, "status-project");
    mkdirSync(projectDir);
    const preflight = await confirmImportedBatch(handlers, projectDir, goldenPath);
    const payload = {
      projectDirectory: projectDir,
      batchPlanHash: preflight.batchPlanHash,
      acknowledgedDisclaimer: true,
      mode: "mocked",
      submissionId: "sub-status-001"
    };
    const first = (await dispatchDesktopIpc(
      handlers,
      "queue.enqueueBatch",
      payload
    )) as EnqueueBatchResponse;
    const replay = (await dispatchDesktopIpc(
      handlers,
      "queue.enqueueBatch",
      payload
    )) as EnqueueBatchResponse;
    expect(replay.duplicate).toBe(true);
    expect(new Set(replay.jobs.map((job) => job.jobId))).toEqual(
      new Set(first.jobs.map((job) => job.jobId))
    );

    const status = (await dispatchDesktopIpc(handlers, "queue.submissionStatus", {
      submissionId: "sub-status-001",
      projectDirectory: projectDir
    })) as { found: boolean; submissionStatus: string; jobs: Array<{ jobId: string }> };
    expect(status.found).toBe(true);
    expect(status.submissionStatus).toBe("completed");
    expect(status.jobs).toHaveLength(2);

    const missing = (await dispatchDesktopIpc(handlers, "queue.submissionStatus", {
      submissionId: "sub-status-missing",
      projectDirectory: projectDir
    })) as { found: boolean; jobs: unknown[] };
    expect(missing.found).toBe(false);
    expect(missing.jobs).toEqual([]);

    const listed = (await dispatchDesktopIpc(handlers, "queue.list", {
      projectDirectory: projectDir
    })) as { jobs: unknown[] };
    expect(listed.jobs).toHaveLength(2);
  });

  it("replays a failed accept without creating jobs", async () => {
    const projectDir = join(tempRoot, "fail-project");
    mkdirSync(projectDir);
    await confirmImportedBatch(handlers, projectDir, goldenPath);
    const payload = {
      projectDirectory: projectDir,
      batchPlanHash: "0".repeat(64),
      acknowledgedDisclaimer: true,
      mode: "mocked",
      submissionId: "sub-fail-001"
    };
    await expect(dispatchDesktopIpc(handlers, "queue.enqueueBatch", payload)).rejects.toThrow(
      /批次執行計畫已變更/
    );
    await expect(dispatchDesktopIpc(handlers, "queue.enqueueBatch", payload)).rejects.toThrow(
      /批次執行計畫已變更/
    );
    const status = (await dispatchDesktopIpc(handlers, "queue.submissionStatus", {
      submissionId: "sub-fail-001",
      projectDirectory: projectDir
    })) as { found: boolean; submissionStatus: string; jobs: unknown[] };
    expect(status.found).toBe(true);
    expect(status.submissionStatus).toBe("submit_failed");
    expect(status.jobs).toEqual([]);
  });

  it("lets a new submissionId after a new Preflight create a second batch", async () => {
    const projectDir = join(tempRoot, "second-submit");
    mkdirSync(projectDir);
    const firstPreflight = await confirmImportedBatch(handlers, projectDir, goldenPath);
    await dispatchDesktopIpc(handlers, "queue.enqueueBatch", {
      projectDirectory: projectDir,
      batchPlanHash: firstPreflight.batchPlanHash,
      acknowledgedDisclaimer: true,
      mode: "mocked",
      submissionId: "sub-first-001"
    });
    const secondPreflight = (await dispatchDesktopIpc(handlers, "preflight.render", {
      projectDirectory: projectDir
    })) as { batchPlanHash: string };
    expect(secondPreflight.batchPlanHash).not.toBe(firstPreflight.batchPlanHash);
    const second = (await dispatchDesktopIpc(handlers, "queue.enqueueBatch", {
      projectDirectory: projectDir,
      batchPlanHash: secondPreflight.batchPlanHash,
      acknowledgedDisclaimer: true,
      mode: "mocked",
      submissionId: "sub-second-001"
    })) as EnqueueBatchResponse;
    expect(second.ok).toBe(true);
    expect(second.duplicate).toBe(false);
    const listed = (await dispatchDesktopIpc(handlers, "queue.list", {
      projectDirectory: projectDir
    })) as { jobs: unknown[] };
    expect(listed.jobs).toHaveLength(4);
  });
});

describe("session disclaimer over IPC", () => {
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
    tempRoot = mkdtempSync(join(tmpdir(), "opinion-ipc-disc-"));
    handlers = createIpcHandlers({
      chooseDirectory: async () => "/tmp",
      chooseWorkbook: async () => goldenPath,
      chooseMaterialFile: async () => null
    });
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("keeps the disclaimer after rendering Preflight and resets it when switching Project", async () => {
    const firstDir = join(tempRoot, "project-a");
    const secondDir = join(tempRoot, "project-b");
    mkdirSync(firstDir);
    mkdirSync(secondDir);
    const firstView = await confirmImportedBatch(handlers, firstDir, goldenPath);
    expect(firstView.disclaimerAcknowledged).toBe(true);
    const renderedAgain = (await dispatchDesktopIpc(handlers, "preflight.render", {
      projectDirectory: firstDir
    })) as { disclaimerAcknowledged: boolean };
    expect(renderedAgain.disclaimerAcknowledged).toBe(true);

    const second = (await dispatchDesktopIpc(handlers, "project.create", {
      projectDirectory: secondDir,
      title: "B"
    })) as { disclaimerAcknowledged: boolean };
    expect(second.disclaimerAcknowledged).toBe(false);

    const firstAgain = (await dispatchDesktopIpc(handlers, "preflight.render", {
      projectDirectory: firstDir
    })) as { disclaimerAcknowledged: boolean };
    expect(firstAgain.disclaimerAcknowledged).toBe(false);
  });
});
