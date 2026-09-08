import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { classifyWriteTarget, inspectProject } from "@opinion-simulator/project-store";

/**
 * v0.3 increment 1: Last-Project and Workbook path memory.
 *
 * Saves the last successfully opened valid Project directory and Workbook path
 * in Electron userData app-data. On startup, the App inspects the remembered
 * path: if missing, moved, or invalid, it returns a safe, recoverable notice
 * without creating, deleting, or overwriting anything.
 */

export const LAST_PROJECT_SCHEMA_VERSION = "0.3";
export const LAST_PROJECT_FILENAME = "last-project.json";

export type LastProjectMemory = {
  schemaVersion: "0.3";
  projectDirectory: string | null;
  workbookPath: string | null;
  updatedAt: string;
};

let storeDirectory: string | null = null;

export function configureLastProjectDirectory(directory: string): void {
  storeDirectory = directory;
}

function defaultStoreDirectory(): string {
  return join(homedir(), ".config", "opinion-simulator");
}

function storePath(): string {
  return join(storeDirectory ?? defaultStoreDirectory(), LAST_PROJECT_FILENAME);
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function getLastProjectMemory(): LastProjectMemory | null {
  const file = storePath();
  if (!existsSync(file)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<LastProjectMemory>;
    if (parsed.schemaVersion !== LAST_PROJECT_SCHEMA_VERSION) {
      return null;
    }
    return {
      schemaVersion: LAST_PROJECT_SCHEMA_VERSION,
      projectDirectory: typeof parsed.projectDirectory === "string" ? parsed.projectDirectory : null,
      workbookPath: typeof parsed.workbookPath === "string" ? parsed.workbookPath : null,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso()
    };
  } catch {
    return null;
  }
}

export function saveLastProjectMemory(update: {
  projectDirectory?: string | null;
  workbookPath?: string | null;
}): LastProjectMemory {
  const current = getLastProjectMemory();
  const dir = storeDirectory ?? defaultStoreDirectory();
  mkdirSync(dir, { recursive: true });

  const next: LastProjectMemory = {
    schemaVersion: LAST_PROJECT_SCHEMA_VERSION,
    projectDirectory:
      update.projectDirectory !== undefined
        ? update.projectDirectory
        : (current?.projectDirectory ?? null),
    workbookPath:
      update.workbookPath !== undefined
        ? update.workbookPath
        : (current?.workbookPath ?? null),
    updatedAt: nowIso()
  };

  const file = storePath();
  const tmp = `${file}.tmp.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, file);
  return next;
}

export function clearLastProjectMemory(): void {
  const file = storePath();
  if (existsSync(file)) {
    const dir = storeDirectory ?? defaultStoreDirectory();
    mkdirSync(dir, { recursive: true });
    const empty: LastProjectMemory = {
      schemaVersion: LAST_PROJECT_SCHEMA_VERSION,
      projectDirectory: null,
      workbookPath: null,
      updatedAt: nowIso()
    };
    const tmp = `${file}.tmp.${Date.now()}`;
    writeFileSync(tmp, JSON.stringify(empty, null, 2), "utf8");
    renameSync(tmp, file);
  }
}

export type InspectLastProjectResult = {
  status: "valid" | "missing" | "invalid" | "none";
  remembered: LastProjectMemory | null;
  message?: string;
};

export function inspectLastProjectMemory(): InspectLastProjectResult {
  const memory = getLastProjectMemory();
  if (!memory || !memory.projectDirectory) {
    return { status: "none", remembered: memory };
  }

  const dir = memory.projectDirectory;
  if (!existsSync(dir)) {
    return {
      status: "missing",
      remembered: memory,
      message: `【專案復原】上次開啟的專案目錄已不存在或被移動：${dir}。請重新選擇專案資料夾。`
    };
  }

  try {
    const kind = classifyWriteTarget(dir);
    if (kind === "empty") {
      return {
        status: "valid",
        remembered: memory
      };
    }
    if (kind !== "project") {
      return {
        status: "invalid",
        remembered: memory,
        message: `【專案復原】上次開啟的目錄不是有效的專案資料夾：${dir}。現有檔案未被更動，請重新選擇專案。`
      };
    }
    const inspected = inspectProject(dir);
    if (!inspected) {
      return {
        status: "invalid",
        remembered: memory,
        message: `【專案復原】上次開啟的專案缺少必要結構：${dir}。`
      };
    }
    return {
      status: "valid",
      remembered: memory
    };
  } catch (err) {
    return {
      status: "invalid",
      remembered: memory,
      message: `【專案復原】檢查專案失敗：${err instanceof Error ? err.message : String(err)}`
    };
  }
}
