# Handoff: v0.3 Workbook simple-template decision gate

- Date: 2026-08-29
- Status: awaiting user review; v0.3 implementation waits for this format
  decision
- Next task: collect the user's annotations on the new Workbook, revise the
  prototype as needed, and record explicit acceptance or rejection before
  changing schemas, importers, or App behavior

## Goal and result

The user decided that the Workbook input-format question must be resolved
before v0.3 construction starts and requested a simpler template for review.

The new review artifact is:

`outputs/01a03bac-99c5-77e1-9a8e-23cfcd0e892f/Opinion-Simulator-v0.3-Workbook-簡易模板.xlsx`

## Simplified layout

The previous eight-sheet prototype was reduced to five sheets:

- `使用說明`: four-step workflow, multi-Persona batch example, security
  boundary, and the provisional 1–100 Sample range.
- `Persona`: `personaId`, name, free-form background, enable toggle, and a
  formula-driven format check. There is no draft status.
- `問題集`: `questionSetId`, sequence, question text, and format check.
- `材料`: `sourceId`, title, pasted Source text, enable toggle, and format
  check.
- `執行清單`: `batchId`, Persona/Source/Question Set ids, Sample count, enable
  toggle, format check, and management notes.

The same `batchId` on multiple rows represents multiple Personas answering the
same Source and Question Set. Each row still names one Persona so future App
Runs remain independently traceable and retryable.

## Decisions carried forward

- Provider, model, API key, Persona confirmation, Preflight, execution,
  results, and integrity controls stay in the App.
- Sample count accepts whole numbers from 1 through 100 in this prototype.
- Persona uses only `是` / `否` enablement; no `草稿` state exists.
- API keys, tokens, passwords, accounts, and other credentials must never be
  placed in the Workbook.

## Validation and usability features

- Each input sheet reserves 100 paste-ready rows with frozen headers.
- Dropdown validation covers enable values; numeric validation covers question
  order and Sample count.
- Formula checks detect missing required values, duplicate ids/order, missing
  or disabled references, out-of-range Sample counts, duplicate Personas in a
  batch, and inconsistent settings within one batch.
- Yellow cells are editable; gray cells are formula-owned; valid sample rows
  turn green.

## Verification

- The exported `.xlsx` re-imported successfully with exactly five sheets.
- The two-row `batch-001` example resolves to `可匯入` for both Personas.
- Formula/error scan found no `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, or
  `#N/A` matches.
- All five sheets received a visual pass; titles, guidance, sample rows,
  dropdowns, check columns, and long-text areas are legible and not clipped.
- Full suites pass: 64 JavaScript tests and 24 Python Skill tests.
- No live provider calls were made and no credentials were read, written, or
  exposed.

## Cleanup and repository notes

- Only the review `.xlsx` remains under its output directory.
- Inspect support output and the test-generated Vite cache were moved
  reversibly to
  `需刪除/workbook-v03-simple-template-support-2026-08-29/`.
- No Git command was performed.
