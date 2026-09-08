export const LEGACY_UNBATCHED_NOTICE = "舊資料未記錄批次";

export type ComparisonAnswer = {
  personaLabel: string;
  runId: string;
  answer: string;
};

export type ComparisonRow = {
  question: string;
  answers: ComparisonAnswer[];
};

export function answersByQuestion(
  questions: string[],
  runs: Array<{
    personaLabel: string;
    runId: string;
    answers?: Array<{ question: string; answer: string }>;
  }>
): ComparisonRow[] {
  return questions.map((question) => ({
    question,
    answers: runs.map((run) => ({
      personaLabel: run.personaLabel,
      runId: run.runId,
      answer: run.answers?.find((item) => item.question === question)?.answer ?? ""
    }))
  }));
}
