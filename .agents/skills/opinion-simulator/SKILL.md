# Opinion Simulator Skill (reconstructed)

Deterministic, stdlib-only Python CLI for the v0.0 prototype workflow.

```sh
python3 -B .agents/skills/opinion-simulator/scripts/opinion_simulator.py <command> ...
```

## Commands

- `render-preflight --workflow W --output P` — render the outbound disclosure and
  plan hash; rejects pending Persona inferences and sample counts other than 1 or 3.
- `build-project --workflow W --approval A --samples S --output D` — write an
  immutable Project (quick or stability). Refuses stale approvals, non-exact
  Source mappings, credential-shaped response keys, missing Direct Reaction,
  and any existing non-empty output directory.
- `validate-project D` — checksums (dotfiles ignored), published schemas,
  cross-references, Source hashes, per-question answer coverage. Exit 0 valid /
  2 invalid with ERROR lines on stderr; JSON evidence on stdout.
- `render-synthesis-preflight --selection S --output P`
- `build-synthesis-project --selection S --approval A --synthesis Y --output D`

## Workflow rules

1. Organize the Persona with the user; every inference needs an explicit accept/reject.
2. Render Preflight; the user must explicitly approve the plan hash and acknowledge
   the prediction disclaimer before generation.
3. Build into a NEW directory; never overwrite existing Projects.
4. Validate the built Project; keep source Projects untouched.

See `references/artifact-contract.md` for artifact details.
