# Project format (reconstructed summary)

An open directory: `project.json`, `personas.json`, `sources/index.json`,
`sources/<sourceId>.txt`, `runs/<runId>.json`, `reports/<reportId>.md`,
`methodology.md`, `checksums.sha256`. Human-facing reports order: title,
disclaimer quote, Supplied context (persona label, questions, full Source),
Direct Reaction, Persona Recommendations, Structured analysis (position,
reasons, concerns, System Suggestions, assumptions/uncertainty, exact Source
mappings), Stability Comparison, Details referencing the Run record and
`methodology.md` by version and sha256. Full trace lives only in Run JSON.
Schemas under [`../../schemas/v0.0/`](../../schemas/v0.0/) are authoritative.
