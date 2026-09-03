# Agent instructions

> Reconstructed on 2026-08-24 after an accidental repository deletion destroyed
> the original file. The workflow below matches the conventions recorded in
> `docs/handoffs/` and `docs/README.md`; exact original wording was lost.

## Starting a task

1. Read `docs/README.md` first. It is the entry point for people and agents.
2. Read the newest entry in `docs/handoffs/README.md` before doing anything.
3. State the task scope, then inspect the files you intend to change.

## During a task

- Follow the source-of-truth order recorded in `docs/README.md`. Do not resolve
  material document conflicts by guessing; record them and ask for a decision.
- Implement through public seams (CLI commands, IPC channels, published
  schemas). Tests target public behavior, not internals.
- When behavior changes, update the canonical contract documents in the same
  task, not later.
- Credentials belong only in macOS Keychain or Windows Credential Manager.
  Never place secrets in Project files, Renderer state, logs, or tests. The
  v0.1 opt-in exception is a main-process environment variable.
- Do not perform destructive filesystem operations outside explicitly created
  temporary directories. Writers never delete or overwrite existing content.
  A non-empty directory that is not a valid Project is refused. A valid
  Project may receive appended Runs with new ids; indexes update atomically.

## Ending a task

- Run the full suites: `npm test` (workspaces plus Python Skill suite).
- Append a new handoff under `docs/handoffs/` and add its row to that folder's
  `README.md`. Never rewrite an older handoff.
- Record what was verified, live-provider call status, and any secret exposure.
- No Git stage, commit, branch, or push without explicit user authorization;
  local commits for protective purposes require user consent as well.
