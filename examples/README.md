# Project examples

This folder holds valid, immutable historical Project directories. They retain
walkthrough evidence and desktop-flow baselines; they are not generated output
and are not the fixtures used by automated tests.

## Layout

| Current location | Previous root name | Purpose |
| --- | --- | --- |
| `walkthroughs/agent-host-first/` | `測驗用` | First agent-host expert walkthrough. |
| `walkthroughs/agent-host-rerun/` | `測驗用-複驗` | Same-expert rerun; not an independently counted walkthrough. |
| `walkthroughs/expert-2/` | `測驗用-專家2` | Proxied independent expert walkthrough 2. |
| `walkthroughs/expert-3/` | `測驗用-專家3` | Proxied independent expert walkthrough 3. |
| `walkthroughs/selected-result-synthesis/` | `測驗用-綜整` | Selected-Result Synthesis CLI tracer output. |
| `desktop-baselines/mock/` | `測試用` | Mocked desktop-flow baseline. |
| `desktop-baselines/live/` | `未命名檔案夾` | Opt-in live desktop-flow baseline. |

## Test boundary

Automated Skill tests use the deterministic fixtures in
[`../tests/skill/fixtures/v0.0/`](../tests/skill/fixtures/v0.0/). Do not point
tests at these examples: each Project preserves user-relevant Run evidence and
may include report material unrelated to a narrow test case.

Each Project remains independently checkable:

```sh
python3 -B .agents/skills/opinion-simulator/scripts/opinion_simulator.py \
  validate-project examples/walkthroughs/agent-host-first
```

Historical handoffs written before this 2026-08-26 relocation retain their
original root-folder names. The table above is the canonical mapping.
