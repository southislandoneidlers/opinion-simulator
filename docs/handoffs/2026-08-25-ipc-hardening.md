# Handoff: v0.2 increment 7 — IPC hardening + secret-access failure tests

- Date: 2026-08-25
- Status: complete
- Next task: remaining v0.2 items outside the seven-increment tracer
  (finalized open Project format / migrations). Queue/cancel/resume/retry and
  IPC hardening were the last planned increments.

## v0.2 exit criteria addressed

- Renderer secret-access tests fail safely (unknown channel, credential-shaped
  payload keys, no raw-key channel, `credential.status` never echoes the value).
- Restart resumes only missing Jobs (increment 6).
- Gemini/OpenAI contract suites pass without live CI calls.

## What was implemented

- `packages/core` `dispatchIpc` / `assertSafeIpcValue` / `FORBIDDEN_IPC_KEY`:
  allow-list channels only; payload must be an object; credential-shaped *keys*
  rejected on both request and response. String contents are not scanned.
- Desktop handlers extracted to `ipc-handlers.ts` so tests invoke the
  dispatcher without Electron.
- `apps/desktop/src/main/ipc.test.ts`: secret-access failure cases.

## Contract documents

- `docs/architecture/security.md`
- `docs/quality/test-strategy.md`
- `docs/roadmap.md` (v0.2 status)

## Verification

- Full suites: JS 50 passed (core 8, project-store 9, gemini 1, openai 5,
  desktop 27); Python Skill 23 passed.
- Live-provider call status: none this session.
- Secret exposure: none.

## Notes

- No git operations performed.
- v0.2 increments 1–7 are in the working tree and uncommitted, matching the
  earlier increments.
