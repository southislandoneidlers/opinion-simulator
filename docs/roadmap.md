# Roadmap

Milestones are ordered tracer bullets. A later milestone may be planned in
detail, but implementation begins only after the previous milestone's exit
criteria pass.

> Restored verbatim from the session record on 2026-08-24 after accidental
> deletion. Content matches the last pre-incident revision plus the recovery
> note at the end.

## v0.0 — Skill Prototype

Status: deterministic pasted-text artifact tracer implemented on 2026-08-23;
the first real agent-host quick-mode expert walkthrough completed on
2026-08-24; the Direct Reaction and report-information-hierarchy increment
implemented on 2026-08-24; the same expert reran quick mode against the new
report on 2026-08-24 and judged the increment useful. Two additional proxied
independent-expert quick-mode walkthroughs completed on 2026-08-24, bringing
the counted total to three. Stability-context evaluation remains open.

Goal: validate the expert workflow and canonical file contracts at the lowest
cost before building the desktop shell.

Scope:

- repo-scoped Agent Skill with deterministic scripts;
- pasted-text Source;
- free-form Persona plus guarded AI organization and user confirmation;
- structured prompt preview and manual Preflight;
- one-Sample quick mode and three-Sample stability mode;
- append-only Persona organization and simulation Runs;
- structured JSON Result, raw response, comparison, and Markdown report;
- canonical Project directory, schema validation, hashes, and handoff;
- agent-host model initially; no direct BYOK provider adapter required.

Exit criteria:

- fixed example Projects validate deterministically;
- three to five domain-expert walkthroughs can complete the flow without hidden
  prompt editing;
- reviewers can distinguish stated Persona facts, accepted inferences, and
  missing fields;
- repeated-Sample comparison is useful without numeric confidence claims;
- every generated claim is traceable to Run, Persona Version, prompt, and
  Source hash;
- documented limits clearly exclude desktop security and distribution.

Current evidence covers deterministic schemas, hashes, Preflight invalidation,
1/3-Sample golden Projects, Result/source validation, exact-text Stability
Comparison, reports, negative safety cases, and four real agent-host Projects
in [`../examples/walkthroughs/`](../examples/walkthroughs/):
`agent-host-first` (walkthrough 1), `agent-host-rerun` (same-expert rerun,
uncounted), `expert-2`, and `expert-3` (proxied independent experts 2 and 3).
Counted expert walkthroughs are 3 of 3–5, the lower bound. Ratings for Direct
Reaction, provenance, full-Source opening, and Method-limits-by-reference were
useful across the counted set. Proxy mediation, hidden generative structuring,
stability-mode usefulness, and independent Sample contexts remain limits.

The selected-Result Synthesis CLI tracer produced
[`selected-result-synthesis`](../examples/walkthroughs/selected-result-synthesis/);
the user accepted that report before v0.1 work began.

### Recovery note (2026-08-24)

An accidental mass deletion destroyed the original Skill script, docs, and
desktop sources. The Skill CLI was rebuilt against the surviving test suite
and byte-exact golden fixtures; all tests pass and all five real Projects
revalidate as `valid`. The desktop sources were restored from the same-day
session record. See
[handoff: incident mass deletion and recovery](handoffs/2026-08-24-incident-mass-deletion-and-recovery.md).

## v0.1 — Desktop tracer bullet

Status: complete on 2026-08-24. The packaged dev build completed one mocked
and one opt-in live Gemini flow (`gemini-3.6-flash`) with valid artifacts and
clean secret scans; walkthrough evidence Projects were restored after a
user-initiated cleanup (see the incident and recovery handoffs).

Scope:

- create/open Project;
- pasted text;
- manually structured confirmed Persona;
- Gemini provider;
- one queued Run;
- structured Result and raw response;
- JSON and Markdown export;
- minimal staged navigation.

Exit criteria: a packaged development build completes one mocked and one local
opt-in live flow without credential or Project corruption.

## v0.2 — Secure multi-provider foundation

Status: increments 1–7 implemented in the working tree (Keychain, OpenAI,
prompt-section reordering, Persona library, non-empty Project append,
persistent queue, IPC hardening). Remaining v0.2 scope still listed below
(finalized open format/migrations) is not part of this tracer pass.

Scope:

- macOS Keychain and Windows Credential Manager;
- Gemini model selection plus OpenAI provider;
- prompt-section reordering: repeated/static sections first, per-Run content
  (Persona, questions, Source) last, for token savings and cache friendliness;
- reusable Persona library: pick previously confirmed Persona Versions instead
  of re-typing;
- non-empty Project directories: open an existing valid Project and append new
  Runs safely without ever deleting content;
- finalized open Project format and migrations;
- persistent queue, cancellation, resume, retry, and partial Results;
- full Electron IPC hardening.

Exit criteria: renderer secret-access tests fail safely; app restart resumes
only missing Jobs; Gemini/OpenAI contract suites pass without live CI calls.

## v0.3 — Material and Persona workflow

Status: completed in the working tree on 2026-09-03 and review-remediated the
same day. Local automated suites and the Desktop production build pass; no
live provider call or packaged GUI walkthrough was performed during the
remediation.

2026-09-07：使用者回報實測正常運作，並提出下一版五項改進。這是使用者回報，
未提供完整平台／provider／exit-criteria 測試矩陣；保留先前測試的驗證邊界。

### 中文現況（給人類閱讀）

v0.3 已串成可測試的完整本機流程：Excel 由 Main 驗證並匯入記憶體草稿；匯入不會
自動確認 Persona，使用者必須在 App 明確確認後，才能檢視綁定完整矩陣 hash 的
Preflight。可從 library 勾選 1–30 位已確認 Persona，每位各自排入可重試 Job/Run；
樣本數 3 會保存三份 Sample 並產生 exact-text Stability Comparison。Settings、
上次 Project/Workbook 記憶、檔案抽取與 grouped Results 也已接線。真實 provider
與打包 GUI 仍是本次未驗證的邊界，不應由本機 mocked 測試推論為已通過。

Entry gate satisfied on 2026-08-30: the user reviewed the five-sheet
fixed-format Workbook and accepted it as the v0.3 usability baseline. The
importer public contract was revised on 2026-08-31 in
[Workbook input format](formats/workbook-input.md) after user review
(`validateWorkbook` in core; 1–30 Personas per batch). Desktop Main now
chooses, validates, and imports a Workbook, remembers the last
Project/Workbook paths, and runs an approved multi-Persona batch without
rewriting existing immutable Run artifacts.

Goal: remove repeated setup on every launch and scale the existing
one-Source/one-Question-Set workflow from one Persona to 1–30 Personas
without weakening credential or Preflight controls.

Scope:

- read and independently validate the accepted five-sheet Workbook as the
  public editable input/management surface while immutable Run artifacts stay
  in a companion open-directory Project;
- remember the last successfully opened valid Project directory in app-data
  together with its Workbook path and attempt to reopen them on the next
  launch;
- if the remembered Project is missing, moved, or invalid, show a recoverable
  notice and directory chooser without creating, deleting, or overwriting
  anything;
- add one dedicated Settings stage for all provider credentials; remove the
  duplicate editable API-key forms from Overview and Execution, leaving only
  read-only status plus a link to Settings where useful;
- after a credential-store write succeeds, show an explicit "已安全儲存"
  acknowledgement. This confirms storage only, not that the provider has
  accepted the key;
- identify the currently selected provider credential without revealing it:
  show provider, storage source, an optional user-defined label, and a short
  one-way fingerprint calculated in Main. Never show the raw key, a copyable
  suffix, or a reveal control;
- PDF, DOCX, TXT, and Markdown extraction/preview;
- optional original-file inclusion;
- guarded AI Persona organization;
- Persona versions;
- select 1–30 confirmed Persona Versions for the same Source and
  Question Set;
- render one batch Preflight that lists every selected Persona and the total
  planned request count plus the explicitly non-billing token estimate before
  approval; the approval is bound to the exact matrix plan hash;
- execute and persist each Persona as an independently traceable Run/Job so a
  failed Persona can be retried without repeating completed Personas;
- group Results by Persona. Cross-Persona Synthesis remains an explicit,
  user-selected v0.4 action rather than an automatic group quotation;
- multi-Sample stability comparison.

Ordered tracer increments:

1. fixed-format Workbook validator/importer plus last-Project memory and safe
   startup recovery;
2. unified Settings plus credential save acknowledgement and safe identity;
3. file extraction and preview;
4. structured Persona/version workflow plus multi-Persona batch Preflight and
   queueing;
5. per-Persona multi-Sample stability comparison and grouped Results.

Exit criteria:

- valid Workbook fixtures map deterministically into 1–30 Persona batch
  drafts; 31 Personas, malformed, macro-enabled, oversized, credential-shaped,
  or formula-bearing user-input cells and external-link-dependent inputs fail
  safely without mutating a Project;
- restarting the App reopens the last valid Project, while a stale remembered
  path fails safely and remains user-recoverable;
- one credential editing surface exists, a successful secure-store write is
  acknowledged, and the displayed credential identity contains no recoverable
  key material in Renderer state, IPC, logs, or Project artifacts;
- a user can select at least two confirmed Personas, ask the same multiple
  questions about one Source, approve the exact complete request matrix, and
  receive separately traceable Results for each Persona;
- partial failure/retry never repeats completed Persona Runs;
- extraction fixtures, Persona inference controls, and repeated-run trace
  tests pass across supported platforms.

## v0.4 — Review, synthesis, and complete exports

Status: five usability improvements confirmed on 2026-09-07. Increments 1–4
implemented on 2026-09-08; increment 5 not started. See the canonical
[v0.4 使用回饋改進規格](product/v04-usability-improvements.md).

優先增量順序（先完成以下五項，再接續原有 Synthesis／匯出工作）：

1. 明顯的送出中／成功／失敗提示與 Main／queue 防止重複送出。**已完成（2026-09-08）**
2. Preflight 聲明勾選保留，與每次精確計畫的預覽／核准分離。**已完成（2026-09-08）**
3. 同次送出、同份材料的所有 Persona 意見在同頁比較，持久保存批次關聯。**已完成（2026-09-08）**
4. 可保存與重用單題／多題問題集的本機問題庫。**已完成（2026-09-08）**
5. 新請求以 OpenRouter 取代 OpenAI 直連，保留 Gemini 與舊 OpenAI 結果讀取。

Each increment must pass the linked specification's acceptance cases before
being marked complete. Existing v0.4 scope below remains scheduled afterward.

Scope:

- mandatory Preflight Review and request estimates;
- manual Result selection and traceable Synthesis;
- CSV and PDF export;
- real-person and unencrypted-export warning flows;
- manual redacted diagnostic bundle.

Exit criteria: synthesis attribution and all warning/confirmation E2E paths
pass; export inspection contains no secret or hidden data.

## v1.0 — Supported desktop release

Scope:

- signed/notarized Windows and macOS builds;
- `zh-TW` and English UI and complete guides;
- accessibility release gate;
- security, dependency, secret, artifact, and migration review;
- update notification linking to GitHub Releases;
- Apache-2.0 license/NOTICE and contribution documentation finalized.

Public-release blockers include legacy-key revocation/rotation, clean secret
scan, human review of Git history and artifacts, and a published private
security contact.

## v1.x candidates

- safely signed auto-update after threat review;
- additional local analysis and report templates;
- usability improvements informed by expert validation;
- optional persona-pack catalog without bundling packs into core.

## v2 requirements

- additional provider APIs and OpenAI-compatible endpoints;
- local model providers such as Ollama or LM Studio where maintainable;
- URL and cloud-document connectors with explicit outbound-data controls;
- possible DOCX export;
- community localization beyond `zh-TW` and English;
- optional richer multi-agent interaction engines.

Provider additions must use the provider-neutral adapter contract; they cannot
introduce secrets into Project files or Renderer state.
