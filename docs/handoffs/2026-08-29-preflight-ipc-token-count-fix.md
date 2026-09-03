# Handoff: Preflight IPC token-count false-positive fix

- Date: 2026-08-29
- Status: complete; manual GUI confirmation after restarting Electron remains
  available to the user
- Next task: restart the desktop App and repeat the reported Material-to-
  Preflight flow; continue Workbook usability review separately

## Goal and result

Fix the desktop failure:

`$.estimate.approximateInputTokensPerRequest is not allowed over IPC`

The IPC credential-key guard had treated the published non-secret Preflight
token-count estimate as if it were a credential because its key contains the
substring `token`. The dispatcher now permits that one published measurement
key by exact name. Unknown credential-shaped keys continue to fail closed.

## Changes

- `packages/core/src/ipc.ts`
  - Added an exact-name allow-list for
    `approximateInputTokensPerRequest`.
  - Retained the existing forbidden-key rule for all other `token`, API key,
    secret, password, authorization, cookie, and credential-shaped keys.
- `packages/core/src/ipc.test.ts`
  - Added a public-dispatcher regression test for a `preflight.render` response
    containing the published token-count estimate.
- `docs/architecture/security.md`
  - Recorded the exact-name exception and fail-closed boundary.
- `docs/quality/test-strategy.md`
  - Recorded the positive Preflight IPC regression case.

## TDD evidence

- Red: the new dispatcher test failed with the reported
  `$.estimate.approximateInputTokensPerRequest` error.
- Green: the same test passed after the exact-name exception; the existing
  credential request and response rejection tests also remained green.

## Verification

- Targeted core IPC suite: 4 tests passed.
- Full suites: 64 JavaScript tests and 24 Python Skill tests passed.
- Full workspace build passed.
- Renderer `tsc --noEmit` passed.
- The built `packages/core/dist/ipc.js` accepted the repository's real
  `golden-quick/preflight.json` through `dispatchIpc`.
- No live provider calls were made.
- No credentials were read, written, or exposed.

## Cleanup and repository notes

- The test-generated Vite cache was moved reversibly to
  `需刪除/apps/desktop/node_modules/.vite-after-ipc-preflight-fix-2026-08-29/`.
- No Git command was performed.
