# Handoff: move README quote warning to the end

- Date: 2026-09-11
- Status: complete
- Scope: `README.md` and `README.zh-TW.md` only. No product behavior change.

## Decision

User asked to stop leading with the AI-quote warning and place it last.

## What changed

- Opening describes the tool only
- The "not a real quote" / 不是真實引言 note is the final section after License
- The early "never treated as a real interviewee's words" bullet was removed so
  the warning is not repeated near the top

## Verified

- `npm test` run as part of this task
- No live provider calls; no secrets added
