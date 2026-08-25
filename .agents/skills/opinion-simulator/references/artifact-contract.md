# Artifact contract (reconstructed summary)

- Project layout, report order, run-record shape: see `docs/formats/`.
- Hashes are SHA-256 over compact canonical JSON (sorted keys) unless stated:
  persona contentHash excludes its own field; planHash excludes planHash and
  preflightApproval. File checksums hash raw bytes.
- The default prompt-template contentHash is preserved as a constant after the
  2026-08-24 recovery; see the incident handoff before changing it.
- Estimates are character-count heuristics (ceil(chars/4)), never billing data.
