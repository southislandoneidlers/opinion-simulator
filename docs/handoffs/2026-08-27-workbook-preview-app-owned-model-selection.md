# Handoff: Workbook preview app-owned model selection

- Date: 2026-08-27
- Status: awaiting further user review
- Next task: continue collecting usability annotations before changing the
  canonical Project format, schemas, roadmap, or application implementation.

## Goal and result

Apply the user's review comment on `專案設定!A8`: model selection belongs in
the App and must not be managed as a Workbook input.

The updated review artifact is:

`outputs/2026-08-27-workbook-project-preview/Workbook-Project-易用性原型.xlsx`

## Workbook changes

- Removed `defaultModel` from `專案設定`.
- Removed the editable `模型` column from `執行佇列` and compacted the table
  from nine columns to eight.
- Updated `開始使用`, `專案設定`, and `執行佇列` guidance to state that the
  model is selected in the App.
- Preserved `Provider／模型` in `Run 歷史`; this is program-owned audit output
  recording what the App actually used, not a Workbook input.
- Intentionally retained `defaultProvider` and `defaultSampleCount` because the
  review comment only identified model selection as App-owned.

This remains a proposal artifact. No importer, exporter, canonical Project
format, schema, or desktop behavior was changed.

## Verification

- The exported Workbook re-imports successfully.
- `defaultModel` is absent from all input sheets.
- `執行佇列` no longer contains a model input column.
- App-owned model guidance is present and the Run-history audit field remains.
- Formula/error scan found no matches.
- All eight sheets received a final visual pass; layout, colors, tables, and
  dropdowns remain legible.
- Full suites pass: 63 JavaScript tests and 24 Python Skill tests.
- `git diff --check` passes.
- No live provider calls were made and no credentials were read, written, or
  exposed.

## Cleanup and repository notes

- Only the `.xlsx` review artifact remains under `outputs/`.
- Render and inspect support files were moved reversibly to
  `需刪除/workbook-preview-support-app-owned-model-2026-08-27/`.
- The test-generated Vite cache was moved reversibly to
  `需刪除/apps/desktop/node_modules/.vite-after-app-owned-model-review/`.
- No Git stage, commit, branch, or push was performed.
