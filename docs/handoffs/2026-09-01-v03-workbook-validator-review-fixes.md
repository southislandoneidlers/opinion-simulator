# Handoff: Workbook validator review fixes

- Date: 2026-09-01
- Status: complete
- Next task: v0.3 Desktop Main/IPC integration for reading selected Workbook bytes

## Goal and result

Addressed the confirmed findings from the `validateWorkbook` code review without
expanding into Desktop behavior or modifying existing Project artifacts.

- Text-only user-input fields now reject numeric and other non-string cell
  types with `CELL_TYPE_INVALID`.
- `順序` and `樣本數` now reject string cell types and accept only numeric
  literals.
- A duplicate visible sheet name now fails closed with `SHEET_UNEXPECTED`.
- An unlinked or duplicate table part now fails closed with `TABLE_UNEXPECTED`.
- OLE compound Office input now returns the documented stable code
  `FILE_ENCRYPTED`.
- Supplementary Unicode XML character references are preserved correctly.
- The accepted Workbook fixture now lives at
  `packages/core/fixtures/workbook/Opinion-Simulator-v0.3-Workbook-簡易模板.xlsx`
  instead of an untracked `outputs/` path.
- Canonical documentation now records that the core validator and its tests are
  implemented, while Desktop wiring remains pending.

## Verification

- Added regression tests for numeric text fields, string numeric fields,
  duplicate required sheets, unlinked table parts, supplementary Unicode XML
  character references, the OLE issue code, and untouched workspace/Project
  snapshots.
- `npm run test -w @opinion-simulator/core`: 51 tests passed.
- `npm test`: 103 JavaScript workspace tests and 24 Python Skill tests passed.
- `npm run build`: all packages and the Desktop renderer built successfully.
- Zero live-provider calls. Zero credentials read, written, or exposed.

## Boundary

The pre-existing broad working-tree changes and historical handoff-index rows
were preserved. No Git stage, commit, branch, or push was performed.
