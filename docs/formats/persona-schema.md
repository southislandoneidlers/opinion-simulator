# Persona schema contract

> The lower half of this document survived deletion verbatim; the header prose
> is restored from the same record.

## Goals

The Persona format must preserve user intent, absence, provenance, confirmation,
and version history. AI organization is a review aid, not an authority to fill
gaps.

## Conceptual shape

The published [v0.0 Persona collection schema](../../schemas/v0.0/personas.schema.json)
implements the current Skill subset. Future schema revisions and TypeScript
types must continue to represent these fields:

```text
PersonaVersion
  id
  personaId
  version
  status = confirmed
  label
  fields
    roleAndContext
    goalsAndInterests
    concerns
    constraintsAndResources
    knowledgeAndExperience
    valuesAndDecisionStyle
    responseStyle
    notes
  rawInput
  inferences[]
  provenance
  review
  createdAt
  contentHash
```

Every structured field is optional and may be blank. The serialized form must
distinguish absent/blank from model-inferred content.

## Raw input

- Preserve the user's original free-form Persona text exactly as submitted.
- Later edits create a new draft and version; they do not rewrite prior input.
- The UI displays raw and structured views together during review.

## AI organization proposal

The organizer returns three categories:

1. **Directly supported fields:** reorganized from explicit input with mappings
   to the relevant raw passages.
2. **Not provided fields:** structurally visible but empty.
3. **Inferences:** optional proposals with rationale and source passage; excluded
   until the user accepts each one.

The organizer may split, normalize wording, and remove accidental duplication.
It may not invent demographics, history, credentials, opinions, goals, or
psychological traits to make the Persona feel complete.

### v0.1 desktop subset

One free-form background textarea; its whole confirmed text becomes the
directly supported `roleAndContext` field with zero inferences.
