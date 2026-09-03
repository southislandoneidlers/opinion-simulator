# Handoff: Workbook preview bulk sample count

- Date: 2026-08-27
- Status: awaiting further user review
- Next task: continue collecting Workbook usability feedback, then define the
  canonical App-side limit, queue behavior, cost warning, and provider-call
  policy before implementing broader sample counts.

## Goal and result

Apply the user's review comment that generating only one or three opinions is
too restrictive and that one execution must support more opinions.

The updated review artifact is:

`outputs/2026-08-27-workbook-project-preview/Workbook-Project-易用性原型.xlsx`

## Workbook changes

- Changed `defaultSampleCount` from a `1`/`3` list to an integer input between
  `1` and `100`.
- Changed the `執行佇列` sample-count column to the same integer validation.
- Changed both sample values from `1` to `10` so the preview demonstrates
  multi-opinion generation directly.
- Updated `開始使用`, `專案設定`, and `執行佇列` guidance to explain the
  `1–100` range and warn that larger counts increase time and API cost.
- Preserved the Preflight confirmation requirement for every execution plan.

## Important implementation boundary

This is still a usability proposal only. The current deterministic v0.0 Skill
and existing application contracts support exactly one or three Samples. No
App, CLI, schema, canonical Project format, queue, provider, or cost-control
behavior was changed in this task.

The user preference for broader sample counts is now recorded explicitly. The
implementation task must reconcile it with provider rate limits, sequential or
bounded-concurrent execution, cancellation/resume, cost disclosure, and the
rule that changing sample count invalidates the current Preflight approval.

## Verification

- The exported Workbook re-imports successfully.
- The default and example sample counts are both `10`.
- Both sample-count inputs validate whole numbers from `1` through `100`.
- The former `1`/`3` list validation is absent.
- Formula/error scan found no matches.
- All eight sheets received a final visual pass; the longer guidance remains
  legible and no existing layout was clipped.
- Full suites pass: 63 JavaScript tests and 24 Python Skill tests.
- `git diff --check` passes.
- No live provider calls were made and no credentials were read, written, or
  exposed.

## Cleanup and repository notes

- Only the `.xlsx` review artifact remains under `outputs/`.
- Render and inspect support files were moved reversibly to
  `需刪除/workbook-preview-support-sample-count-2026-08-27/`.
- The test-generated Vite cache was moved reversibly to
  `需刪除/apps/desktop/node_modules/.vite-after-sample-count-review/`.
- No Git stage, commit, branch, or push was performed.
