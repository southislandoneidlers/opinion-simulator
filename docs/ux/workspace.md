# Workspace UX (partially reconstructed)

Freely navigable stages; gates enforce safety, not navigation order.

Next version: [v0.4 使用回饋改進規格](../product/v04-usability-improvements.md)
defines the confirmed 2026-09-07 changes. Visible submission status and
Main-side duplicate-submit prevention are implemented. Batch comparison,
disclaimer retention, question reuse, and OpenRouter remain unimplemented.

Stages:

1. Overview — project identity, directory selection. An empty folder starts a
   new Project; an existing valid Project folder is opened and later Runs are
   appended there. A non-project non-empty folder is refused.
2. Materials — pasted Source (file ingestion comes later).
3. Personas — one free-form background textarea in v0.1; its whole confirmed
   text becomes the directly supported `roleAndContext` (no separate manual
   field, no inferences). Later milestones restore structured editing, guarded
   AI organization, direct-support mappings, inference review, and versions.
4. Questions — multiple entries forming the Question Set.
5. Preflight — rendered plan preview plus mandatory prediction-disclaimer
   acknowledgement before execution.
6. Execution — enqueue a mocked or live Job. Live requires main-process
   credentials. The queue persists in app-data; cancel and retry are explicit;
   a restart resumes only Jobs whose Run file is still missing.
7. Results — Direct Reaction first, then labelled recommendations, structured
   analysis, trace details. (Presentation revision pending user decision.)

## Implemented v0.3 workspace behavior

- Overview can choose a `.xlsx` Workbook and show validation Issues or a batch
  summary. Validation does not write a Project, call a provider, or create an
  ExecutionPlan. Import fills an in-memory draft; imported Personas remain
  unconfirmed until the user confirms them in the Persona stage.
- Startup attempts to reopen the last successfully opened valid Project. A
  stale remembered path keeps the App usable and presents a clear choose-
  another-folder action.
- Add one Settings stage as the only editable credential surface. Overview and
  Execution show compact read-only provider status and a Settings link instead
  of duplicate forms.
- After saving a key, keep a visible "已安全儲存" receipt on the settings card.
  Separately label whether the key has ever completed a provider request, so
  "stored" and "verified by use" are not confused. Verification is associated
  with the fingerprint of the credential that completed a live request and is
  cleared when that credential changes.
- Credential identity uses provider + source + a non-reversible short
  fingerprint computed in Main; no raw value, reveal button, or copyable
  suffix appears. Optional user-defined labels are still pending.
- The Run action uses only the displayed Preflight hash. If Source, Persona,
  questions, provider, model, or matrix changed, Main rejects it as stale.
  After every completed Run, the App clears the approval and requires a newly
  generated and reviewed Preflight for the next Run.
- Personas becomes a confirmed-Version multi-select of 1–30 people. Preflight
  presents every selected Persona, Sample count, and total request matrix;
  Results are grouped by Persona and retain per-Persona retry/trace controls.

## Implemented v0.4 increment 1 workspace behavior

- The Execution buttons send a Renderer-generated `submissionId`. A second
  click or parallel IPC with the same id returns the same Jobs; a new
  Preflight starts a new id.
- Status text appears next to the Run buttons (`送出中` / `已接受，已加入佇列` /
  `執行中` / `全部完成` / `部分失敗` / `送出失敗`) and is exposed to assistive
  technology. Buttons stay disabled while a submission is in flight.
- If the enqueue response is lost, the App queries `queue.submissionStatus`
  before creating another batch.
