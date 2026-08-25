# Product specification (reconstructed summary)

> Lost in the 2026-08-24 deletion; re-authored from surviving tests, fixtures,
> and handoff records. The original wording was more detailed; where this file
> and the test suite conflict, the tests win.

## Product

The Opinion Simulator predicts how a confirmed Persona might respond to a
supplied Source. Output is an AI simulation — never a real quote. The primary
human-facing output is a natural-language Direct Reaction, followed by labelled
Persona Recommendations and System Suggestions and structured analysis; full
trace stays in Run artifacts.

## Core rules

- Persona fields need raw-input support or explicit per-inference acceptance;
  unsupported facts stay `not provided`.
- Every external model call requires a current Preflight approval keyed by plan
  hash; stale approvals are rejected.
- Quick mode uses exactly 1 Sample; stability mode uses 3 with an exact-text
  Stability Comparison that makes no numeric confidence claims.
- Synthesis is user-selected and fully attributed (`supportingSampleIds`);
  it is not a group quotation.
- Reports open with Supplied context then Direct Reaction; shared Method limits
  live in `methodology.md`; the prediction disclaimer stays visible.
- Legacy Projects with generic `recommendations` remain valid.
