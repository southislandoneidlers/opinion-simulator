# Security model (reconstructed summary)

## Assets and threats

Protected assets: user Source text, Persona content, generated results, API
credentials, Project integrity. Threats: secret leakage via logs/artifacts/
Renderer, tampering with Projects, destructive writers, unapproved outbound
calls.

## Controls

- Credentials only in macOS Keychain / Windows Credential Manager; v0.1 opt-in
  exception is a main-process environment variable read at call time. Renderer
  receives only a boolean availability flag.
- Renderer: sandbox on, nodeIntegration off, contextIsolation on, strict CSP,
  navigation and permissions denied, window.open denied.
- IPC: fixed channel allow-list; payload keys matching credential-shaped names
  are rejected.
- Integrity: SHA-256 checksums over all canonical files (dotfiles ignored),
  source text hashes, persona/template content hashes, plan hash approvals.
- Writers refuse non-empty targets and never delete existing content
  (added after the 2026-08-24 incident).
