# Handoff: v0.3 usability feedback plan

- Date: 2026-08-29
- Status: planning complete; implementation not started
- Next task: after the user requests implementation, begin v0.3 increment 1
  (last-Project memory and safe startup recovery), then implement the unified
  Settings/credential UX as increment 2

## Goal and result

Record five findings from the user's completed desktop test as accepted v0.3
scope and turn them into ordered, verifiable product constraints.

The existing v0.3 Roadmap did not explicitly include multiple responders. It
now includes a Simulation Batch that applies one Source and one multi-question
Question Set to one or more confirmed Persona Versions.

## Accepted v0.3 decisions

1. Remember the last successfully opened valid Project directory and attempt
   to reopen it on App startup. A stale path must fail safely without creating,
   deleting, or overwriting content.
2. Show an immediate "已安全儲存" acknowledgement after an OS credential-store
   write succeeds. This is not presented as proof that the provider accepted
   the key.
3. Identify the active key without exposing it: provider, storage source,
   optional user label, and a short one-way fingerprint computed in Main. No
   raw key, copyable suffix, or reveal control reaches Renderer.
4. Consolidate all editable provider-key controls into one Settings stage.
   Overview and Execution may show read-only status and a Settings link only.
5. Support one-or-more-Persona Simulation Batches. Preflight lists the complete
   Persona × Sample request matrix and binds approval to its exact plan hash;
   every Persona remains an independent Run/Job and Result with isolated retry
   and trace behavior.

## Scope boundaries

- Cross-Persona Synthesis remains a user-selected v0.4 feature; v0.3 does not
  automatically create a group opinion or group quotation.
- The previously reviewed Workbook remains a usability proposal awaiting its
  own final approval. This task did not silently turn it into v0.3 application
  implementation scope.
- This task changed planning documents only; no App behavior or schema changed.

## Canonical documents updated

- `docs/roadmap.md`: v0.3 goal, scope, ordered tracer increments, and exit
  criteria.
- `docs/product/spec.md`: confirmed planned usability decisions.
- `docs/ux/workspace.md`: startup, Settings, credential feedback, and
  multi-Persona interaction plan.
- `docs/architecture/security.md`: non-secret credential identity boundary.
- `docs/domain/glossary.md`: planned `Simulation Batch` term.

## Verification

- Full suites pass: 64 JavaScript tests and 24 Python Skill tests.
- Local links in all five modified canonical documents resolve.
- A whole-docs scan still reports three historical links in immutable 2026-08-24
  handoffs that use pre-relocation folder names. This is an existing documented
  condition: `2026-08-26-project-example-relocation.md` says older handoffs
  retain those historical names, so they were not rewritten.
- No live provider call was made.
- No credential was read, written, or exposed.

## Cleanup and repository notes

- The test-generated Vite cache was moved reversibly to
  `需刪除/apps/desktop/node_modules/.vite-after-v03-feedback-plan-2026-08-29/`.
- No Git command was performed.
