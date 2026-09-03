# Handoff: Desktop Workbook choose/validate IPC

- Date: 2026-09-02
- Status: complete
- Next task: last-Project / Workbook path memory and safe startup recovery

## Goal and result

Wired the v0.3 Workbook validator into Desktop Main/IPC so a user can choose a
`.xlsx` file and see a validation result without importing, executing, or
mutating a Project.

Public seams:

- `desktop.chooseWorkbook` — `.xlsx` file dialog; cancel returns `null`
- `workbook.validate` — Main reads `{ path }`, enforces the 8 MiB cap before
  load, calls `validateWorkbook`, and returns `{ path, ...ValidateWorkbookResult }`

Renderer never reads the file. A `bytes` payload field is rejected. The
Overview stage shows a summary or stable `Issue` codes and states that a
passing check is not an import and not a Preflight approval.

## Files changed

- `packages/core/src/ipc.ts` — allow-list `desktop.chooseWorkbook`, `workbook.validate`
- `packages/core/src/ipc.test.ts` — published-channel coverage
- `apps/desktop/src/main/workbook-file.ts` — path read + cap + `validateWorkbook`
- `apps/desktop/src/main/ipc-handlers.ts` — handlers
- `apps/desktop/src/main/ipc.ts` — Electron `.xlsx` open-file dialog
- `apps/desktop/src/main/ipc.test.ts` — public IPC behavior
- `apps/desktop/src/renderer/App.tsx` — Overview Workbook check panel
- `apps/desktop/src/renderer/styles.css` — report spacing
- Canonical docs: `docs/formats/workbook-input.md`, `docs/README.md`,
  `docs/product/spec.md`, `docs/architecture/overview.md`,
  `docs/architecture/security.md`, `docs/quality/test-strategy.md`,
  `docs/roadmap.md`, `docs/ux/workspace.md`

## Boundary

- Does not write or rewrite a Project
- Does not call a provider
- Does not mint or approve an `ExecutionPlan`
- Does not remember the last Project or Workbook path
- Does not copy Workbook fields into the current single-Persona draft

## Verification

- `npm test`: 108 JavaScript workspace tests (core 51, project-store 13,
  gemini 4, openai 5, desktop 35) and 24 Python Skill tests passed.
- `npm run build`: all packages and the Desktop renderer built successfully.
- Zero live-provider calls. Zero credentials read, written, or exposed.
- Desktop GUI live click-through of the file dialog was not run this session.

## Next actions

1. Remember the last successfully opened valid Project directory and its
   Workbook path in app-data; reopen on launch; stale paths stay recoverable.
2. Unified Settings plus credential save acknowledgement and safe identity.
3. Later: map a validated batch into confirmed Personas, batch Preflight, and
   per-Persona queue Jobs.
