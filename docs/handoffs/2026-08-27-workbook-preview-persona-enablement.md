# Handoff: Workbook preview Persona enablement

- Date: 2026-08-27
- Status: awaiting further user review
- Next task: continue collecting Workbook usability feedback before updating
  canonical format documents, schemas, or application behavior.

## Goal and result

Apply the user's review comment that Persona rows do not need a draft status.

The updated review artifact is:

`outputs/2026-08-27-workbook-project-preview/Workbook-Project-易用性原型.xlsx`

## Workbook changes

- Removed the Persona status model `草稿` / `已確認` / `停用`.
- Renamed the Persona `狀態` column to `啟用`.
- Replaced its dropdown with the simpler values `是` / `否`.
- Changed the sample Persona from `草稿` to `是`.
- Updated the Persona-sheet guidance to state that the Workbook only controls
  whether a row is available; actual Persona confirmation remains an App-owned
  execution gate.

## Important implementation boundary

This remains a usability proposal. No App, Persona Library, Project schema,
importer, or confirmation behavior was changed. The Workbook's `啟用` value
must not be treated as Persona confirmation or Preflight approval.

## Verification

- The exported Workbook re-imports successfully.
- The Persona sheet contains no `草稿`, `已確認`, or `停用` option.
- The `啟用` example is `是`, with list validation restricted to `是` / `否`.
- The App-confirmation guidance remains visible.
- Formula/error scan found no matches.
- All eight sheets received a final visual pass; the updated Persona guidance,
  header, value, and dropdown are legible.
- Full suites pass: 63 JavaScript tests and 24 Python Skill tests.
- `git diff --check` passes.
- No live provider calls were made and no credentials were read, written, or
  exposed.

## Cleanup and repository notes

- Only the `.xlsx` review artifact remains under `outputs/`.
- Render and inspect support files were moved reversibly to
  `需刪除/workbook-preview-support-persona-state-2026-08-27/`.
- The test-generated Vite cache was moved reversibly to
  `需刪除/apps/desktop/node_modules/.vite-after-persona-state-review/`.
- No Git stage, commit, branch, or push was performed.
