# Handoff: first real agent-host expert walkthrough

- Date: 2026-08-24
- Status: complete (restored verbatim from the session record after the 2026-08-24 deletion)
- Next task at the time: implement the Direct Reaction and report-information-hierarchy increment

## Goal and result

Run the first real `$opinion-simulator` agent-host expert walkthrough with
synthetic, non-sensitive pasted text, a user-confirmed Persona Version, a
current-plan Preflight approval, one quick-mode Sample, and a validated open
Project.

The walkthrough completed end to end. The generated Project is
[`../../../測驗用/`](../../../測驗用/): 6 files, 1 immutable Run, 1 Sample. The Run used
`agent-host` / `host-managed-model`; no provider adapter or credential was used.

The expert found the output valid but not well ordered: trace opened the report
and the primary reaction was missing. Four requirements were recorded:

1. The ordinary view begins with what the user supplied and the simulated
   Persona reaction; full trace stays available in details.
2. A Direct Reaction is required as the primary output.
3. Recommendations must distinguish Persona Recommendations from AI-system
   Suggestions.
4. Repeated Method limits move to a shared methodology/help surface.

## Walkthrough record (summary)

- Project: `測驗用`; synthetic Source for `《數位世代中小學校長數位與AI領導指引2.0》`.
- Question Set: one confirmed question `請問這些內容在教育現場是否有可能進行？`.
- Persona raw input `台北市中學校長`; direct field `roleAndContext`; accepted
  inference `knowledgeAndExperience = 熟悉台北市中學的校務運作與教育現場`;
  other fields `not provided`. Generic synthetic role; no real-person warning.
- Plan hash `79eef103e95a8ba672dda6a0c9a325dc96b95ee727ba82138283e53b7246fbd5`.
- Preflight comprehension needed one explicit follow-up before approval was
  accepted; recorded as interaction friction.
- Quick mode, exactly 1 Sample; `providerUsage.reported = false`.

## Decisions

- Preserve traceability without making hashes the opening experience.
- Add Direct Reaction as the primary response; structured analysis secondary.
- Recommendation provenance is data, not cosmetic copy.
- Shared Method limits live on a versioned methodology surface; the prediction
  disclaimer stays on Results.
- No in-place breaking change to the published v0.0 Result schema.

## Verification

- 12 Skill tests passed pre-increment; `validate-project 測驗用` valid;
  checksums SHA-256 `ac2175f50b9001cf3df608a89a9f2bd6873f1c37b99620076ddca90047ba095b`.
- Live provider calls: none through an adapter.

## Exit criteria status (at the time)

Walkthrough 1 of 3–5 completed; Direct Reaction/report usefulness not yet
passed; stability and independent contexts unevaluated.

## Files changed

`測驗用/`, READMEs, spec documents, glossary, format contracts, UX doc,
user guides, test strategy, roadmap, handoff index. All lost in the deletion;
docs are being restored separately.
