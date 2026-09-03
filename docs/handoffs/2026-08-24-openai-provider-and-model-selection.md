# Handoff: v0.2 increment 2 — OpenAI provider + provider/model selection

- Date: 2026-08-24
- Status: complete
- Next task: v0.2 increment 3 — Prompt-section reordering (contract change; template version bump + golden fixtures)

## What was implemented

The desktop app can now run live simulations through OpenAI in addition to
Gemini, with provider and model selectable per draft.

- `packages/providers-openai` (new workspace): `liveOpenaiGenerate(plan, { apiKey })`
  against `https://api.openai.com/v1/chat/completions` with `response_format:
  json_object`; enforces the structured Result contract via `isStructuredResult`;
  returns a redacted `{ text, model }` envelope as the raw response, matching
  the Gemini path. Static prompt sections first, per-Run content last (same
  ordering decision recorded on 2026-08-24). No mock adapter yet — mocked runs
  remain the Gemini-shaped baseline.
- Core contract change: `ProviderId = "gemini" | "openai"` now flows through
  `ExecutionSettings` and `ExecutionPlan`. The v0.0 run-record JSON Schema's
  `provider` enum gained `"openai"` (backward compatible; old records still
  validate). Python validator reads the schema and passes provider values
  through unchanged.
- Preflight warning text updated: it no longer claims Keychain storage is a
  future milestone; it now states credentials stay out of UI/Project files
  and that live calls happen only after disclaimer acknowledgement.
- Credentials generalized: `credentials.ts` now resolves per provider
  (Keychain accounts `gemini-api-key` / `openai-api-key`, env fallbacks
  `GEMINI_API_KEY` / `OPENAI_API_KEY`). `credential.set` / `credential.clear`
  take a `provider` field validated by `isProviderId`; key value still travels
  under the neutral field name `value`.
- Session layer: drafts carry `provider` + `model` (`saveDraft` validates both;
  model must be non-blank, newline-free). Endpoint classes:
  `google-generativelanguage` / `openai-chat-completions`. New IPC channel
  `run.liveOpenai`; `run.liveGemini` kept. Mocked runs are still labelled
  gemini/mock regardless of selection.
- Renderer 執行 stage: provider dropdown (Google Gemini / OpenAI) and model
  dropdown plus a 自訂 free-text option; one Live Run button that routes to the
  selected provider's channel and shows its credential status. Settings card
  now shows one credential row per provider.

## Model lists (needs user confirmation later)

Curated lists are intentionally minimal pending confirmation of which models
to advertise: Gemini `gemini-3.6-flash` (default), OpenAI `gpt-4o-mini`
(default). The 自訂 option accepts any identifier, so nothing is blocked.

## Verification

- Full suites green: JS workspaces core 3 / project-store 2 / providers-gemini
  1 / providers-openai 5 / desktop 11 = 22 tests; Python Skill suite OK
  (root `npm test`).
- New tests cover: OpenAI request shape/auth/prompt ordering, env fallback,
  no-network without a credential, provider mismatch rejection, error and
  malformed-payload paths; per-provider Keychain storage; Preflight destination
  rendering for an openai draft; draft-seam rejection of unknown providers.
- Live-provider call status: no live call made this session (no real keys used).
- Secret exposure: none; fake constants only.

## Decisions and notes

- No new npm dependency; OpenAI client uses global fetch like Gemini.
- Root build/test scripts extended to include the new workspace.
- The three open questions from the 2026-08-24 plan remain open; add none.
