# Handoff: v0.3 Workbook baseline accepted

- Date: 2026-08-30
- Status: format usability decision complete; implementation not started
- Next task: when the user requests construction, specify and implement the
  read-only Workbook validator/importer as the first part of v0.3 increment 1,
  together with last-Project/Workbook memory and safe startup recovery

## Accepted decision

After reviewing
`outputs/01a03bac-99c5-77e1-9a8e-23cfcd0e892f/Opinion-Simulator-v0.3-Workbook-簡易模板.xlsx`,
the user reported that the template should be acceptable. This is recorded as
acceptance of the five-sheet Workbook usability direction and satisfies the
v0.3 pre-construction format decision gate.

This approval does not start implementation by itself. The current App still
does not import the Workbook, and existing open-directory Projects remain
unchanged and valid.

## Accepted baseline

- One `.xlsx` file is the public editable input/management surface.
- Five visible sheets: `使用說明`, `Persona`, `問題集`, `材料`, and `執行清單`.
- No Persona draft state; Workbook enablement is only `是` / `否`.
- Same-`batchId` rows represent multiple Personas for the same Source and
  Question Set while preserving one independently traceable Run/Job per row.
- Sample count is a whole number from 1 through 100, subject to App-side
  Preflight, queue, rate, time, and cost controls.
- Provider/model, credentials, Persona confirmation, Preflight approval,
  execution, Results, and integrity data remain App/Project-owned.

## Architecture boundary

The first v0.3 tracer reads and validates the Workbook directly as mutable
input. Immutable provider responses, Runs, reports, approvals, hashes, and
recovery journals remain in a companion open-directory Project. The App does
not overwrite the source Workbook. Making `.xlsx` the sole canonical artifact
would require a separate migration and integrity decision.

## Canonical documents updated

- `docs/formats/workbook-input.md` (new): sheet/table/field contract, batch
  semantics, App-owned gates, security boundary, and implementation status.
- `docs/README.md`: links the accepted v0.3 Workbook format baseline.
- `docs/roadmap.md`: marks the entry gate satisfied and adds the Workbook
  validator/importer to v0.3 increment 1 and exit criteria.
- `docs/product/spec.md`: records the accepted Workbook role in the planned
  v0.3 product decisions.

## Verification

- Full suites pass: 64 JavaScript tests and 24 Python Skill tests.
- Local links in all four modified canonical documents resolve.
- No trailing whitespace was found in the modified canonical documents.
- No live provider calls were made and no credentials were read, written, or
  exposed.

## Cleanup and repository notes

- The test-generated Vite cache was moved reversibly to
  `需刪除/v03-workbook-acceptance-2026-08-30/.vite-after-workbook-acceptance/`.
- No Git command was performed.
