# Handoff: code-review remediation — security, integrity, recovery, and dependency audit

- Date: 2026-08-26
- Status: complete
- Next task: exercise the desktop application manually with a non-sensitive
  test credential before any real-provider release.

## Goal and result

Address the actionable findings from the repository code review without
changing the product's confirmed workflow: strict Preflight approval,
append-only Project Runs, local-first storage, and no secret exposure to the
Renderer or Project artifacts.

## What changed

- Credentials now use Keytar's native system credential store on macOS and
  Windows. The submitted secret is never placed in React state, IPC responses,
  process command-line arguments, logs, or Project files. Provider adapters
  receive an explicit key only; they do not read environment variables.
- A Preflight approval now includes the exact current `planHash`. Queueing
  rejects stale approval and the Run records the same approved plan.
- Provider catalog metadata has one Core source of truth. Prompt template v2
  keeps cacheable static text before source-specific material while preserving
  the documented v1 order for existing Runs. Python fixtures match the same
  contract.
- Project inspection now validates canonical schema shapes, source content
  hashes, complete checksum manifests, and Run/Report references. A user-added
  root note is preserved on a later append, but a modified or untracked Project
  artifact is refused.
- Publishing uses an append journal. If the provider result was received but
  publication was interrupted, the queue keeps a `partial` result and retry
  publishes it instead of calling the provider again. A subsequent write also
  recovers an interrupted journal safely.
- Removed an unused legacy helper that could create an invalid empty Project.
- Upgraded Electron, Vite, Vitest, and related lockfile entries; the full npm
  audit now reports zero known vulnerabilities. Vitest configuration files use
  ESM `.mts` files, removing the new-version configuration warning.

## Contract documents

- `docs/architecture/security.md`
- `docs/architecture/overview.md`
- `docs/formats/project-format.md`
- `docs/product/spec.md`

## Verification

- `npm run build` passed for all packages and the desktop renderer.
- `npm test` passed: 63 JavaScript tests and 24 Python Skill tests.
- `npx tsc --noEmit -p apps/desktop/tsconfig.renderer.json` passed.
- `git diff --check` passed.
- `npm audit --json` reported 0 vulnerabilities (including 0 critical/high).
- Live-provider call status: none this task.
- Secret exposure: none; no real credential was read, printed, or written.

## Notes

- No Git stage, commit, branch, or push was performed.
- Existing working-tree changes from prior agents, including `.DS_Store`, were
  preserved and not reverted.
