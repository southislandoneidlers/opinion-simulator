# Handoff: desktop asset base path fix

- Date: 2026-08-24
- Status: complete
- Next task: user confirms the window renders, completes one mocked Run into a NEW empty directory

## Goal and result

The white screen persisted after the preload/CSP-meta fix. Root cause found:
the reconstructed `vite.config.ts` omitted `base`, so Vite emitted absolute
asset URLs (`src="/assets/index-*.js"`), which resolve to the filesystem root
under `file://` and never load.

## Fix

Added `base: "./"` to `apps/desktop/vite.config.ts`; built index.html now uses
relative `./assets/...` paths.

## Verification

Build output confirmed relative paths; 12-second logged launch showed no
renderer errors. Visual confirmation by the user is the remaining gate.
