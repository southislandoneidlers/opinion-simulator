# Workspace UX (partially reconstructed)

Freely navigable stages; gates enforce safety, not navigation order.

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

## Planned v0.3 workspace changes

- Overview can choose a `.xlsx` Workbook and show validation Issues or a batch
  summary. This check does not write a Project, call a provider, or create an
  ExecutionPlan.
- Startup attempts to reopen the last successfully opened valid Project. A
  stale remembered path keeps the App usable and presents a clear choose-
  another-folder action.
- Add one Settings stage as the only editable credential surface. Overview and
  Execution show compact read-only provider status and a Settings link instead
  of duplicate forms.
- After saving a key, keep a visible "已安全儲存" receipt on the settings card.
  Separately label whether the key has ever completed a provider request, so
  "stored" and "verified by use" are not confused. Provider verification after
  a live request is still pending.
- Credential identity uses provider + source + a non-reversible short
  fingerprint computed in Main; no raw value, reveal button, or copyable
  suffix appears. Optional user-defined labels are still pending.
- After a Run completes, the previous Preflight hash is consumed. The App
  refreshes Preflight for the next Run when the outbound content is unchanged,
  so a mocked Run can be followed by a Live Run without a stale-hash failure.
  If Source, Persona, questions, provider, or model changed, the user is sent
  back to Preflight.
- Personas becomes a confirmed-Version multi-select of 1–30 people. Preflight
  presents every selected Persona, Sample count, and total request matrix;
  Results are grouped by Persona and retain per-Persona retry/trace controls.
