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

## Append-only Runs (v0.2 increment 5)

A directory that already holds a valid Project is a project home: later Runs
are appended, never written by replacing the folder. Existing Run, Report,
Source, Persona, and methodology files are never deleted or overwritten.
`project.json` lists grow by append (`runIds`, `reportIds`, `sourceIds`,
`currentPersonaVersionIds`, `questionSets`, `promptTemplateVersions`).
Optional `executionBatches` records each submit's `executionBatchId` and its
Run/Report ids; older Projects omit the field and remain valid. Checksums are
regenerated as a derived index. Existing Run JSON is never rewritten to add
batch membership.

## Integrity and interrupted appends

Desktop opens or appends only after checking the full checksum manifest,
authoritative v0.0 document shapes, Source hashes, Persona content hashes,
Execution Plan hashes, and every referenced Run/Report artifact. A missing or
changed tracked file makes the directory non-Project and it is refused without
rewriting it.

During any Project publication, Desktop creates a hidden transaction journal
before it writes new immutable artifacts. If the process stops mid-write,
retrying the same Run replays only the journal's byte-verified missing/index
artifacts and then regenerates checksums; it never makes another provider
request. Hidden files are excluded from the portable Project checksum manifest.
A user-created root-level note can be retained and incorporated into the next
manifest only when all previously tracked files still verify.

Question-set changes between Runs: if the new Run's title, questions (in
order), and `responseInstructions` exactly match an existing question set,
that set's id is reused. Otherwise a new question set is appended and the old
sets stay. The same reuse-or-append rule applies to Source text (by sha256)
and Persona Versions (by id). A non-empty directory that is not a valid
Project is still refused.

The Python Skill `build-project` command remains create-only (it refuses an
existing output directory) because it materializes a whole Project from a
workflow document. Desktop is the append seam.
