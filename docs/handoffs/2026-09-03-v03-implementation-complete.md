# 2026-09-03 v0.3 Implementation Complete

## Scope

Full implementation and verification of the five ordered increments of the v0.3 milestone, adhering to canonical contracts and source-of-truth order:

1. **Last-Project/Workbook Memory & Workbook Import (Increment 1)**
   - Implemented `last-project.ts` with safe inspection against `classifyWriteTarget`. Handles `project` and `empty` safely while returning recoverable warning messages if the remembered path is missing or occupied by non-project files.
   - Wired `project.getLastProject` and `workbook.importDraft` IPC channels.
   - Built safe Workbook-to-Draft importer validating 1–30 enabled Personas cap, confirming manual persona versions into library and draft state.

2. **Unified Settings Stage & Verified-by-Use Credential Status (Increment 2)**
   - Created dedicated `Settings` stage in Desktop UI for provider API keys.
   - Removed duplicate editable password forms from `Overview` and `Execution`, replacing them with read-only credential status badges and direct navigation links to `Settings`.
   - Added `verifiedByUse` tracking to credentials: marked true only upon a successful live call to Gemini or OpenAI; reset upon key changes or clearing.

3. **Material File Extraction (PDF, DOCX, TXT, Markdown) (Increment 3)**
   - Created `extract-material.ts` and `material.extractFile` IPC channel for plain text extraction without external native dependencies.
   - Supports `.txt`, `.md`, `.docx` (via `word/document.xml` parsing), and `.pdf` (via FlateDecode stream and text operator extraction).
   - Enforces 8 MiB file size safety cap and 100,000 character length cap (matching `CAP_SOURCE_TEXT`).

4. **Multi-Persona Batch Preflight & Independent Queueing (Increment 4)**
   - Added `batchPreflightView` and `computeBatchPlanHash` in `@opinion-simulator/core`.
   - Renders unified batch matrix displaying total planned requests (`personaCount × sampleCount`), non-billing token estimates, and disclaimer confirmation bound to matrix plan hash.
   - Added `queue.enqueueBatch` allowing 1–30 Personas to be enqueued as independent, traceable Jobs/Runs with individual Run IDs and plan hashes. If one Persona fails, others continue and the failed job can be retried individually.

5. **Grouped Results by Persona & Multi-Sample Stability (Increment 5)**
   - Extended `ProjectSnapshot` and `readSnapshot` to load and expose all completed runs.
   - Renderer displays Persona selection tabs/buttons allowing users to switch between Persona results (Direct Reaction, Persona Recommendations, System Suggestions, raw response).
   - Renders `stabilityComparison` card when multi-sample runs are present.

---

## Verification

All automated test suites executed cleanly across all workspaces:

- `@opinion-simulator/core`: 5 test files, 51 tests passed.
- `@opinion-simulator/project-store`: 1 test file, 13 tests passed.
- `@opinion-simulator/providers-gemini`: 2 test files, 4 tests passed.
- `@opinion-simulator/providers-openai`: 1 test file, 5 tests passed.
- `@opinion-simulator/desktop`: 8 test files, 55 tests passed.
- Python Skill suite: 24 tests passed.
- Total: 152 automated tests passing without a single failure.
- Full desktop package build (`npm run build -w @opinion-simulator/desktop`) completed without TypeScript or bundling errors.

---

## Live-Provider Calls and Secrets

- **Live Provider Calls**: None made in this session (mocked runs used in test suites).
- **Secrets Exposure**: None. All credentials remain in macOS Keychain / environment variables. Strict IPC key regex filter prevents any secrets from crossing into renderer state or project files.
