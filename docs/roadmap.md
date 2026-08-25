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
Comparison, reports, negative safety cases, and four real agent-host Projects:
`測驗用` (walkthrough 1), `測驗用-複驗` (same-expert rerun, uncounted),
`測驗用-專家2`, and `測驗用-專家3` (proxied independent experts 2 and 3).
Counted expert walkthroughs are 3 of 3–5, the lower bound. Ratings for Direct
Reaction, provenance, full-Source opening, and Method-limits-by-reference were
useful across the counted set. Proxy mediation, hidden generative structuring,
stability-mode usefulness, and independent Sample contexts remain limits.

The selected-Result Synthesis CLI tracer produced `測驗用-綜整`; the user
accepted that report before v0.1 work began.

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

Status: planning approved by the user on 2026-08-24. Three user-requested
items were pulled into this milestone: prompt-section reordering for token
savings, a reusable Persona library, and non-empty Project directories
(append Runs into one folder).

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

Scope:

- PDF, DOCX, TXT, and Markdown extraction/preview;
- optional original-file inclusion;
- guarded AI Persona organization;
- Persona versions;
- multi-Sample stability comparison.

Exit criteria: extraction fixtures, Persona inference controls, and repeated-run
trace tests pass across supported platforms.

## v0.4 — Review, synthesis, and complete exports

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
