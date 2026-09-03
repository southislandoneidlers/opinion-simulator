# Agent handoffs

Every task that changes this repository must add a new, append-only handoff
before the task ends. Do not rewrite an older handoff to describe later work.

> Reconstruction note (2026-08-24): the original handoffs for 2026-08-23 and
> parts of 2026-08-24 were lost in an accidental deletion. Entries marked
> "restored" reproduce the session record; entries marked "summary
> reconstructed" preserve only their key outcomes.

| Date | Task | Status | Handoff |
|---|---|---|---|
| 2026-09-02 | Credential receipt, mocked-then-live Run, clearer errors | Complete | [2026-09-02-v03-run-credential-ux.md](2026-09-02-v03-run-credential-ux.md) |
| 2026-09-02 | Desktop Workbook choose/validate IPC | Complete | [2026-09-02-v03-workbook-validate-ipc.md](2026-09-02-v03-workbook-validate-ipc.md) |
| 2026-09-01 | Workbook 驗證器中文閱讀導覽 | 完成；不改變程式行為 | [2026-09-01-v03-workbook-validator-human-guide-zh-TW.md](2026-09-01-v03-workbook-validator-human-guide-zh-TW.md) |
| 2026-09-01 | Workbook validator review fixes | Complete; 51 core tests | [2026-09-01-v03-workbook-validator-review-fixes.md](2026-09-01-v03-workbook-validator-review-fixes.md) |
| 2026-09-01 | Implement `validateWorkbook` in `@opinion-simulator/core` | Complete with 46 unit tests | [2026-09-01-v03-validate-workbook-core.md](2026-09-01-v03-validate-workbook-core.md) |
| 2026-08-31 | Drop Workbook sample-count executability warning | Spec + template updated; no parser | [2026-08-31-v03-workbook-drop-sample-warning.md](2026-08-31-v03-workbook-drop-sample-warning.md) |
| 2026-08-31 | v0.3 Workbook importer spec revision | User review applied; no parser | [2026-08-31-v03-workbook-importer-spec-revision.md](2026-08-31-v03-workbook-importer-spec-revision.md) |
| 2026-08-31 | v0.3 Workbook importer specification | Draft awaiting user review; no parser | [2026-08-31-v03-workbook-importer-spec.md](2026-08-31-v03-workbook-importer-spec.md) |
| 2026-08-30 | v0.3 Workbook baseline accepted | Format decision complete; implementation not started | [2026-08-30-v03-workbook-baseline-accepted.md](2026-08-30-v03-workbook-baseline-accepted.md) |
| 2026-08-29 | v0.3 Workbook simple-template decision gate | Awaiting user review; v0.3 waits for format decision | [2026-08-29-v03-workbook-simple-template.md](2026-08-29-v03-workbook-simple-template.md) |
| 2026-08-29 | v0.3 usability feedback plan | Planning complete; implementation not started | [2026-08-29-v03-usability-feedback-plan.md](2026-08-29-v03-usability-feedback-plan.md) |
| 2026-08-29 | Preflight IPC token-count false-positive fix | Complete; manual GUI confirmation available | [2026-08-29-preflight-ipc-token-count-fix.md](2026-08-29-preflight-ipc-token-count-fix.md) |
| 2026-08-27 | Workbook preview: Persona enablement | Awaiting further user review | [2026-08-27-workbook-preview-persona-enablement.md](2026-08-27-workbook-preview-persona-enablement.md) |
| 2026-08-27 | Workbook preview: bulk sample count | Awaiting further user review | [2026-08-27-workbook-preview-bulk-sample-count.md](2026-08-27-workbook-preview-bulk-sample-count.md) |
| 2026-08-27 | Workbook preview: model selection moved to App | Awaiting further user review | [2026-08-27-workbook-preview-app-owned-model-selection.md](2026-08-27-workbook-preview-app-owned-model-selection.md) |
| 2026-08-27 | Workbook Project usability preview | Awaiting user review | [2026-08-27-workbook-project-usability-preview.md](2026-08-27-workbook-project-usability-preview.md) |
| 2026-08-26 | Project-example relocation and test-fixture boundary | Complete | [2026-08-26-project-example-relocation.md](2026-08-26-project-example-relocation.md) |
| 2026-08-26 | Reversible generated-artifact cleanup | Complete | [2026-08-26-reversible-generated-artifact-cleanup.md](2026-08-26-reversible-generated-artifact-cleanup.md) |
| 2026-08-26 | Electron runtime repair and macOS 26 launch diagnosis | Complete with OS-level GUI verification pending | [2026-08-26-electron-runtime-repair.md](2026-08-26-electron-runtime-repair.md) |
| 2026-08-26 | Code-review remediation: security, integrity, recovery, and dependency audit | Complete | [2026-08-26-code-review-remediation.md](2026-08-26-code-review-remediation.md) |
| 2026-08-25 | v0.2 increment 7: IPC hardening + secret-access tests | Complete | [2026-08-25-ipc-hardening.md](2026-08-25-ipc-hardening.md) |
| 2026-08-25 | v0.2 increment 6: persistent queue, cancel/resume/retry | Complete | [2026-08-25-persistent-run-queue.md](2026-08-25-persistent-run-queue.md) |
| 2026-08-25 | v0.2 increment 5: non-empty Project directories (append Runs) | Complete | [2026-08-25-non-empty-project-append.md](2026-08-25-non-empty-project-append.md) |
| 2026-08-24 | v0.2 increment 4: reusable Persona library | Complete | [2026-08-24-persona-library.md](2026-08-24-persona-library.md) |
| 2026-08-24 | v0.2 increment 3: Prompt-section reordering (template v2) | Complete | [2026-08-24-prompt-section-reordering.md](2026-08-24-prompt-section-reordering.md) |
| 2026-08-24 | OpenAI default model set to gpt-5.6-luna | Complete | [2026-08-24-openai-default-model-gpt56-luna.md](2026-08-24-openai-default-model-gpt56-luna.md) |
| 2026-08-24 | v0.2 increment 2: OpenAI provider + provider/model selection | Complete | [2026-08-24-openai-provider-and-model-selection.md](2026-08-24-openai-provider-and-model-selection.md) |
| 2026-08-24 | v0.2 increment 1: Keychain credential storage | Complete | [2026-08-24-keychain-credential-storage.md](2026-08-24-keychain-credential-storage.md) |
| 2026-08-24 | v0.1 live flow complete; v0.2 plan approved | Complete | [2026-08-24-v0.1-complete-v0.2-plan.md](2026-08-24-v0.1-complete-v0.2-plan.md) |
| 2026-08-24 | Preflight human-readable report | Complete | [2026-08-24-preflight-human-readable.md](2026-08-24-preflight-human-readable.md) |
| 2026-08-24 | Desktop asset base path fix | Complete | [2026-08-24-desktop-asset-base-fix.md](2026-08-24-desktop-asset-base-fix.md) |
| 2026-08-24 | Desktop white-screen fix | Complete | [2026-08-24-desktop-white-screen-fix.md](2026-08-24-desktop-white-screen-fix.md) |
| 2026-08-24 | Incident: mass deletion and recovery | Complete | [2026-08-24-incident-mass-deletion-and-recovery.md](2026-08-24-incident-mass-deletion-and-recovery.md) |
| 2026-08-24 | Desktop UX corrections after first GUI run | Complete (restored) | [2026-08-24-desktop-ux-corrections.md](2026-08-24-desktop-ux-corrections.md) |
| 2026-08-24 | v0.1 desktop tracer scaffold | Complete (restored) | [2026-08-24-v0.1-desktop-tracer.md](2026-08-24-v0.1-desktop-tracer.md) |
| 2026-08-24 | Selected-Result Synthesis tracer | Complete (restored) | [2026-08-24-selected-result-synthesis-tracer.md](2026-08-24-selected-result-synthesis-tracer.md) |
| 2026-08-24 | Independent expert walkthroughs 2 and 3 | Complete (summary reconstructed) | [2026-08-24-expert-2-and-3-walkthroughs.md](2026-08-24-expert-2-and-3-walkthroughs.md) |
| 2026-08-24 | Direct Reaction increment rerun walkthrough | Complete (restored) | [2026-08-24-direct-reaction-rerun-walkthrough.md](2026-08-24-direct-reaction-rerun-walkthrough.md) |
| 2026-08-24 | Direct Reaction and report information hierarchy | Complete (summary reconstructed) | [2026-08-24-direct-reaction-report-increment.md](2026-08-24-direct-reaction-report-increment.md) |
| 2026-08-24 | First real agent-host expert walkthrough | Complete (restored) | [2026-08-24-first-agent-host-expert-walkthrough.md](2026-08-24-first-agent-host-expert-walkthrough.md) |
| 2026-08-23 | v0.0 deterministic Skill tracer | Complete (summary reconstructed) | [2026-08-23-v0.0-skill-tracer.md](2026-08-23-v0.0-skill-tracer.md) |
| 2026-08-23 | Pre-implementation Skill and open-source research | Complete (summary reconstructed) | [2026-08-23-preimplementation-research.md](2026-08-23-preimplementation-research.md) |
| 2026-08-23 | Documentation and agent-workflow foundation | Complete (summary reconstructed) | [2026-08-23-documentation-foundation.md](2026-08-23-documentation-foundation.md) |
