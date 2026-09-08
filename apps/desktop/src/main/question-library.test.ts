import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CAP_QUESTIONS_PER_SET, CAP_QUESTION_TEXT } from "@opinion-simulator/core";
import {
  applyQuestionLibraryEntry,
  configureQuestionLibraryDirectory,
  listQuestionLibrary,
  loadQuestionLibrary,
  removeQuestionLibraryEntry,
  saveQuestionLibraryEntry,
  searchQuestionLibrary
} from "./question-library";

describe("question library (app-data)", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "opinion-question-lib-"));
    configureQuestionLibraryDirectory(directory);
  });

  afterEach(() => {
    configureQuestionLibraryDirectory(mkdtempSync(join(tmpdir(), "opinion-question-lib-reset-")));
  });

  it("saves a named single question and a multi-question set, then reloads them", () => {
    const single = saveQuestionLibraryEntry({
      name: "支持度",
      questions: ["你會支持這項計畫嗎？"]
    });
    const set = saveQuestionLibraryEntry({
      name: "試辦評估",
      questions: ["你會支持這項計畫嗎？", "推動時最大的阻力是什麼？"]
    });
    expect(single.entry.questions).toEqual(["你會支持這項計畫嗎？"]);
    expect(set.entry.questions).toHaveLength(2);
    const listed = listQuestionLibrary();
    expect(listed.entries.map((entry) => entry.name)).toEqual(["支持度", "試辦評估"]);
    configureQuestionLibraryDirectory(directory);
    expect(loadQuestionLibrary().entries).toHaveLength(2);
  });

  it("rejects blank names, blank questions, over-long text, and too many items", () => {
    expect(() => saveQuestionLibraryEntry({ name: "  ", questions: ["有內容"] })).toThrow(/名稱/);
    expect(() => saveQuestionLibraryEntry({ name: "空題", questions: ["  "] })).toThrow(/空白/);
    expect(() =>
      saveQuestionLibraryEntry({ name: "超長", questions: ["問".repeat(CAP_QUESTION_TEXT + 1)] })
    ).toThrow(/4000/);
    expect(() =>
      saveQuestionLibraryEntry({
        name: "太多",
        questions: Array.from({ length: CAP_QUESTIONS_PER_SET + 1 }, (_, index) => `問題 ${index + 1}`)
      })
    ).toThrow(/50/);
  });

  it("searches by name or question text", () => {
    saveQuestionLibraryEntry({ name: "支持度", questions: ["你會支持這項計畫嗎？"] });
    saveQuestionLibraryEntry({ name: "阻力", questions: ["推動時最大的阻力是什麼？"] });
    expect(searchQuestionLibrary("支持").entries.map((entry) => entry.name)).toEqual(["支持度"]);
    expect(searchQuestionLibrary("阻力").entries.map((entry) => entry.name)).toEqual(["阻力"]);
  });

  it("updates and removes an entry without rewriting a corrupt file", () => {
    const saved = saveQuestionLibraryEntry({
      name: "初稿",
      questions: ["第一題？"]
    });
    const updated = saveQuestionLibraryEntry({
      id: saved.entry.id,
      name: "修訂",
      questions: ["第一題？", "第二題？"]
    });
    expect(updated.entry.name).toBe("修訂");
    expect(listQuestionLibrary().entries).toHaveLength(1);
    expect(removeQuestionLibraryEntry(saved.entry.id).removed).toBe(true);
    expect(listQuestionLibrary().entries).toHaveLength(0);
    writeFileSync(join(directory, "question-library.json"), "{not-json", "utf8");
    expect(() => loadQuestionLibrary()).toThrow(/無法解析/);
    mkdirSync(join(directory, "nested"), { recursive: true });
    configureQuestionLibraryDirectory(join(directory, "nested"));
    writeFileSync(
      join(directory, "nested", "question-library.json"),
      JSON.stringify({ schemaVersion: "9.9" }),
      "utf8"
    );
    expect(() => loadQuestionLibrary()).toThrow(/格式不符/);
  });

  it("appends or replaces current questions and refuses an append that exceeds the set cap", () => {
    const saved = saveQuestionLibraryEntry({
      name: "加題",
      questions: ["第三題？"]
    });
    expect(
      applyQuestionLibraryEntry(saved.entry.id, ["第一題？", "第二題？"], "append")
    ).toEqual(["第一題？", "第二題？", "第三題？"]);
    expect(applyQuestionLibraryEntry(saved.entry.id, ["舊題？"], "replace")).toEqual(["第三題？"]);
    const full = saveQuestionLibraryEntry({
      name: "滿額",
      questions: Array.from({ length: CAP_QUESTIONS_PER_SET }, (_, index) => `庫 ${index + 1}`)
    });
    expect(() => applyQuestionLibraryEntry(full.entry.id, ["現有題？"], "append")).toThrow(/50/);
  });
});
