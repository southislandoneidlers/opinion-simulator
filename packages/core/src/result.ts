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

export type StabilitySample = {
  sampleId: string;
  parsedResult: StructuredResult;
};

export type StabilityComparison = {
  mode: "three-sample-exact-normalized-comparison" | "exact-normalized-comparison";
  consistentThemes: Array<{ field: string; text: string; sampleIds: string[] }>;
  divergentThemes: Array<{ field: string; text: string; sampleIds: string[] }>;
  sourceMappingDifferences: Array<{ sourceId: string; excerpt: string; sampleIds: string[] }>;
  anomalies: string[];
  limitation: string;
};

const COMPARISON_FIELDS: Array<keyof StructuredResult> = [
  "concerns",
  "directReaction",
  "personaRecommendations",
  "position",
  "reasons",
  "systemSuggestions"
];

/** Deterministic exact-text comparison shared by Desktop and the v0.0 Skill contract. */
export function compareStability(samples: StabilitySample[]): StabilityComparison {
  if (samples.length < 2) {
    throw new Error("Stability Comparison requires at least two Samples");
  }
  const sampleIds = samples.map((sample) => sample.sampleId).sort();
  const consistentThemes: StabilityComparison["consistentThemes"] = [];
  const divergentThemes: StabilityComparison["divergentThemes"] = [];

  for (const field of COMPARISON_FIELDS) {
    const first = samples[0].parsedResult[field];
    if (typeof first === "string") {
      const groups = new Map<string, string[]>();
      for (const sample of samples) {
        const text = String(sample.parsedResult[field]).trim();
        groups.set(text, [...(groups.get(text) ?? []), sample.sampleId]);
      }
      for (const text of [...groups.keys()].sort()) {
        const holders = [...(groups.get(text) ?? [])].sort();
        const entry = { field, text, sampleIds: holders };
        (holders.length === samples.length ? consistentThemes : divergentThemes).push(entry);
      }
      continue;
    }

    const valuesBySample = samples.map((sample) => {
      const value = sample.parsedResult[field];
      return Array.isArray(value) ? value.map((item) => String(item).trim()) : [];
    });
    const common = valuesBySample[0].filter((text) =>
      valuesBySample.slice(1).every((values) => values.includes(text))
    );
    for (const text of [...new Set(common)].sort()) {
      consistentThemes.push({ field, text, sampleIds });
    }
    const mixed = new Map<string, string[]>();
    valuesBySample.forEach((values, index) => {
      for (const text of values) {
        if (common.includes(text)) {
          continue;
        }
        const holders = mixed.get(text) ?? [];
        if (!holders.includes(samples[index].sampleId)) {
          holders.push(samples[index].sampleId);
        }
        mixed.set(text, holders);
      }
    });
    for (const text of [...mixed.keys()].sort()) {
      divergentThemes.push({ field, text, sampleIds: [...(mixed.get(text) ?? [])].sort() });
    }
  }

  const mappings = new Map<string, { sourceId: string; excerpt: string; sampleIds: string[] }>();
  for (const sample of samples) {
    for (const mapping of sample.parsedResult.sourceMappings) {
      const excerpt = mapping.excerpt.trim();
      const key = `${mapping.sourceId}\u0000${excerpt}`;
      const current = mappings.get(key) ?? { sourceId: mapping.sourceId, excerpt, sampleIds: [] };
      if (!current.sampleIds.includes(sample.sampleId)) {
        current.sampleIds.push(sample.sampleId);
      }
      mappings.set(key, current);
    }
  }
  const sourceMappingDifferences = [...mappings.values()]
    .filter((mapping) => mapping.sampleIds.length !== samples.length)
    .map((mapping) => ({ ...mapping, sampleIds: [...mapping.sampleIds].sort() }))
    .sort((left, right) =>
      `${left.sourceId}\u0000${left.excerpt}`.localeCompare(`${right.sourceId}\u0000${right.excerpt}`)
    );

  return {
    mode:
      samples.length === 3
        ? "three-sample-exact-normalized-comparison"
        : "exact-normalized-comparison",
    consistentThemes,
    divergentThemes,
    sourceMappingDifferences,
    anomalies: [],
    limitation:
      "Exact normalized text matching surfaces repetition and divergence but is not semantic equivalence or a numeric confidence measure."
  };
}

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
