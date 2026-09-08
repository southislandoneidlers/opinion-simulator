import { describe, expect, it } from "vitest";
import {
  createSubmissionId,
  isSubmissionInFlight,
  isSubmissionTerminal,
  submissionStatusText,
  submissionStatusTone
} from "./submission-status";

describe("submission status copy", () => {
  it("uses readable text for each phase, not color-only meaning", () => {
    expect(submissionStatusText("submitting")).toBe("送出中");
    expect(submissionStatusText("accepted")).toBe("已接受，已加入佇列");
    expect(submissionStatusText("running")).toBe("執行中");
    expect(submissionStatusText("completed")).toBe("全部完成");
    expect(submissionStatusText("partial")).toBe("部分失敗。可重試失敗項目。");
    expect(submissionStatusText("failed")).toBe("執行失敗。可重試失敗項目。");
    expect(submissionStatusText("submit_failed", "【Preflight】批次執行計畫已變更。")).toBe(
      "送出失敗。【Preflight】批次執行計畫已變更。"
    );
  });

  it("locks extra clicks only while Main has not reached a terminal phase", () => {
    expect(isSubmissionInFlight("submitting")).toBe(true);
    expect(isSubmissionInFlight("accepted")).toBe(true);
    expect(isSubmissionInFlight("running")).toBe(true);
    expect(isSubmissionInFlight("completed")).toBe(false);
    expect(isSubmissionTerminal("completed")).toBe(true);
    expect(isSubmissionTerminal("submit_failed")).toBe(true);
  });

  it("creates an id that Main can accept", () => {
    expect(createSubmissionId()).toMatch(/^sub-[0-9a-f-]{36}$/i);
  });

  it("keeps pending, success, and failure distinguishable by tone plus text", () => {
    expect(submissionStatusTone("submitting")).toBe("pending");
    expect(submissionStatusTone("completed")).toBe("ok");
    expect(submissionStatusTone("submit_failed")).toBe("error");
  });
});
