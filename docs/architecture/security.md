# Security model (reconstructed summary)

## Assets and threats

Protected assets: user Source text, Persona content, generated results, API
credentials, Project integrity. Threats: secret leakage via logs/artifacts/
Renderer, tampering with Projects, destructive writers, unapproved outbound
calls.

## Controls

Planned v0.4 changes are defined in
[v0.4 使用回饋改進規格](../product/v04-usability-improvements.md): isolate
OpenRouter credentials and destination from legacy OpenAI, preserve exact-plan
approval independently of disclaimer acknowledgement, and deduplicate submission
intents in Main/queue. These controls are requirements, not current guarantees.

- Credentials only in macOS Keychain / Windows Credential Manager; the v0.1
  opt-in exception (a main-process environment variable) remains as fallback.
  The desktop main process uses Keytar's native credential-store bridge
  (`opinion-simulator`, accounts `gemini-api-key` / `openai-api-key`) and
  never puts a key in a command-line argument. Resolution is credential store
  first, then `GEMINI_API_KEY` / `OPENAI_API_KEY`. Renderer receives only
  per-provider availability flags, source labels ("keychain" | "env" | null),
  and a short one-way fingerprint, never the value. The value crosses exactly
  one seam: from the credentials module to a provider call in the main process;
  provider packages never read `process.env`.
- Renderer: sandbox on, nodeIntegration off, contextIsolation on, strict CSP,
  navigation and permissions denied, window.open denied.
- IPC: fixed channel allow-list; credential-shaped *keys* on both request
  payloads and responses are rejected (`dispatchIpc` in `@opinion-simulator/core`).
  Published non-secret measurement fields that mention token counts are allowed
  only by exact key name; unknown credential-shaped keys still fail closed.
  Non-object payloads are rejected. There is no channel that returns a raw key.
  `credential.set` accepts the value only under the neutral field `value`.
  `workbook.validate` accepts only a filesystem `path`; Renderer-supplied
  `bytes` are rejected. Main enforces the 8 MiB file cap before reading.
- Integrity: opening or appending requires a complete checksum manifest,
  v0.0 document-shape checks, source/persona/plan-hash verification, and
  referenced Run/Report files. Root-level user notes may be incorporated on
  the next append only when every previously tracked artifact still matches.
  A hidden append journal records exact pending artifacts so an interrupted
  append can be resumed without a second provider call.
- Writers never delete or overwrite existing content (added after the
  2026-08-24 incident). A non-empty directory that is not a valid Project is
  refused. A valid Project may receive appended Runs; new artifacts get new
  ids, and `project.json` / checksums are updated in place via temp + rename.

## v0.3 credential identity UI

Implemented in the dedicated Settings stage:

- Main derives a short one-way SHA-256 fingerprint (8 hex characters) from the
  resolved key and returns only that fingerprint, provider, storage source,
  and availability to Renderer. Optional user-defined labels are still pending.
- Renderer never receives the raw key, a copyable key suffix, or a reveal
  capability. The identity metadata is not written to Project artifacts or
  logs.
- "已安全儲存" means the OS credential-store write succeeded. It does not claim
  that the provider accepted the key. `verifiedByUse` becomes true only after
  an actual request succeeds for the same one-way credential fingerprint.
- Remembered Project paths and non-secret credential labels live in app-data;
  losing or corrupting that convenience state must not mutate a Project.
