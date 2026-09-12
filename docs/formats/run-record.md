# Run record (reconstructed summary)

Immutable Run JSON: schemaVersion, ids, kind (`persona-simulation` |
`synthesis`), status, timestamps, skillVersion, executionPlan (source/persona
refs, question set, prompt template + hashes, rendered sections, provider,
model, settings, sampleCount/sampleIds, truncation, estimate, preflightApproval,
planHash; provider is `agent-host`, `gemini`, `openai`, or `openrouter`), samples (normalized request/response, rawProviderResponse without
credentials, parsedResult validated by `oneOf` result/synthesis schemas,
attempt events, usage), stabilityComparison, synthesisAttribution, report
pointer, integrity block. Result contract: current Projects carry
`directReaction`, `personaRecommendations`, `systemSuggestions`; legacy
Projects with generic `recommendations` stay valid and render legacy-style.
Answers must cover every Question in order when validationState is valid.

Prompt template: `default-persona-simulation`. New requests always assemble the
sent prompt with repeated/static sections first (system rules, output schema,
model/sampling) and per-Run content last (Persona, questions, Source).
`assemblePrompt` does not branch on the stored template version; historical
Projects remain valid and readable as immutable artifacts. The canonical order
lives in `packages/core assemblePrompt` and the Python Skill's
`PROMPT_SECTION_ORDER`, which must stay identical.

`sampleCount` is an integer from 1 through 10. One Sample records no Stability
Comparison; two through ten Samples use the exact-normalized comparison, with
the historical three-Sample mode name retained when the count is exactly three.
