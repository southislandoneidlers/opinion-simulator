# Handoff: Workbook Project usability preview

- Date: 2026-08-27
- Status: awaiting user review
- Next task: collect the user's usability feedback before changing the
  canonical Project format, roadmap, schemas, or implementation.

## Goal and result

Create an operable `.xlsx` prototype so the user can evaluate whether a single
fixed-format workbook is simple enough for bulk input and management. This is
a proposal artifact only; the current open-directory Project format and
desktop code remain unchanged.

The review artifact is:

`outputs/2026-08-27-workbook-project-preview/Workbook-Project-易用性原型.xlsx`

## Workbook layout

- `開始使用`: five-step human workflow and editable/program-owned color key.
- `專案設定`: title, provider/model preference, sample count, and notes.
- `Persona`: one reusable Persona draft per row.
- `問題集`: ordered questions grouped by `questionSetId`.
- `材料`: one pasted-text Source per row.
- `執行佇列`: one Persona × Source × Question Set request per row.
- `Run 歷史`: proposed append-only program output area.
- `完整性`: visible explanation of the proposed import/security rules.

Yellow cells are user-editable; gray cells describe program-owned or validated
data. Sample rows and data-validation dropdowns are included for review.

## Decisions intentionally not made

- The workbook has not replaced the canonical Project directory.
- No importer, exporter, migration, hash, or signature implementation exists.
- The number of sheets, manual ids, long Source text in cells, and visible Run
  history remain usability questions for the user.

## Verification

- The exported workbook imports successfully with eight sheets and eight
  tables.
- Representative ranges on every sheet contain the intended values.
- Formula/error scan found no matches.
- Every sheet received a final visual pass; headings, examples, dropdowns,
  editable areas, and program-owned areas are legible and not clipped.
- Full suites pass: 63 JavaScript tests and 24 Python Skill tests.
- `git diff --check` passes.
- No live provider calls were made and no credentials were read, written, or
  exposed.

## Notes

- Only the `.xlsx` review artifact remains under `outputs/`; render and inspect
  support files were moved to `需刪除/workbook-preview-support-2026-08-27/`.
- No Git stage, commit, branch, or push was performed.
