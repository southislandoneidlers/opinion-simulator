# Run record (reconstructed summary)

Immutable Run JSON: schemaVersion, ids, kind (`persona-simulation` |
`synthesis`), status, timestamps, skillVersion, executionPlan (source/persona
refs, question set, prompt template + hashes, rendered sections, provider,
model, settings, sampleCount/sampleIds, truncation, estimate, preflightApproval,
planHash), samples (normalized request/response, rawProviderResponse without
credentials, parsedResult validated by `oneOf` result/synthesis schemas,
attempt events, usage), stabilityComparison, synthesisAttribution, report
pointer, integrity block. Result contract: current Projects carry
`directReaction`, `personaRecommendations`, `systemSuggestions`; legacy
Projects with generic `recommendations` stay valid and render legacy-style.
Answers must cover every Question in order when validationState is valid.
