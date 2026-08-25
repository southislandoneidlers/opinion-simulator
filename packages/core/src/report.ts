import { DISCLAIMER, METHOD_LIMITS, METHODOLOGY_VERSION } from "./disclaimer";
import { sha256Bytes } from "./hash";
import type { StructuredResult } from "./result";

function list(values: string[]): string {
  if (values.length === 0) {
    return "- Not provided\n";
  }
  return values.map((value) => `- ${value.replace(/\s+/g, " ").trim()}`).join("\n") + "\n";
}

export function methodologyMarkdown(): string {
  const lines = [
    "# Opinion Simulator method limits",
    "",
    `- Version: ${METHODOLOGY_VERSION}`,
    "- Applies to: v0.1 desktop tracer / v0.0 Skill Prototype",
    "",
    "This file is the shared method-limits surface for this Project. Ordinary reports reference it instead of repeating these limits.",
    "",
    "- Outputs are model-generated predictions conditioned on the supplied Persona and Source. They are not quotes, measurements, or evidence of what any real person or group actually thinks.",
    "- Direct Reaction is a simulated natural-language response, not a real-person quote.",
    "- Persona Recommendations belong to the simulated Persona voice. System Suggestions are AI-system analysis outside that voice."
  ];
  for (const bullet of METHOD_LIMITS) {
    lines.push(`- ${bullet}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderSimulationReport(input: {
  title: string;
  personaLabel: string;
  questionTitle: string;
  questions: string[];
  sourceText: string;
  result: StructuredResult;
  runId: string;
  methodologyHash: string;
}): string {
  const mappings =
    input.result.sourceMappings.length === 0
      ? "- Not provided\n"
      : input.result.sourceMappings
          .map(
            (mapping) =>
              `- \`${mapping.sourceId}\`: “${mapping.excerpt.replace(/\s+/g, " ").trim()}” → ${mapping.supports}`
          )
          .join("\n") + "\n";
  return [
    `# ${input.title}`,
    "",
    `> ${DISCLAIMER}`,
    "",
    "## Supplied context",
    "",
    `- Persona: ${input.personaLabel}`,
    `- Question Set: ${input.questionTitle}`,
    "",
    ...input.questions.map((question, index) => `${index + 1}. ${question}`),
    "",
    "### Source",
    "",
    input.sourceText.replace(/\s+$/u, ""),
    "",
    "## Direct Reaction",
    "",
    input.result.directReaction,
    "",
    "## Persona Recommendations",
    "",
    list(input.result.personaRecommendations),
    "## Structured analysis",
    "",
    "### Position",
    "",
    input.result.position,
    "",
    "### Reasons",
    "",
    list(input.result.reasons),
    "### Concerns",
    "",
    list(input.result.concerns),
    "### System Suggestions",
    "",
    list(input.result.systemSuggestions),
    "### Assumptions and uncertainty",
    "",
    list([...input.result.assumptions, ...input.result.uncertainties]),
    "### Source mappings",
    "",
    mappings,
    "## Details",
    "",
    `- Run record: \`runs/${input.runId}.json\``,
    `- Method limits: \`methodology.md\` (version ${METHODOLOGY_VERSION}, sha256 \`${input.methodologyHash}\`)`,
    ""
  ].join("\n");
}

export function methodologyHash(): string {
  return sha256Bytes(methodologyMarkdown());
}
