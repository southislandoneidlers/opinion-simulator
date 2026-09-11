# Handoff: public README rewrite

- Date: 2026-09-11
- Status: complete
- Scope: rewrite `README.md` and `README.zh-TW.md` for first-time GitHub
  visitors. No product behavior change.

## Confirmed user decisions

- GitHub landing page stays English (`README.md`); Chinese lives in
  `README.zh-TW.md` with cross-links
- Describe both a small research workflow and a non-small install path
- Full public-homepage rewrite: v0.4 status, aligned EN/ZH, updated run
  commands; accident-reconstruction notes stay out of the landing files

## What changed

- Positioning: local desktop, BYOK, inspectable Preflight; not a hosted
  platform and not a real quote
- Limits: Node.js + local Electron build + own Gemini/OpenRouter keys; no
  signed installer
- Status dated 2026-09 and aligned with implemented v0.4 usability increments
- Run instructions include OpenRouter env fallback and in-app Settings
- Documentation links point at spec, examples, contributing, and security
  instead of agent handoffs as the primary next click

## Verified

- Claims checked against `docs/product/spec.md`,
  `docs/product/v04-usability-improvements.md`, `docs/roadmap.md`, and
  `apps/desktop/package.json`
- `npm test` run as part of this task
- No live provider calls; no secrets added

## Live-provider call status

None.

## Secret exposure

None. README names only `GEMINI_API_KEY` and `OPENROUTER_API_KEY`.
