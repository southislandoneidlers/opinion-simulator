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
- [Persona schema](formats/persona-schema.md)
- [Run record](formats/run-record.md)
- Machine-readable v0.0 JSON Schemas live under [`../schemas/v0.0/`](../schemas/v0.0/)
  and survived intact; they remain authoritative over prose summaries.

## Context and operations

- [Agent handoffs](handoffs/README.md) — append-only task continuity.

## Source-of-truth order

When documents conflict, use this order and repair the lower source:

1. Explicitly confirmed user decisions recorded in the current task handoff.
2. Product specification and format/security contracts.
3. Architecture and UX documents.
4. Roadmap and user guides.
5. README summaries.

Do not resolve a material conflict by guessing. Record it in the handoff and
request a decision.
