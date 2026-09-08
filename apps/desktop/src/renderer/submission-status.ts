export type SubmissionPhase =
  | "idle"
  | "submitting"
  | "accepted"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "submit_failed";

export function createSubmissionId(): string {
  return `sub-${crypto.randomUUID()}`;
}

export function isSubmissionInFlight(phase: SubmissionPhase): boolean {
  return phase === "submitting" || phase === "accepted" || phase === "running";
}

export function isSubmissionTerminal(phase: SubmissionPhase): boolean {
  return (
    phase === "completed" ||
    phase === "partial" ||
    phase === "failed" ||
    phase === "submit_failed"
  );
}

export function submissionStatusText(phase: SubmissionPhase, error?: string | null): string {
  switch (phase) {
    case "idle":
      return "";
    case "submitting":
      return "送出中";
    case "accepted":
      return "已接受，已加入佇列";
    case "running":
      return "執行中";
    case "completed":
      return "全部完成";
    case "partial":
      return "部分失敗。可重試失敗項目。";
    case "failed":
      return "執行失敗。可重試失敗項目。";
    case "submit_failed":
      return error && error.trim() ? `送出失敗。${error}` : "送出失敗。請檢查原因後再送出。";
  }
}

export function submissionStatusTone(
  phase: SubmissionPhase
): "idle" | "pending" | "ok" | "error" {
  if (phase === "idle") {
    return "idle";
  }
  if (phase === "completed") {
    return "ok";
  }
  if (phase === "partial" || phase === "failed" || phase === "submit_failed") {
    return "error";
  }
  return "pending";
}
