import { PERSONA_FIELDS, type PersonaField } from "./disclaimer";
import { hashJson } from "./hash";
import { isId } from "./ids";

export type DirectMapping = { field: PersonaField; sourcePassage: string };
export type Inference = {
  id: string;
  field: PersonaField;
  proposedValue: string;
  rationale: string;
  sourcePassage: string;
  decision: "accepted" | "rejected";
};

export type PersonaVersion = {
  id: string;
  personaId: string;
  version: number;
  status: "confirmed";
  label: string;
  fields: Partial<Record<PersonaField, string>>;
  rawInput: string;
  directMappings: DirectMapping[];
  notProvidedFields: PersonaField[];
  inferences: Inference[];
  provenance: { method: string };
  review: {
    confirmedAt: string;
    confirmedBy: string;
    realPerson: { applies: boolean; warningAcknowledgedAt: string | null };
  };
  createdAt: string;
  contentHash?: string;
};

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

function requireId(value: string, path: string): void {
  if (!isId(value)) {
    throw new DomainError(`${path} is not a valid identifier`);
  }
}

export function personaWithoutHash(persona: PersonaVersion): Omit<PersonaVersion, "contentHash"> {
  const { contentHash: _ignored, ...rest } = persona;
  return rest;
}

export function withPersonaHash(persona: Omit<PersonaVersion, "contentHash">): PersonaVersion {
  return { ...persona, contentHash: hashJson(persona) };
}

export function confirmManualPersona(input: {
  id: string;
  personaId: string;
  label: string;
  rawInput: string;
  fields: Partial<Record<PersonaField, string>>;
  confirmedAt: string;
  confirmedBy: string;
  realPersonApplies: boolean;
  warningAcknowledgedAt?: string | null;
}): PersonaVersion {
  requireId(input.id, "persona.id");
  requireId(input.personaId, "persona.personaId");
  if (!input.label.trim() || !input.rawInput.trim()) {
    throw new DomainError("Persona label and rawInput are required");
  }
  const fields: Partial<Record<PersonaField, string>> = {};
  const mappings: DirectMapping[] = [];
  const notProvided: PersonaField[] = [];
  for (const field of PERSONA_FIELDS) {
    const value = (input.fields[field] ?? "").trim();
    if (value) {
      if (!input.rawInput.includes(value) && !input.rawInput.includes(value.replace(/。$/, ""))) {
        throw new DomainError(`${field} must be supported by rawInput`);
      }
      fields[field] = value;
      const passage = input.rawInput.includes(value) ? value : value.replace(/。$/, "");
      mappings.push({ field, sourcePassage: passage });
    } else {
      notProvided.push(field);
    }
  }
  if (Object.keys(fields).length === 0) {
    throw new DomainError("A confirmed Persona needs at least one supported field");
  }
  if (input.realPersonApplies && !input.warningAcknowledgedAt) {
    throw new DomainError("Real-person Personas require warning acknowledgement");
  }
  return withPersonaHash({
    id: input.id,
    personaId: input.personaId,
    version: 1,
    status: "confirmed",
    label: input.label.trim(),
    fields,
    rawInput: input.rawInput,
    directMappings: mappings,
    notProvidedFields: notProvided,
    inferences: [],
    provenance: { method: "manually structured in v0.1 desktop tracer" },
    review: {
      confirmedAt: input.confirmedAt,
      confirmedBy: input.confirmedBy,
      realPerson: {
        applies: input.realPersonApplies,
        warningAcknowledgedAt: input.realPersonApplies ? input.warningAcknowledgedAt ?? null : null
      }
    },
    createdAt: input.confirmedAt
  });
}
