# Handoff: OpenAI default model set to gpt-5.6-luna

- Date: 2026-08-24
- Status: complete
- Follows: 2026-08-24-openai-provider-and-model-selection.md

## User decision (source-of-truth order 1)

The user directed that the default OpenAI model be **gpt-5.6-luna**, replacing
the provisional `gpt-4o-mini` from increment 2.

## Changes

- `apps/desktop/src/main/session.ts`: `DEFAULT_OPENAI_MODEL = "gpt-5.6-luna"`.
- `apps/desktop/src/renderer/App.tsx`: curated OpenAI model list and default
  updated to `gpt-5.6-luna`.

Test fixtures in `session.test.ts` and `providers-openai/live.test.ts`
intentionally keep `gpt-4o-mini` as an arbitrary identifier so non-default
model passthrough stays covered.

## Note

- The exact API identifier was recorded as `gpt-5.6-luna` (hyphenated, no
  space) following provider ID conventions; the user may correct the spelling.
  The 自訂 option already accepts any identifier, so live calls are not blocked
  either way.

## Verification

- Full JS suites green after rebuild (core 3 / project-store 2 / gemini 1 /
  openai 5 / desktop 11). No live call made; no secret exposure; no git ops.
