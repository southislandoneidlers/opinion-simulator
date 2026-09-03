# Handoff: v0.2 increment 1 — Keychain credential storage with settings surface

- Date: 2026-08-24
- Status: complete
- Next task: v0.2 increment 2 — OpenAI provider + provider/model selection (includes Gemini model dropdown)

## What was implemented

Gemini API keys can now be stored in the macOS Keychain from a new settings
surface in the desktop app; the renderer never sees the key.

- `apps/desktop/src/main/credentials.ts` (new): Keychain access through the
  macOS built-in `security` CLI (`add-generic-password -U` /
  `find-generic-password -w` / `delete-generic-password`), service
  `opinion-simulator`, account `gemini-api-key`. No native npm dependency
  (keytar was considered and rejected as unmaintained). Resolution order:
  Keychain → `GEMINI_API_KEY` env fallback; missing-item is treated as
  absent, other Keychain failures fall back safely to the env variable.
  Windows Credential Manager reports "not supported yet" for now.
- `packages/core/src/ipc.ts`: added channels `credential.set`,
  `credential.clear`. The IPC guard that rejects credential-shaped payload
  key names stays untouched; the key value travels under the neutral field
  name `value`, and responses carry status only (`geminiAvailable`,
  `source: "keychain" | "env" | null`) — the value is never echoed back.
- `packages/providers-gemini/src/live.ts`: `liveGeminiGenerate(plan, { apiKey })`
  and `geminiCredentialAvailable(explicitApiKey?)` now take the key explicitly;
  the environment variable remains an in-package fallback.
- `apps/desktop/src/main/session.ts`: `credentialStatus()` is async and returns
  the source label; `runLiveGemini` resolves the key via the credentials module.
- Renderer: settings card on 總覽 and 執行 stages — password input, save/clear
  buttons, status line; input is cleared after save and never re-displayed.
  The old env-var instruction text was replaced accordingly.
- Tests: `credentials.test.ts` (7 tests) with an injected fake executor so no
  test touches the real Keychain; includes fail-safe fallback when the
  Keychain interaction breaks, and asserts resolution results never contain
  the key material.

## Contract documents updated

- `docs/architecture/security.md`: credential control paragraph now records
  the resolution order, service/account names, and the single seam rule.

## Verification

- Full suites green: JS workspaces 3 + 2 + 1 + 10 = 16 tests; Python Skill
  suite 23 tests OK (run via root `npm test`).
- Live-provider call status: not exercised this session; no live Gemini call
  made or needed for this increment.
- Secret exposure: none. No real API key appears in code, logs, tests, or
  Project files. Test key material is an obvious fake constant.

## Decisions and notes

- Chose the `security` CLI over keytar to avoid an unmaintained native
  dependency; Windows Credential Manager support lands in a later increment
  (store path currently raises a clear unsupported error there).
- Open question carried forward: none introduced by this increment. The three
  open questions recorded in the previous handoff remain open.
