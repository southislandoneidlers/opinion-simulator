# Handoff: v0.3 Workbook importer spec revision

- Date: 2026-08-31
- Status: specification revised after user review; no parser or App wiring
- Next task: when the user authorizes construction, implement
  `validateWorkbook` in `@opinion-simulator/core` against the listed fixtures.
  Do not add a `packages/workbook` workspace. Do not start last-Project memory
  or Desktop IPC in that first code slice.

## Goal and result

Apply the user's seven review answers to the importer contract. No TypeScript,
Python, package, IPC, or fixture files were added. Existing Projects were not
opened or rewritten.

## Files changed

- `docs/formats/workbook-input.md` — contract after review
- Pointers: `docs/README.md`, `docs/roadmap.md`, `docs/product/spec.md`,
  `docs/architecture/overview.md`, `docs/domain/glossary.md`,
  `docs/ux/workspace.md`, `docs/quality/test-strategy.md`
- `docs/handoffs/README.md` — this row

## Decisions

1. No new workspace package. `validateWorkbook` will live in
   `@opinion-simulator/core` so tests can run without Electron. A separate
   workbook package stays postponed.
2. Public seam `validateWorkbook({ bytes, fileName? })` accepted.
3. ZIP + SpreadsheetML, no formula engine, accepted.
4. Documentation and `ValidatedWorkbook` field order: shared human content
   first (`名稱`/`標題`, `背景描述`, `問題內容`, `材料全文`), then
   identifiers, then Persona occupancy. Excel column order is unchanged.
5. The imported document is a 1–30 Persona batch. Occupied Persona rows max
   30. An enabled batch names 1–30 enabled Personas. One enabled Persona is a
   valid batch of one. Sample-count 1–100 vs executable `1 | 3` is unchanged:
   the accepted template's `樣本數` 10 still imports with
   `SAMPLE_COUNT_NOT_EXECUTABLE`.
6. Mapping target remains `ValidatedWorkbook`, not `DraftState` and not a
   Project write. Collections ordered Source → Question Set → Personas →
   batches.
7. Credential-shaped column names rejected; cell text not scanned.

## Verification

- Local links in the modified canonical documents resolve
- Full suites: 64 JavaScript tests and 24 Python Skill tests passed
- No live provider calls. No credentials read, written, or exposed.

## Cleanup and repository notes

- The test-generated Vite cache was moved reversibly to
  `需刪除/v03-workbook-importer-spec-revision-2026-08-31/.vite-after-spec-revision/`.
- No Git command was performed.

## Risks and open questions

- The review template's Excel columns still start with ids. Import keys off
  header names, so that is not a contract break. A later template edit can
  match the documentation order if wanted.
- The 1–30 Persona cap is tighter than the template's 100 paste-ready Persona
  rows. Extra empty rows remain skippable; a 31st occupied Persona fails.
- v0.2 increments 1–7 remain uncommitted. This task did not commit them.

## Next actions

1. User confirmation that this revision matches the review answers.
2. If yes: TDD `validateWorkbook` in `packages/core`.
3. Last-Project memory and Desktop file chooser stay in a later slice of
   v0.3 increment 1.

## Important commands

```text
npm test
```

## Suggested skills

- `tdd` once implementation is authorized
