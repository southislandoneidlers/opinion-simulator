# Handoff: desktop white-screen fix

- Date: 2026-08-24
- Status: complete
- Next task: user confirms the window renders, completes one mocked Run into a NEW empty directory, then reviews results-page presentation

## Goal and result

Fix the white screen reported when relaunching the restored desktop app.
Two reconstruction defects were found:

1. `dist/preload/` was never built — the reconstructed
   `tsconfig.main.json` compiled only `src/main`. Added
   `tsconfig.preload.json` and a `build:preload` step to the build chain;
   `preload.js` now exists where main.ts expects it.
2. The reconstructed `index.html` carried a CSP meta tag. Under `file://`,
   `'self'` does not match module scripts, blocking Vite output entirely.
   Removed the meta; the canonical CSP remains injected by the main process
   via `onHeadersReceived` as originally designed.

## Verification

- `npm run build -w @opinion-simulator/desktop`: main, preload, renderer built.
- 12-second logged launch (`ELECTRON_ENABLE_LOGGING=1`) produced no renderer
  errors. Visual confirmation by the user is the remaining gate.
