# Documentation index

This index is the entry point for people and agents. Follow the canonical
document for the question at hand instead of copying its content elsewhere.

> Reconstruction note (2026-08-24): most documents under `docs/` were lost in
> an accidental repository deletion and are being restored. Entries marked
> *(reconstructed)* are faithful re-authorings from surviving records, not
> verbatim originals.

## Product

- [Product specification](product/spec.md) — canonical behavior, user stories,
  scope, implementation and testing decisions. *(reconstructed summary)*
- [Roadmap](roadmap.md) — ordered v0.0 through v2 delivery boundaries.
- [v0.4 使用回饋改進規格](product/v04-usability-improvements.md) — 2026-09-07
  五項已確認改進；增量 1–4 已於 2026-09-08 實作，OpenRouter 遷移尚未實作。
- [Workspace UX](ux/workspace.md) — freely navigable staged workflow and gates.
  *(partially reconstructed)*

## Domain and architecture

- [Domain glossary](domain/glossary.md) — canonical terminology.
  *(reconstructed core terms)*
- [Architecture overview](architecture/overview.md) — process, package, and
  dependency boundaries. *(reconstructed summary)*
- [Security model](architecture/security.md) — assets, threats, secrets, data
  flow, logging, and release gates. *(reconstructed summary)*
- [Test strategy](quality/test-strategy.md) — public seams and CI/live-test
  separation. *(reconstructed summary)*

## Open formats

- [Project format](formats/project-format.md)
- [Workbook input format](formats/workbook-input.md) — accepted v0.3 editable
  input/management baseline. Desktop Main validates and imports the fixed
  multi-Persona format into an in-memory draft; Workbook Personas retain their
  ids and require explicit App confirmation before Preflight. Approved batches
  execute as independent append-only Runs.
- [Persona schema](formats/persona-schema.md)
- [Persona library](formats/persona-library.md) — app-data reuse cache of confirmed Persona Versions
- [Question library](formats/question-library.md) — app-data reuse cache of named questions and question sets
- [Run record](formats/run-record.md)
- Machine-readable v0.0 JSON Schemas live under [`../schemas/v0.0/`](../schemas/v0.0/)
  and survived intact; they remain authoritative over prose summaries.

## Context and operations

- [Project examples](../examples/README.md) — preserved walkthrough evidence
  and desktop-flow baselines; they are distinct from automated test fixtures.
- [Agent handoffs](handoffs/README.md) — append-only task continuity.
- [Workbook 中文閱讀導覽](handoffs/2026-09-01-v03-workbook-validator-human-guide-zh-TW.md)
  — 給人類閱讀的目前成果、限制與下一步。

## Source-of-truth order

When documents conflict, use this order and repair the lower source:

1. Explicitly confirmed user decisions recorded in the current task handoff.
2. Product specification and format/security contracts.
3. Architecture and UX documents.
4. Roadmap and user guides.
5. README summaries.

Do not resolve a material conflict by guessing. Record it in the handoff and
request a decision.
