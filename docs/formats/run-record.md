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

Prompt template: `default-persona-simulation`. Version 2 (2026-08-24)
assembles the sent prompt with repeated/static sections first (system rules,
output schema, model/sampling) and per-Run content last (Persona, questions,
Source); version 1 Projects remain valid and readable, with their stored plan
hashes untouched. The canonical order lives in `packages/core assemblePrompt`
and the Python Skill's `PROMPT_SECTION_ORDER`, which must stay identical.
