# Handoff: selected-Result Synthesis tracer

- Date: 2026-08-24
- Status: complete (restored from the session record after the 2026-08-24 deletion)
- Next task at the time: review `測驗用-綜整` with the user; then start the v0.1 desktop tracer

## Goal and result

Add a v0.0 Skill tracer for cross-Persona Synthesis without automatic merge.
The user explicitly selects completed Samples; a current-plan Preflight is
required; every synthesized claim must list `supportingSampleIds`; source
Projects are not modified.

The live Project is [`../../../測驗用-綜整/`](../../../測驗用-綜整/): 7 files, 1 Synthesis
Run, 3 selected Samples (`測驗用-複驗`, `測驗用-專家2`, `測驗用-專家3`), `valid`.

## Contracts added

- `schemas/v0.0/synthesis-result.schema.json`: consensus / disagreements /
  uniqueViews.
- Run record: `kind: synthesis`, optional `selectedResults`, `oneOf` parsed
  Result, `synthesisAttribution`.
- CLI: `render-synthesis-preflight`, `build-synthesis-project`.

## Decisions

- Synthesis writes a new Project; it never appends to or overwrites sources.
- Selection requires ≥2 Samples sharing one Source hash and Question Set.
- Consensus claims need ≥2 supporting Samples; unique views name one Sample and
  its Persona Version; empty `supportingSampleIds` fail.

## Verification

23 Skill tests passed; all touched Projects valid; no live provider calls.

## Next actions (as of the time)

User reviews the synthesis report; if useful, begin v0.1 desktop. The user
accepted the report, and v0.1 started the same day.
