import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CAP_QUESTIONS_PER_SET, CAP_QUESTION_TEXT, isId, slugId } from "@opinion-simulator/core";

/**
 * v0.4 increment 4: reusable named questions and question sets in app-data.
 * Draft copies are independent of library edits. This module holds no secrets.
 */

export const QUESTION_LIBRARY_SCHEMA_VERSION = "0.0";
export const QUESTION_LIBRARY_FILENAME = "question-library.json";
export const QUESTION_LIBRARY_MAX_ITEMS = CAP_QUESTIONS_PER_SET;
export const QUESTION_LIBRARY_MAX_TEXT = CAP_QUESTION_TEXT;

export type QuestionLibraryEntry = {
  id: string;
  name: string;
  questions: string[];
  savedAt: string;
  updatedAt: string;
};

export type QuestionLibrary = {
  schemaVersion: string;
  entries: QuestionLibraryEntry[];
};

export type QuestionLibraryApplyMode = "append" | "replace";

let libraryDirectory: string | null = null;

export function configureQuestionLibraryDirectory(directory: string): void {
  libraryDirectory = directory;
}

function defaultLibraryDirectory(): string {
  return join(homedir(), ".config", "opinion-simulator");
}

function libraryPath(): string {
  return join(libraryDirectory ?? defaultLibraryDirectory(), QUESTION_LIBRARY_FILENAME);
}

function emptyLibrary(): QuestionLibrary {
  return { schemaVersion: QUESTION_LIBRARY_SCHEMA_VERSION, entries: [] };
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function normalizeLibraryQuestions(questions: string[]): string[] {
  return questions.map((item) => item.replace(/\r\n/g, "\n").trim()).filter(Boolean);
}

function assertSavable(name: string, questions: string[]): string[] {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("【問題庫】名稱不可為空白。");
  }
  const normalized = normalizeLibraryQuestions(questions);
  if (normalized.length === 0) {
    throw new Error("【問題庫】空白題目不能保存。請至少填一題。");
  }
  if (normalized.length > QUESTION_LIBRARY_MAX_ITEMS) {
    throw new Error(`【問題庫】一個問題集最多 ${QUESTION_LIBRARY_MAX_ITEMS} 題。`);
  }
  for (const question of normalized) {
    if ([...question].length > QUESTION_LIBRARY_MAX_TEXT) {
      throw new Error(`【問題庫】單題不可超過 ${QUESTION_LIBRARY_MAX_TEXT} 字。`);
    }
  }
  return normalized;
}

export function loadQuestionLibrary(): QuestionLibrary {
  const path = libraryPath();
  if (!existsSync(path)) {
    return emptyLibrary();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`問題庫檔案無法解析（${path}）：${(error as Error).message}`);
  }
  const library = parsed as Partial<QuestionLibrary>;
  if (
    !library ||
    typeof library !== "object" ||
    library.schemaVersion !== QUESTION_LIBRARY_SCHEMA_VERSION ||
    !Array.isArray(library.entries)
  ) {
    throw new Error(`問題庫檔案格式不符（${path}）；請手動檢查或備份後處理`);
  }
  for (const entry of library.entries as QuestionLibraryEntry[]) {
    if (!entry?.id || !isId(entry.id) || typeof entry.name !== "string" || !Array.isArray(entry.questions)) {
      throw new Error(`問題庫含不完整條目（${path}）`);
    }
  }
  return parsed as QuestionLibrary;
}

function persistLibrary(library: QuestionLibrary): void {
  const path = libraryPath();
  mkdirSync(libraryDirectory ?? defaultLibraryDirectory(), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, JSON.stringify(library, null, 2), "utf8");
  renameSync(temp, path);
}

export function listQuestionLibrary(): QuestionLibrary {
  return loadQuestionLibrary();
}

export function searchQuestionLibrary(query: string): QuestionLibrary {
  const needle = query.trim().toLocaleLowerCase();
  const library = loadQuestionLibrary();
  if (!needle) {
    return library;
  }
  return {
    schemaVersion: library.schemaVersion,
    entries: library.entries.filter(
      (entry) =>
        entry.name.toLocaleLowerCase().includes(needle) ||
        entry.questions.some((question) => question.toLocaleLowerCase().includes(needle))
    )
  };
}

export function saveQuestionLibraryEntry(input: {
  id?: string;
  name: string;
  questions: string[];
}): { saved: true; entry: QuestionLibraryEntry } {
  const questions = assertSavable(input.name, input.questions);
  const library = loadQuestionLibrary();
  const timestamp = nowIso();
  if (input.id) {
    const index = library.entries.findIndex((entry) => entry.id === input.id);
    if (index < 0) {
      throw new Error("【問題庫】找不到要更新的項目。");
    }
    const current = library.entries[index];
    const next: QuestionLibraryEntry = {
      ...current,
      name: input.name.trim(),
      questions,
      updatedAt: timestamp
    };
    library.entries[index] = next;
    persistLibrary(library);
    return { saved: true, entry: next };
  }
  const entry: QuestionLibraryEntry = {
    id: slugId("qset", input.name.trim()),
    name: input.name.trim(),
    questions,
    savedAt: timestamp,
    updatedAt: timestamp
  };
  library.entries.push(entry);
  persistLibrary(library);
  return { saved: true, entry };
}

export function removeQuestionLibraryEntry(id: string): { removed: boolean } {
  const library = loadQuestionLibrary();
  const next = library.entries.filter((entry) => entry.id !== id);
  if (next.length === library.entries.length) {
    return { removed: false };
  }
  library.entries = next;
  persistLibrary(library);
  return { removed: true };
}

export function applyQuestionLibraryEntry(
  id: string,
  currentQuestions: string[],
  mode: QuestionLibraryApplyMode
): string[] {
  if (mode !== "append" && mode !== "replace") {
    throw new Error("【問題庫】請選擇追加到目前問題，或取代目前問題。");
  }
  const library = loadQuestionLibrary();
  const entry = library.entries.find((item) => item.id === id);
  if (!entry) {
    throw new Error("【問題庫】找不到要載入的項目。");
  }
  const incoming = [...entry.questions];
  const current = normalizeLibraryQuestions(currentQuestions);
  const merged = mode === "replace" ? incoming : [...current, ...incoming];
  if (merged.length > QUESTION_LIBRARY_MAX_ITEMS) {
    throw new Error(`【問題庫】載入後會超過 ${QUESTION_LIBRARY_MAX_ITEMS} 題。請改為取代，或先減少目前題目。`);
  }
  return merged;
}
