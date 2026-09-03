# Handoff: reversible generated-artifact cleanup

- Date: 2026-08-26
- Status: complete
- Next task: the user may manually delete `需刪除/` when its staged contents
  are no longer wanted. Run `npm run build` to regenerate desktop output.

## Goal and result

Identify removable workspace artifacts conservatively and stage them in a
user-visible directory rather than permanently deleting them.

## Staged for manual deletion

`需刪除/` contains only 508 KB of generated or Finder-only content:

- root `.DS_Store`;
- `apps/desktop/dist/`, which `npm run build` recreates;
- two `apps/desktop/node_modules/.vite*` Vitest/Vite caches, including the one
  regenerated during validation.

## Important classification result

The first classification treated all workspace `dist/` directories as
generated output. Full tests showed that `packages/*/dist/` are currently
required by workspace package export resolution. They were immediately moved
back before the successful validation run and are not staged for deletion.

All valid local Project directories, test fixtures, handoffs, source files,
and the 409 MB `node_modules/` tree (including Electron) were preserved.

## Verification

- Original staged paths are absent from the active workspace.
- Required package `dist/` paths were restored.
- Full suites pass: 63 JavaScript tests and 24 Python Skill tests.
- No live provider calls and no real credentials were read, written, or
  exposed.

## Notes

- No files were permanently deleted; the user controls final deletion by
  removing `需刪除/` manually.
- No Git stage, commit, branch, or push was performed.
