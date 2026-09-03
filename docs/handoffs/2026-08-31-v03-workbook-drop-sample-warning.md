# Handoff: drop Workbook sample-count executability warning

- Date: 2026-08-31
- Status: specification and review template updated; no parser
- Next task: when construction is authorized, implement `validateWorkbook` in
  `@opinion-simulator/core` without `SAMPLE_COUNT_NOT_EXECUTABLE` and with
  template `樣本數` 1

## Goal and result

The user removed the special case around the review template's `樣本數` 10
and dropped the importer warning. The importer now stores Workbook sample
counts 1–100 as written.

## Files changed

- `docs/formats/workbook-input.md` — removed `executableSampleCount`, the
  warning code, and golden-mapping rows that mentioned 10
- `outputs/01a03bac-99c5-77e1-9a8e-23cfcd0e892f/Opinion-Simulator-v0.3-Workbook-簡易模板.xlsx`
  — `執行清單` E5 and E6 changed from 10 to 1
- `docs/handoffs/README.md` — this row

Older handoffs that mention 10 or the warning were not rewritten.

## Decisions

- No `SAMPLE_COUNT_NOT_EXECUTABLE` warning.
- Review-template demo `樣本數` is 1 (current executable quick mode).
- Workbook field range stays 1–100; 0 and 101 still fail `SAMPLE_COUNT_INVALID`.
- `ExecutionPlan.sampleCount` remains `1 | 3` until a later increment. That
  limit is App/plan-owned, not an importer warning.

## Verification

- Sheet XML contains E5/E6 value 1 and no remaining `<x:v>10</x:v>`
- Local links in the new handoff and format document resolve
- Full suites: 64 JavaScript tests and 24 Python Skill tests passed
- No live provider calls. No credentials read, written, or exposed.

## Cleanup and repository notes

- The test-generated Vite cache was moved reversibly to
  `需刪除/v03-workbook-drop-sample-warning-2026-08-31/.vite-after-drop-sample-warning/`.
- No Git command was performed.

## Next actions

1. Implement `validateWorkbook` when the user authorizes construction.
2. Golden fixture is the updated template: 2 Personas, `sampleCount` 1, no
   warnings.

## Important commands

```text
npm test
```
