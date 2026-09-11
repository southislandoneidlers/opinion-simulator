# Opinion Simulator

[中文說明](README.zh-TW.md)

A desktop research tool for predicting how a **confirmed Persona** might
respond to a supplied Source. The output is an **AI simulation — not a real
quote**.

## Why this exists

Many opinion-simulation setups are heavy: hosted platforms, extra accounts, or
a long pipeline before you can see what leaves the machine.

This project keeps the **research path** small:

- local desktop app and local Project files
- you bring your own model keys
- Preflight shows the exact outbound Source, Persona, questions, and model
  before any provider call
- each Persona stays separately attributable; results are never treated as a
  real interviewee's words

The **install path** is not small. You still need a Node.js development
environment, a local Electron build, and your own Gemini and/or OpenRouter API
keys. There is no signed installer yet.

## Current status (2026-09)

Desktop tracer through the v0.4 usability increments:

- import a Workbook (`.xlsx`) of 1–30 Personas, questions, and one Source
- confirm Personas before a run; reuse a local question library
- Preflight review; the prediction disclaimer is separate from plan approval
- visible submit status and protection against duplicate submits
- same-submission results compared on one page
- new requests go to Gemini directly or to OpenRouter; historical OpenAI runs
  stay readable
- credentials live in macOS Keychain or Windows Credential Manager, with an
  environment-variable fallback

Not in this tree yet: signed/notarized builds, CSV/PDF export, desktop
selected-result Synthesis, or a supported v1.0 release.

A Python Skill CLI remains for validating Project directories. It is a
prototype, not the primary UI.

## Safety

- Unsupported Persona facts stay unprovided; inferred fields need explicit
  confirmation.
- A stale Preflight plan hash refuses execution.
- Each immutable Run records versions, hashes, and raw provider responses
  without credentials.
- Writers never delete existing Project content. A non-empty directory that is
  not a valid Project is refused.

## Run locally

Developed with Node.js 22 on macOS. Clone, install, then build the desktop app:

```sh
git clone https://github.com/southislandoneidlers/opinion-simulator.git
cd opinion-simulator
npm install
npm test
npm run build
npm run start -w @opinion-simulator/desktop
```

Add keys in the in-app Settings stage, or export `GEMINI_API_KEY` /
`OPENROUTER_API_KEY` in the shell that launches Electron. Do not put keys in
Project files. `.env` is gitignored; `.env.example` is only a Gemini fallback
template.

Validate a Project directory with the Skill CLI:

```sh
python3 -B .agents/skills/opinion-simulator/scripts/opinion_simulator.py \
  validate-project <project-dir>
```

## Documentation

- [Documentation index](docs/README.md)
- [Product specification](docs/product/spec.md)
- [Examples](examples/README.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## License

Apache License 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
