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

Next-version decisions confirmed on 2026-09-07 are specified in
[v0.4 使用回饋改進規格](v04-usability-improvements.md). Increments 1–5 are implemented: visible submission status and Main-side
`submissionId` deduplication prevent duplicate jobs; disclaimer acknowledgement
is a Project-session flag separate from exact-plan preview and approval;
same-submission Results share one comparison page keyed by a persistent
execution batch; a local question library stores named questions for reuse;
OpenRouter replaces direct OpenAI for new requests while Gemini direct and
historical OpenAI reads are preserved.
Historical OpenAI artifacts remain readable and immutable.

- Persona fields need raw-input support or explicit per-inference acceptance;
  unsupported facts stay `not provided`.
- Every external model call requires a current Preflight approval keyed by the
  exact plan hash and Run id; stale approvals are rejected. The Desktop passes
  that hash across its run IPC channel and freezes it into queued Jobs.
- Quick mode uses exactly 1 Sample; stability mode uses 3 with an exact-text
  Stability Comparison that makes no numeric confidence claims.
- Synthesis is user-selected and fully attributed (`supportingSampleIds`);
  it is not a group quotation.
- Reports open with Supplied context then Direct Reaction; shared Method limits
  live in `methodology.md`; the prediction disclaimer stays visible.
- Legacy Projects with generic `recommendations` remain valid.

## Confirmed v0.3 usability decisions

- The accepted five-sheet `.xlsx` Workbook is the public editable input and
  management surface for Personas, Question Sets, Sources, and Simulation
  Batches. The App reads and validates it directly; immutable Runs and reports
  remain in a companion open-directory Project in the first v0.3 tracer. The
  `validateWorkbook` and the Desktop import contract live in
  [Workbook input format](../formats/workbook-input.md). Desktop Main can
  choose, validate, and import a `.xlsx` file into an in-memory draft; it also
  remembers the last Project/Workbook path in app-data.
  The imported document is a 1–30 Persona batch, not a single-Persona draft.
  Import does not confirm a Persona or write the Persona library. The user must
  explicitly confirm imported Personas; this preserves each Workbook
  `personaId` and mints only the Persona Version id.
- The App remembers the last valid Project directory in app-data and attempts
  to reopen it at startup. A missing or invalid path produces a recoverable
  notice; it never causes implicit creation, deletion, or overwrite.
- Provider credentials are edited in one dedicated Settings stage. Overview
  and Execution may show read-only availability/status and a navigation link,
  but must not duplicate the editable key form.
- A successful Keychain/Credential Manager write gets an immediate
  "已安全儲存" acknowledgement on the current settings card. Storage success
  must not be described as API validity; provider acceptance is shown only
  after a real provider request succeeds.
- The active credential is distinguishable by provider, storage source, and a
  short one-way fingerprint computed in Main. Optional user labels remain
  pending. Raw key material, a copyable suffix, and reveal controls never
  reach Renderer, Project files, logs, or reports.
- A simulation batch selects 1–30 confirmed Persona Versions for one Source
  and one multi-question Question Set. Preflight shows the complete Persona ×
  Sample request matrix. Each Persona remains an independently attributable
  Run/Job and Result; v0.3 does not automatically speak for the group or
  perform cross-Persona Synthesis.
- The Run action submits only the plan hash the user actually saw. It never
  silently generates and approves a fresh Preflight. Changed draft input makes
  Main reject the stale hash, and every later Run needs a newly viewed
  Preflight.
