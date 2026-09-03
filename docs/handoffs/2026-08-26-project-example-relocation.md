# Handoff: Project-example relocation and test-fixture boundary

- Date: 2026-08-26
- Status: complete
- Next task: use the semantic paths under `examples/` for manual inspection;
  keep automated Skill tests rooted in `tests/skill/fixtures/v0.0/`.

## Goal and result

Organize the seven preserved valid Project directories without deleting their
content or changing their immutable artifacts. The repository root no longer
mixes historical walkthrough evidence and desktop baselines with source,
tests, and documentation.

## Current layout

- `examples/walkthroughs/` holds five historical Projects:
  `agent-host-first`, `agent-host-rerun`, `expert-2`, `expert-3`, and
  `selected-result-synthesis`.
- `examples/desktop-baselines/` holds the `mock` and opt-in `live` desktop-flow
  Projects.
- [`examples/README.md`](../../examples/README.md) maps every previous
  root-folder name to its current semantic path. Older handoffs retain the
  historic names and were not rewritten.

## Test boundary

`tests/skill/test_opinion_simulator.py` no longer validates a root walkthrough
directory. Deterministic tests continue to use the byte-exact golden fixtures
in `tests/skill/fixtures/v0.0/`; preserved examples remain independently
validated Project evidence rather than test dependencies.

## Verification

- All seven moved Projects pass `validate-project` with `status: valid`.
- Full suites pass: 63 JavaScript tests and 24 Python Skill tests.
- `git diff --check` passes.
- The 4 KB Vite cache recreated by test execution was moved to
  `需刪除/apps/desktop/node_modules/.vite-after-example-relocation/` for the
  user to remove manually if desired.
- No live provider calls were made and no credentials were read, written, or
  exposed.

## Notes

- No Project file content was edited; this was a directory-only reorganization
  plus documentation and test-boundary cleanup.
- No files were permanently deleted, and no Git stage, commit, branch, or push
  was performed.
