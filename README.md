# Opinion Simulator

> Reconstructed on 2026-08-24 after an accidental repository deletion destroyed
> the original file. Status summary below reflects the surviving artifacts.

An opinion simulator: a desktop research tool for predicting how a defined
Persona might respond to supplied material. Output is an **AI simulation
conditioned on the Persona and Source — not a real quote**.

## Status (2026-08-24)

- v0.0 Skill Prototype: the Python CLI under `.agents/skills/opinion-simulator/`
  was reconstructed after the deletion from the surviving 837-line public test
  suite and byte-exact golden fixtures; all 23 tests pass.
- The five real walkthrough Projects in [`examples/walkthroughs/`](examples/walkthroughs/)
  survived intact and revalidate as `valid`. Counted independent expert
  walkthroughs: 3 of 3–5 (lower bound).
- v0.1 Electron desktop tracer (`apps/desktop`) sources are restored verbatim
  where the session record allowed, otherwise rebuilt to contract. The Persona
  stage takes one free-form background input, Questions supports multiple
  entries, UI copy is consistent Traditional Chinese, and IPC errors surface in
  the status line.
- Live Gemini is opt-in; the credential is resolved only from the main-process
  environment (`GEMINI_API_KEY`), never stored in Projects or the Renderer.

## Safety principles

- **User-controlled personas:** AI may organize a draft, but unsupported facts
  stay unprovided and inferred fields require explicit confirmation.
- **Inspectable execution:** users review the exact outbound material and plan
  before any model call; a stale plan hash refuses execution.
- **Traceable results:** each immutable Run records versions, hashes, and raw
  provider responses without credentials.
- **Write protection:** Project writers require a nonexistent or empty target
  directory and never delete existing content.

## Development

```sh
npm test
npm run build
npm run start -w @opinion-simulator/desktop
python3 -B .agents/skills/opinion-simulator/scripts/opinion_simulator.py validate-project <project-dir>
```

Documentation index: `docs/README.md`; Project-example layout:
`examples/README.md`; task continuity: `docs/handoffs/README.md`.
