# Architecture overview (reconstructed summary)

## Processes and packages

- `.agents/skills/opinion-simulator/scripts/opinion_simulator.py` — deterministic
  Python CLI (stdlib only): `render-preflight`, `build-project`,
  `validate-project`, `render-synthesis-preflight`, `build-synthesis-project`.
- `packages/core` — hashing, canonical JSON, Persona confirmation, plan/preflight,
  report rendering, IPC channel allow-list names, and the v0.3 read-only
  `validateWorkbook` (bytes in, `ValidatedWorkbook` out). No separate workbook
  package.
- `packages/project-store` — Project writing and snapshot reading. New Projects
  are staged then published into an absent or empty directory. An existing valid
  Project receives appended Runs (next-sequence artifacts + atomic index
  updates) and never has files deleted or overwritten. A hidden append journal
  makes interrupted appends recoverable without repeating a provider call. A
  non-empty directory that is not fully checksum- and schema-valid is refused.
- `packages/providers-gemini` — mock adapter plus opt-in live Gemini client
- `packages/providers-openai` — opt-in live OpenAI chat-completions client (v0.2 increment 2)
  resolved only in the Electron main process.
- `apps/desktop` — Electron shell: sandboxed Renderer, contextIsolation, CSP,
  denied navigation, IPC allow-list with credential-shaped key rejection on
  both request and response. `credential.status` returns availability, storage
  source, and a short one-way fingerprint, never the key. The reusable Persona
  library and the persistent Run queue live in Electron userData
  (`persona-library.json`, `run-queue.json`). Confirmed Persona Versions are
  copied into drafts.
  Restart resumes only Jobs whose Run artifact is still missing. A provider
  response is saved as a partial Job before Project publication, so a retry
  writes the stored response instead of calling a live provider again.

## Dependency direction

desktop → core, project-store, providers-gemini, providers-openai.
Providers depend only on core contracts. Python CLI depends only on published
schemas under `schemas/v0.0/`. Desktop Main reads a user-chosen `.xlsx` path
and calls `validateWorkbook` in core; Renderer does not parse `.xlsx` and
must not send file bytes over IPC.
