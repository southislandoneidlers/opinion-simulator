# Handoff: GitHub About description (current)

- Date: 2026-09-11
- Status: complete
- Scope: record GitHub-side metadata that was missing from earlier public-release
  handoffs. No product behavior change. Does not rewrite older handoffs.

## Why this note exists

`2026-09-11-github-public-release.md` recorded the repo URL, visibility, and
license files before the first push. Later README edits were recorded in
`2026-09-11-public-readme.md` and
`2026-09-11-readme-disclaimer-placement.md`. The GitHub **About** sidebar
description is not a git file; the quote-warning removal was done with a
GitHub API `PATCH` and was not written into a handoff at the time.

## Current GitHub state (verified 2026-09-11)

| Field | Value |
|---|---|
| URL | `https://github.com/southislandoneidlers/opinion-simulator` |
| Visibility | public |
| Default branch | `main` (local `origin/main` tracks this) |
| Detected license | Apache-2.0 |
| About description | `Desktop research tool for predicting how a confirmed Persona might respond to a supplied Source.` |

The About line no longer contains “AI simulation” or “not a real quote”.
That warning remains only at the end of `README.md` (`Disclaimer`) and
`README.zh-TW.md` (`說明`).

## Related published commits (already on `origin/main`)

- `8ef867c` Add Apache-2.0 LICENSE for the public GitHub release
- `f3c8d31` Rewrite public README for v0.4 visitors
- `937edae` Move the README quote warning to the end

The About `PATCH` itself has no git SHA.

## Verified

- GitHub search/API returned `private: false` and the description above
- No live provider calls
- No secrets added

## Live-provider call status

None.

## Secret exposure

None.
