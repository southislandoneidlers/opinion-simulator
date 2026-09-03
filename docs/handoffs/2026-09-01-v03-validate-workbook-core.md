# Handoff: implement validateWorkbook in core

- Date: 2026-09-01
- Status: `validateWorkbook` implemented in `@opinion-simulator/core` with comprehensive test suite (46 core tests, all suites passing)
- Next task: v0.3 desktop integration (last-Project / Workbook path memory, safe startup recovery, and Settings integration)

## Goal and result

Implemented the v0.3 fixed-format Workbook validator in `@opinion-simulator/core` as specified in `docs/formats/workbook-input.md`.

The pure function `validateWorkbook({ bytes, fileName? })` parses OPC Zip and SpreadsheetML in memory without filesystem mutations, strictly validates all 5 visible sheets (`使用說明`, `Persona`, `問題集`, `材料`, `執行清單`), checks resource caps (8 MiB compressed, 32 MiB uncompressed, max 30 Personas), enforces security rules (disallows `.xlsm` macros, formulas in user-input cells, external links, embedded objects, and credential-shaped headers), and maps the contents into a structured `ValidatedWorkbook` batch model.

## Files changed

- `packages/core/src/workbook.ts` — pure in-memory `validateWorkbook` implementation and types
- `packages/core/src/workbook.test.ts` — comprehensive unit test suite covering golden template mapping, bounds, security rejections, and zero-mutation checks
- `packages/core/src/index.ts` — re-export workbook types and `validateWorkbook`
- `docs/handoffs/2026-09-01-v03-validate-workbook-core.md` — this handoff
- `docs/handoffs/README.md` — added this row

## Decisions

- Pure in-memory ZIP extraction and XML parsing using Node's standard `zlib.inflateRawSync` without introducing heavy external spreadsheet dependencies.
- Strict conformance to the accepted golden template: `outputs/01a03bac-99c5-77e1-9a8e-23cfcd0e892f/Opinion-Simulator-v0.3-Workbook-簡易模板.xlsx`.
- User-input cells with `<f>` formulas fail with `CELL_FORMULA_IN_INPUT`. Formula-owned `格式檢查` columns are ignored and recomputed in memory.
- `ValidatedWorkbook` matches the specification: shared Source and Question Set first, Personas and Simulation Batches with sample count 1–100.

## Verification

- Golden template `Opinion-Simulator-v0.3-Workbook-簡易模板.xlsx` validated deterministically into 2-Persona `ValidatedWorkbook` with `sampleCount: 1` and 0 warnings.
- 46 unit tests in `@opinion-simulator/core` covering valid batches, boundary conditions (30 vs 31 Personas, sample count 1–100), security controls (macros, zip bombs, formulas, external links, credential headers), and error codes.
- Full test suite passed: 98 JavaScript workspace tests and 24 Python Skill tests passed (`npm test`).
- Full project build succeeded (`npm run build`).
- Zero live provider calls. Zero credentials read, written, or exposed.
- Working tree and project files remain untouched during validation.

## Next actions

1. Desktop Main/IPC integration for reading chosen `.xlsx` paths and passing bytes into `validateWorkbook`.
2. Last-Project / Workbook path memory and safe startup recovery.
3. Settings UI integration for credential management and save acknowledgements.

## Important commands

```text
npm test
npm run build
```
