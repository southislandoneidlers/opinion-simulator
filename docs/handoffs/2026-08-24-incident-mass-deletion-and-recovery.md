# Handoff: incident — accidental mass deletion and full recovery

- Date: 2026-08-24
- Status: complete
- Next task: user relaunches the desktop app, completes one mocked Run in the
  window (into a NEW empty directory), then reviews the results-page
  presentation; optionally one live Gemini Run with a process-level credential

## Incident

While testing the corrected desktop UI, the user clicked 模擬 Run after choosing
the repository root (`意見模擬器/`) as the Project directory. The v0.1 writer in
`packages/project-store` implemented write-by-delete-then-rename:
`rmSync(projectDirectory, { recursive: true })` ran against the repository root
and began deleting the entire repo, aborting only when it reached Electron's
internal `default_app.asar`. There was no Git history at that time.

The user explicitly recorded the rule: **mass deletion must never happen again
without explicit permission.**

## Damage assessment (verified)

Lost: `docs/`, `apps/`, `.agents/skills/`, `.walkthrough/`, root READMEs,
AGENTS.md, CONTRIBUTING.md, SECURITY.md, `.gitignore`, `.env.example`,
`node_modules/electron`.

Survived intact: all five walkthrough Projects (`測驗用` 6 content files,
others 7), `schemas/v0.0/` (all six), `tests/skill/` including the 837-line
suite and byte-exact golden fixtures, `packages/*` sources and dist, root
`package.json` / lockfile / `tsconfig.base.json`.

No backups existed: no Time Machine, no APFS local snapshots, no iCloud sync.

## Recovery

1. Protective `git init` + commit of surviving files BEFORE any reconstruction.
2. Verbatim restoration from the same-day session record: desktop main/preload
   session/ipc/main sources, App.tsx, session tests, mock provider, root
   package.json, docs index, roadmap, five handoffs.
3. Contract-guided re-authoring for files never read this session: preload,
   renderer entry/styles/configs, AGENTS.md, READMEs, doc stubs (marked
   *reconstructed*).
4. Full rebuild of `.agents/skills/opinion-simulator/scripts/opinion_simulator.py`
   (~900 lines) against the surviving public test suite and golden fixtures;
   hash formulas reverse-engineered and verified against known fixture values:
   - persona `contentHash` = sha256 of compact sorted JSON without `contentHash`;
   - `planHash` = sha256 of compact plan JSON without `planHash` and
     `preflightApproval`;
   - estimate = sum of rendered prompt-section character counts, tokens = ceil/4;
   - stability comparison ordering = field ascending then text ascending;
     source-mapping differences ordered by excerpt position in the Source.
5. Reinstalled node_modules (electron had been partially deleted).

## Root-cause fix (this task)

`packages/project-store/src/store.ts::writeCompletedRun` now refuses any target
that exists and is non-empty, cleans only its own staging directory, and never
deletes user content. A new test proves a sentinel file survives a refused
write. This guard is the permanent replacement for delete-then-rename.

## Known fidelity limits

- The default prompt-template definition text was lost; its published v0.0
  `contentHash` (`90505db8…`) is preserved as an explicit constant so existing
  Projects stay interpretable. If the original template definition ever
  resurfaces, re-hash and replace the constant.
- Documents marked *(reconstructed)* are faithful summaries, not verbatim
  originals.

## Verification

- `npm run build`: all four workspaces build.
- `npm test`: core 3, project-store 2, providers-gemini 1, desktop 3 passed;
  Python Skill suite 23 passed.
- Golden quick/stability builds match fixtures byte-for-byte (`tree_bytes`
  equality inside the suite).
- All five real Projects revalidate `valid` via `validate-project`.

## Decisions

- Reconstruction proceeds from the test suite as the behavioral spec; where
  tests and lost prose conflicted, tests win.
- Every restored-but-not-verbatim document is labeled as reconstructed.
- No deletion of anything was performed during recovery beyond temporary
  directories created by the tools themselves.

## Next actions

1. User completes one mocked Run in the relaunched app into a new empty directory.
2. Results-page presentation increment (PDF readiness) per the deferred decision.
3. Optional live Gemini run; then v0.2 Keychain / persistent queue.
4. Keep making protective commits at every task boundary.

## Important commands

```sh
python3 -B .agents/skills/opinion-simulator/scripts/opinion_simulator.py validate-project 測驗用
npm test
```

## Suggested skills

- `tdd` — all further behavior changes start from failing public tests.
