# Handoff: v0.2 increment 4 — reusable Persona library

- Date: 2026-08-24
- Status: complete
- Next task: v0.2 increment 5 — non-empty Project directories (append Runs)

## User decision implemented (source-of-truth order 1)

Hybrid storage (user-approved this session):

- App-data library file is the operational store
  (`<userData>/persona-library.json`).
- Explicit import copies a confirmed Persona Version out of any valid open
  Project. The open Project format remains the interchange/archive authority.
- Confirming a Persona Version auto-saves (default on; toggleable).
- Dedup by `contentHash`; never delete implicitly.

## What was implemented

- `apps/desktop/src/main/persona-library.ts` (new): load/save with atomic
  write (temp + rename); missing file = empty library; corrupt/unknown schema
  refused, never rewritten. Path is injected (`configureLibraryDirectory`);
  production wires Electron `userData` in `main.ts`.
- IPC channels: `persona.library.list`, `persona.library.setAutosave`,
  `persona.library.remove`, `persona.library.importFromProject`.
- `confirmDraftPersona` auto-saves after confirmation; a broken library file
  never blocks the draft flow.
- Renderer Persona stage: library list with 選用 / 移除, 從專案匯入, and the
  auto-save checkbox. 選用 copies `label` + `rawInput` into the draft form;
  the user still confirms to mint a new Persona Version.

## Contract documents

- `docs/formats/persona-library.md` (new)
- `docs/README.md` open-formats index
- `docs/architecture/overview.md` desktop bullet

## Verification

- Full suites to be run after this handoff is written; tests added:
  `persona-library.test.ts` (auto-save, dedup, toggle, remove, corrupt-file
  refusal) and session integration (confirm auto-saves; import from a written
  Project does not duplicate). Session tests configure a temp library dir so
  they never write to `~/.config`.
- Live-provider call status: none this session.
- Secret exposure: none. Library holds Persona content, not credentials.

## Notes

- No git operations performed.
- Remaining v0.2 open question: append semantics for question-set changes
  between Runs in one folder (increment 5).
