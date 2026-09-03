# Handoff: v0.2 increment 3 — Prompt-section reordering (template v2)

- Date: 2026-08-24
- Status: complete
- Next task: v0.2 increment 4 — reusable Persona library

## User decision implemented (source-of-truth order 1)

Recorded 2026-08-24 in the v0.2 planning handoff: repeated/static content
(system rules, output schema, model/sampling parameters) goes first in what is
sent to the model; per-Run content (Persona, questions, Source) goes last —
for token savings and cache friendliness.

## Contract change

- `packages/core/src/plan.ts`: new exported `PROMPT_TEMPLATE_VERSION = 2`;
  `makeExecutionPlan` stamps it into `promptTemplate.version`. New exported
  `assemblePrompt(plan)` is the single canonical assembly:
  `systemAndTaskRules → outputSchema → modelAndSampling → persona → questions
  → sourceMaterial`, joined with blank lines.
- `packages/providers-gemini/live.ts` and `packages/providers-openai/live.ts`
  now call `assemblePrompt` instead of hand-joining sections.
- Python Skill (`opinion_simulator.py`): `TEMPLATE_VERSION = 2`; added
  `PROMPT_SECTION_ORDER` + `build_prompt()` mirroring the TS contract so the
  deterministic tool and desktop stay on one ordering definition. The tool
  still performs no live provider calls; the helper is the canonical reference
  for any future host integration.
- `TEMPLATE_CONTENT_HASH` is unchanged: it hashes the system-rules text, which
  did not change; the version field distinguishes the ordering contract.
- Backward compatibility: old Projects carry template version 1 and their
  stored plan hashes; nothing re-renders or invalidates them. The untouched
  fixture `legacy-generic-recommendations` continues to pass as the
  read-old-Projects path.
- Open question from the planning handoff resolved accordingly: prompt
  reordering applies to both the desktop path and the Python Skill contract,
  via one shared canonical order.

## Golden fixtures regenerated

`tests/skill/fixtures/v0.0/golden-quick` and `golden-stability`: project trees,
preflight.json, and approval.json rebuilt through the CLI itself (render-
preflight → approval planHash/runId refresh → build-project). Verified diffs
are limited to `promptTemplate.version` (1→2), `planHash`, run-record
timestamps/hash fields, and checksums.sha256. Both regenerate as `valid`.

## Tests added/updated

- `packages/core/src/plan.test.ts` (new, 2 tests): version stamping; exact
  assembly order equals static-first/per-Run-last join.
- `providers-openai/live.test.ts`: strict six-marker order assertion over the
  sent prompt.
- Suites green after rebuild: JS core 5 / project-store 2 / gemini 1 /
  openai 5 / desktop 11 = 24; Python Skill suite OK including golden byte-for-
  byte comparisons.
- Live-provider call status: none this session. Secret exposure: none.

## Notes

- No git operations performed.
