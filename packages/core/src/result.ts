export type SourceMapping = { sourceId: string; excerpt: string; supports: string };
export type Answer = { question: string; answer: string };

export type StructuredResult = {
  directReaction: string;
  position: string;
  reasons: string[];
  concerns: string[];
  personaRecommendations: string[];
  systemSuggestions: string[];
  sourceMappings: SourceMapping[];
  assumptions: string[];
  uncertainties: string[];
  answers: Answer[];
  validationState: "valid" | "partial" | "invalid";
};

export function isStructuredResult(value: unknown): value is StructuredResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const result = value as Partial<StructuredResult>;
  return (
    typeof result.directReaction === "string" &&
    result.directReaction.trim().length > 0 &&
    typeof result.position === "string" &&
    Array.isArray(result.reasons) &&
    Array.isArray(result.concerns) &&
    Array.isArray(result.personaRecommendations) &&
    Array.isArray(result.systemSuggestions) &&
    Array.isArray(result.sourceMappings) &&
    Array.isArray(result.assumptions) &&
    Array.isArray(result.uncertainties) &&
    Array.isArray(result.answers) &&
    (result.validationState === "valid" ||
      result.validationState === "partial" ||
      result.validationState === "invalid")
  );
}

export function validateSourceMappings(result: StructuredResult, sourceId: string, sourceText: string): string[] {
  const warnings: string[] = [];
  for (const mapping of result.sourceMappings) {
    if (mapping.sourceId !== sourceId) {
      warnings.push("Source mapping references an unknown Source");
    }
    if (!sourceText.includes(mapping.excerpt)) {
      warnings.push("Source mapping excerpt is not exact Source text");
    }
  }
  return warnings;
}
