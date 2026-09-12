export const DISCLAIMER =
  "AI simulation — not a real quote. AI 模擬——不是真實引言。 This output is a model-generated prediction conditioned on the supplied Persona and Source. It is not evidence of what any real person or group actually thinks.";

export const REAL_PERSON_WARNING =
  "This Persona may identify a real person. Reconfirm that the result will be treated only as an AI simulation, never as that person's words or views.";

export const DEFAULT_RULES = [
  "Predict a possible response conditioned only on the confirmed Persona and supplied Source.",
  "Lead with a natural-language Direct Reaction in the confirmed Persona's voice.",
  "Do not add missing Persona facts or present the output as a real quotation.",
  "Put simulated Persona Recommendations and System Suggestions in separate fields; never merge them into one unlabeled list.",
  "Separate source-supported observations from assumptions and uncertainty.",
  "Return the requested structured Result. Preserve the user's question language."
].join("\n");

export const METHOD_LIMITS = [
  "Agent-host prototype; no direct provider BYOK call was performed by the deterministic tool.",
  "Repeated Sample consistency is not calibrated confidence and is not real-human validation.",
  "The raw response and structured Result remain in the Run JSON for audit."
];

export const METHODOLOGY_VERSION = "0.0.1";

export const PERSONA_FIELDS = [
  "roleAndContext",
  "goalsAndInterests",
  "concerns",
  "constraintsAndResources",
  "knowledgeAndExperience",
  "valuesAndDecisionStyle",
  "responseStyle",
  "notes"
] as const;

export type PersonaField = (typeof PERSONA_FIELDS)[number];
