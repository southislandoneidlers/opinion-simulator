# Handoff: v0.2 increment 5 — non-empty Project directories (append Runs)

- Date: 2026-08-25
- Status: complete
- Next task: v0.2 increment 6 — persistent queue, cancel/resume/retry

## User decision implemented (source-of-truth order 1)

Users may designate one folder as a project home. Appending new Runs must
work there; the empty-target-only guard was too strict.

## Question-set append semantics (resolved this increment)

Previously an open question. Resolved from existing append-only / never-delete
rules, not a new product fork:

- If the new Run's `title`, questions (in order), and `responseInstructions`
  exactly match an existing question set, that set's id is reused.
- Otherwise a new question set is appended; old sets stay.
- The same reuse-or-append rule applies to Source text (by sha256 / exact
  text) and Persona Versions (by id). Existing Run, Report, Source, Persona,
  and `methodology.md` files are never deleted or overwritten.

## What was implemented

- `packages/project-store`: `classifyWriteTarget`, `inspectProject`,
  `nextNumberedId`. `writeCompletedRun` now:
  - creates into an absent or empty directory (dotfiles such as `.DS_Store`
    are ignored and left in place);
  - appends into a valid Project (new run/report ids, atomic index + checksum
    updates via temp + rename);
  - refuses a non-empty directory that is not a valid Project.
- Desktop session: `openOrCreateDraft`; Preflight/Run allocate the next
  sequence ids from disk. Opening an existing Project hydrates the draft so
  a later Run appends.
- Renderer Overview: choosing an existing Project folder loads its Source /
  Persona / questions; Results notes the Run count when greater than one.
- Python Skill `build-project` remains create-only (refuses an existing
  output directory). Desktop is the append seam.

## Contract documents

- `docs/formats/project-format.md` (append-only Runs)
- `docs/architecture/overview.md`, `docs/architecture/security.md`
- `docs/ux/workspace.md`
- `AGENTS.md` writer rule

## Verification

- Full suites: JS 39 passed (core 5, project-store 9, gemini 1, openai 5,
  desktop 19); Python Skill 23 passed.
- Live-provider call status: none this session.
- Secret exposure: none.

## Notes

- No git operations performed.
- `packages/project-store` dist was rebuilt so desktop tests resolve the new
  public exports (`inspectProject`, `nextNumberedId`, …).
