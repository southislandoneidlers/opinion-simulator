# Architecture overview (reconstructed summary)

## Processes and packages

- `.agents/skills/opinion-simulator/scripts/opinion_simulator.py` — deterministic
  Python CLI (stdlib only): `render-preflight`, `build-project`,
  `validate-project`, `render-synthesis-preflight`, `build-synthesis-project`.
- `packages/core` — hashing, canonical JSON, Persona confirmation, plan/preflight,
  report rendering, IPC channel allow-list names.
- `packages/project-store` — atomic Project writing (staging + rename with an
  empty-target guard) and snapshot reading.
- `packages/providers-gemini` — mock adapter plus opt-in live Gemini client
  resolved only in the Electron main process.
- `apps/desktop` — Electron shell: sandboxed Renderer, contextIsolation, CSP,
  denied navigation, IPC allow-list with credential-shaped key rejection.

## Dependency direction

desktop → core, project-store, providers-gemini. Providers depend only on core
contracts. Python CLI depends only on published schemas under `schemas/v0.0/`.
