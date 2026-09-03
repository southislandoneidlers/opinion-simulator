# Handoff: Electron runtime repair and macOS 26 launch diagnosis

- Date: 2026-08-26
- Status: complete with OS-level GUI verification pending
- Next task: run the desktop launcher from an interactive Terminal session and
  investigate the macOS LaunchServices service only if it still aborts before
  application JavaScript starts.

## Goal and result

Repair the desktop launch failure after dependency upgrades, without touching
Project data, credentials, or unrelated packages.

## What changed

- Removed only the confirmed incomplete `node_modules/electron` directory and
  reinstalled the lockfile-pinned Electron `41.10.7` runtime from the official
  release. The archive passed Electron's SHA-256 validation.
- Restored `apps/desktop/package.json` dependency declarations to match the
  audited lockfile: Electron `^41.10.3` and `@vitejs/plugin-react` `^5.0.0`.
  `npm ls` now reports a consistent desktop dependency tree.

## Verification

- Electron package is `41.10.7`; its `dist/Electron.app` and `path.txt` exist.
- `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron` executes successfully,
  proving the reinstalled binary is loadable.
- Full suites pass: 63 JavaScript tests and 24 Python Skill tests.
- `npm run build`, Renderer type checking, and `git diff --check` pass.
- `npm audit --json` reports 0 vulnerabilities.
- No live provider calls and no real credentials were read or written.

## macOS 26 GUI boundary

- GUI-mode Electron launched from the agent's non-interactive process aborts
  before app JavaScript at `GetCurrentProcess -> NSApplication -> ElectronMain`.
  The generated crash stack matches Electron upstream issue #52815: macOS 26
  can abort Electron GUI startup when LaunchServices is unreachable.
- This is no longer the prior missing-Electron-install error. The agent's
  restricted process cannot inspect or restart the user's LaunchServices
  service, and should not attempt a system-service repair.
- Run `npm run start -w @opinion-simulator/desktop` in an interactive Terminal
  session. If it still aborts with `SIGABRT`, collect that exact output and
  address the macOS LaunchServices condition separately (for example, a normal
  reboot or OS-level diagnosis with the user's approval).

## Notes

- No Git stage, commit, branch, or push was performed.
- The repair deleted only the invalid local Electron runtime folder; it is not
  recoverable, but its verified replacement is now installed.
