# Handoff: credential save receipt, mocked-then-live Run, clearer errors

- Date: 2026-09-02
- Status: complete
- Next task: last-Project / Workbook path memory and safe startup recovery

## Goal and result

Addressed three user-reported Desktop issues without expanding into the full
Settings stage or last-Project memory.

1. API key storage is now visible without revealing the key.
2. A mocked Run can be followed by a Live Gemini Run when the outbound
   content is unchanged.
3. Failures name the stage, the problem, and the next action.

## What changed

- `credential.status` / `credential.set` return `{ available, source, fingerprint }`.
  Fingerprint is 8 hex characters of SHA-256 over the trimmed key. Not a suffix.
- Settings card shows 「已安全儲存」receipt plus the fingerprint, and states that
  storage success is not provider acceptance.
- After a completed Run, the App re-renders Preflight. If Source / Persona /
  questions / provider / model are unchanged, the next enqueue uses the new
  runId hash. If those changed, the user is sent back to Preflight.
- Reusing the consumed hash still fails closed in Main:
  `【Preflight】上一筆 Run … 已完成`.
- User-facing errors are prefixed with `【階段】` and tell the user where to go.

## Files changed

- `apps/desktop/src/main/credentials.ts` and `credentials.test.ts`
- `apps/desktop/src/main/user-messages.ts` and `user-messages.test.ts`
- `apps/desktop/src/main/session.ts` and `session.test.ts`
- `apps/desktop/src/main/ipc-handlers.ts`, `ipc.ts`, `ipc.test.ts`
- `apps/desktop/src/renderer/App.tsx`, `styles.css`
- Canonical docs: security, UX, product spec, architecture overview, test strategy

## Verification

- `npm test`: 112 JavaScript workspace tests (core 51, project-store 13,
  gemini 4, openai 5, desktop 39) and 24 Python Skill tests passed.
- `npm run build`: all packages and the Desktop renderer built successfully.
- Zero live-provider calls this session. Zero credentials read from the real
  Keychain; tests use an in-memory fake store and a fake key constant.
- Desktop GUI live click-through was not run this session.

## Boundary

- Dedicated Settings stage is still pending; the editable key form remains on
  Overview and Execution.
- Optional user-defined credential labels and “verified by live use” status
  are still pending.
- Last-Project / Workbook path memory is still pending.
