# Handoff: v0.3 Workbook importer specification

- Date: 2026-08-31
- Status: specification draft awaiting user review; no parser or App wiring
- Next task: after the user accepts or revises the proposed decisions in
  `docs/formats/workbook-input.md`, implement `@opinion-simulator/workbook`
  (`validateWorkbook`) against the listed fixtures. Do not start last-Project
  memory or Desktop IPC in that first code slice.

## Goal and result

The previous Grok session on 2026-08-29 only scanned the tree. Codex on
2026-08-30 recorded Workbook usability acceptance and stopped. This task
wrote the missing importer contract so construction can start from a reviewed
public seam instead of from the review `.xlsx` alone.

No TypeScript, Python, package, IPC, or fixture files were added. Existing
Projects were not opened or rewritten.

## Files changed

- `docs/formats/workbook-input.md` — public seam, parser rules, limits, mapping,
  golden template mapping, issue codes, planned fixtures
- `docs/README.md`, `docs/roadmap.md`, `docs/product/spec.md`,
  `docs/architecture/overview.md`, `docs/quality/test-strategy.md` — pointers
  only; limits live in the format document
- `docs/handoffs/README.md` — this row

## Decisions (proposed, not yet user-confirmed)

Recorded in `docs/formats/workbook-input.md` under "Decisions awaiting
confirmation":

- Package `@opinion-simulator/workbook`, bytes-in result-out `validateWorkbook`
- ZIP + SpreadsheetML only; no formula engine
- First-tracer size/row/length caps
- Workbook `樣本數` 1–100 stays valid; current Run schema stays `1 | 3`;
  the accepted template's sample count 10 imports with warning
  `SAMPLE_COUNT_NOT_EXECUTABLE` and is never coerced
- Output is `ValidatedWorkbook`, not `DraftState` and not a Project write
- Credential-shaped **column names** are rejected; cell text is not scanned

## Verification

- Inspected the accepted template zip: five visible sheets, four named tables,
  table range rows 5–104, no VBA/external links, sample `batch-001` `樣本數` 10
- Local links in the modified canonical documents should resolve (checked in
  this task)
- Full suites: 64 JavaScript tests and 24 Python Skill tests passed
- No live provider calls. No credentials read, written, or exposed.

## Cleanup and repository notes

- The test-generated Vite cache was moved reversibly to
  `需刪除/v03-workbook-importer-spec-2026-08-31/.vite-after-importer-spec/`.
- No Git command was performed.

## Risks and open questions

- The accepted review template cannot become an executable Run under the
  current `sampleCount` enum. Treating 10 as a warning rather than an error is
  the proposed way to keep that template importable.
- Excel's question-order validation allows 1–1000 while the table only has 100
  rows. The spec follows the 1–1000 bound and uniqueness.
- v0.2 increments 1–7 remain uncommitted in the working tree. This task did
  not commit them.

## Next actions

1. User review of the proposed decisions table.
2. If accepted: TDD `validateWorkbook` in `@opinion-simulator/workbook`.
3. Last-Project/Workbook memory and Desktop file chooser stay in a later
   slice of v0.3 increment 1.

## Important commands

```text
npm test
```

## Suggested skills

- `tdd` once implementation is authorized
