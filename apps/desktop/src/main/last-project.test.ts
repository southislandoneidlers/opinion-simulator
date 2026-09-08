import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearLastProjectMemory,
  configureLastProjectDirectory,
  getLastProjectMemory,
  inspectLastProjectMemory,
  saveLastProjectMemory,
  LAST_PROJECT_FILENAME
} from "./last-project";

describe("last-project memory and startup recovery", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `test-last-project-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    configureLastProjectDirectory(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null when no memory file exists", () => {
    expect(getLastProjectMemory()).toBeNull();
    const inspected = inspectLastProjectMemory();
    expect(inspected.status).toBe("none");
  });

  it("saves and retrieves project directory and workbook path", () => {
    saveLastProjectMemory({
      projectDirectory: "/path/to/project",
      workbookPath: "/path/to/file.xlsx"
    });

    const memory = getLastProjectMemory();
    expect(memory).not.toBeNull();
    expect(memory?.projectDirectory).toBe("/path/to/project");
    expect(memory?.workbookPath).toBe("/path/to/file.xlsx");
    expect(memory?.schemaVersion).toBe("0.3");
  });

  it("updates memory partially", () => {
    saveLastProjectMemory({ projectDirectory: "/path/1" });
    saveLastProjectMemory({ workbookPath: "/file.xlsx" });

    const memory = getLastProjectMemory();
    expect(memory?.projectDirectory).toBe("/path/1");
    expect(memory?.workbookPath).toBe("/file.xlsx");
  });

  it("clears memory without deleting directory", () => {
    saveLastProjectMemory({ projectDirectory: "/path/1" });
    clearLastProjectMemory();

    const memory = getLastProjectMemory();
    expect(memory?.projectDirectory).toBeNull();
    expect(memory?.workbookPath).toBeNull();
  });

  it("returns missing status with recoverable message when directory does not exist", () => {
    saveLastProjectMemory({ projectDirectory: join(tempDir, "does-not-exist") });

    const inspected = inspectLastProjectMemory();
    expect(inspected.status).toBe("missing");
    expect(inspected.message).toContain("不存在或被移動");
  });

  it("returns invalid status when directory is occupied but not a project", () => {
    const occupiedDir = join(tempDir, "occupied");
    mkdirSync(occupiedDir, { recursive: true });
    writeFileSync(join(occupiedDir, "random.txt"), "hello", "utf8");

    saveLastProjectMemory({ projectDirectory: occupiedDir });

    const inspected = inspectLastProjectMemory();
    expect(inspected.status).toBe("invalid");
    expect(inspected.message).toContain("不是有效的專案");
  });
});
