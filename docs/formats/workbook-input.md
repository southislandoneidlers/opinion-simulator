# Workbook input and management format

Status: accepted v0.3 usability baseline on 2026-08-30; importer specification
revised 2026-08-31 after user review. `validateWorkbook`, Desktop draft import,
last-Project memory, explicit Persona confirmation, batch Preflight, and queue
wiring are implemented in the working tree as of 2026-09-03.

## Role

The fixed-format `.xlsx` Workbook is the public, user-editable input and
management surface for v0.3. A person can bulk create or revise Personas,
Question Sets, Sources, and Simulation Batches without the App. The v0.3 App
will read the Workbook directly and validate its contents before creating or
updating a draft execution plan.

The canonical imported document is a **multi-Persona Simulation Batch**: one
Source and one Question Set applied to **1–30 Personas**. It is not a
single-Persona draft with extra rows tacked on. Each Persona remains an
independently traceable Run/Job after confirmation and Preflight.

The Workbook is mutable input, not the immutable Run ledger. In the first v0.3
tracer, provider responses, Runs, reports, hashes, approvals, and recovery
journals remain in the companion open-directory Project. The App does not
overwrite the source Workbook or place generated results in it. Any later
decision to make `.xlsx` the sole canonical artifact requires a separate
migration and integrity design.

The tracked accepted-template fixture is:

`packages/core/fixtures/workbook/Opinion-Simulator-v0.3-Workbook-簡易模板.xlsx`

That file is the golden valid fixture for this specification. Inspected on
2026-08-31: five visible sheets, four published tables, no VBA, no external
links, table data range rows 5–104 (100 paste-ready rows), sample batch
`batch-001` names two Personas and uses `樣本數` 1.

## Decisions after 2026-08-31 review

| Item | Decision |
|---|---|
| Package | No new workspace package. `validateWorkbook` lives in `@opinion-simulator/core` so tests can call it without Electron. A separate `@opinion-simulator/workbook` package stays postponed. |
| Public seam | One function, `validateWorkbook({ bytes, fileName? })`. It never reads or writes the filesystem, never mutates a Project, and never overwrites the Workbook. |
| Parser | ZIP + SpreadsheetML reader only. No formula engine, no VBA host, no OLE, no network. Cached `格式檢查` values are ignored. |
| Document / limit order | Shared human content first (`名稱`/`標題`, `背景描述`, `問題內容`, `材料全文`), then identifiers, then Persona/batch occupancy. Field order in Excel is unchanged; import is keyed by header names. |
| Multi-Persona model | The imported document is always a 1–30 Persona batch model. Occupied Persona rows max 30. An enabled batch must name 1–30 enabled Personas. |
| Mapping target | Output is `ValidatedWorkbook` (shared Source and Question Set, then Personas, then batches). Not today's single-Persona `DraftState`. Not a Project write. |
| Credential scanning | Reject credential-**shaped column names** with the same regex as IPC keys. Do not scan cell text. |
| `樣本數` | Workbook field is an integer from 1–10. The importer and `ExecutionPlan` enforce the same range. The review template demo value is 1. |

## Accepted sheets and fields

The Workbook contains exactly five visible sheets. Import is keyed by the
published table/header names, not by cell color, column letters, or formula
results. Excel column order in the review template may differ from the
documentation order below.

### `使用說明`

Human guidance only. The importer does not use this sheet as trusted input.
In particular it must not read `B21`/`C21` (the template's Sample min/max
display) to decide the legal range; that range is this contract. It also must
not read that sheet for the 1–30 Persona cap.

### `Persona`

Published input table: `PersonaInputTable`.

Documented field order (shared/human content, then id):

- `名稱`: required human-readable label.
- `背景描述`: required free-form Persona input.
- `啟用`: required `是` / `否` value.
- `personaId`: required unique text identifier.
- `格式檢查`: formula-owned convenience display; ignored and recomputed by
  the App.

There is no Workbook draft/confirmed status. Confirmation, inference review,
and immutable Persona Version creation remain App-owned gates.

### `問題集`

Published input table: `QuestionInputTable`.

- `問題內容`: required question text.
- `順序`: required positive whole number, unique within one Question Set.
- `questionSetId`: required text identifier. Repeated ids group multiple
  questions into one Question Set.
- `格式檢查`: formula-owned convenience display; ignored and recomputed by
  the App.

### `材料`

Published input table: `SourceInputTable`.

- `標題`: required human-readable title.
- `材料全文`: required pasted plain text.
- `啟用`: required `是` / `否` value.
- `sourceId`: required unique text identifier.
- `格式檢查`: formula-owned convenience display; ignored and recomputed by
  the App.

PDF, DOCX, TXT, and Markdown file extraction remains an App import path. The
resulting normalized plain text may be represented in this table.

### `執行清單`

Published input table: `BatchInputTable`.

Shared across rows of one `batchId`, listed first:

- `sourceId`: required reference to one enabled Source.
- `questionSetId`: required reference to one Question Set.
- `樣本數`: required whole number from 1 through 10.

Then identifiers and per-Persona cells:

- `batchId`: required text identifier. Repeated ids group rows into one
  Simulation Batch.
- `personaId`: required reference to one enabled Persona.
- `啟用`: required `是` / `否` value.
- `管理備註`: optional user note; it is not sent to a provider unless a future
  contract explicitly promotes it to prompt input.
- `格式檢查`: formula-owned convenience display; ignored and recomputed by
  the App.

Rows with the same `batchId` must use the same Source, Question Set, and Sample
count. Each row names exactly one Persona. An enabled batch names between 1
and 30 enabled Personas. This is one visible multi-Persona batch; each Persona
still becomes an independent Run/Job, Result, retry, and trace.

## App-owned settings and gates

The Workbook does not contain Provider/model selection, credentials, Persona
confirmation, Preflight approval, queue status, generated Results, or Project
integrity metadata. Provider and model are selected in App Settings/Preflight.
Every imported batch still requires a current plan-hash approval before any
external call.

## Public seam

Function lives in `@opinion-simulator/core`. Renderer, `project-store`,
providers, and the Python Skill do not parse `.xlsx`.

```text
validateWorkbook(input: { bytes: Uint8Array; fileName?: string })
  -> { ok: true, workbook: ValidatedWorkbook, warnings: Issue[] }
   | { ok: false, errors: Issue[], warnings: Issue[] }
```

- `fileName` is optional metadata used only for extension checks. When present
  it must end with `.xlsx` (case-insensitive). Content is still inspected.
- Success and failure both return; validation problems are not thrown.
- `Issue` is `{ code: string, path: string, message: string }`. `code` values
  are stable (see [Issue codes](#issue-codes)). `path` is a dotted locator
  such as `PersonaInputTable[0].personaId` or `$zip`.
- The function is pure over `bytes`. Tests feed fixtures as bytes.

Desktop Main, not Renderer, reads the chosen path and passes bytes into
`validateWorkbook`.

```text
desktop.chooseWorkbook()
  -> string | null

workbook.validate({ path: string })
  -> { path: string } & ValidateWorkbookResult
```

- `desktop.chooseWorkbook` opens an `.xlsx` file dialog. Cancel returns `null`.
- `workbook.validate` reads the path in Main, enforces the 8 MiB cap before
  loading the file, and calls `validateWorkbook`. Validation problems are
  returned as `Issue` values; missing or unreadable paths throw.
- Renderer must not send file bytes. A `bytes` field in the payload is rejected.
- These channels do not write a Project, call a provider, or mint an
  `ExecutionPlan`.

`ValidatedWorkbook` (in-memory only). Shared collections first, then Personas,
then batches; inside each record, human content before identifiers:

```text
formatId: "v0.3-five-sheet-1"
sources: [{ title, text, enabled, sourceId }]
questionSets: [{ items: [{ text, order }], questionSetId }]
personas: [{ label, rawInput, enabled, personaId }]
batches: [{
  sourceId,             // shared
  questionSetId,        // shared
  sampleCount,          // 1..10; shared
  batchId,
  rows: [{ enabled, note, personaId }]
}]
```

A well-formed file always uses this shape, including when only one Persona is
enabled. There is no single-Persona import variant.

Question items are sorted by `順序` ascending. Gaps in `順序` are kept; the
importer does not renumber. `rawInput`, question `text`, and Source `text`
preserve interior whitespace and newlines (`\r\n` and `\r` become `\n`).
Identifiers, labels, titles, enable flags, and notes are trimmed at both ends.
A value that is empty after trim is missing.

Workbook `personaId` values are user-facing Persona ids. They must already
satisfy `isId` (`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`). The App mints a new
`PersonaVersion.id` only later, at confirmation. The importer does not call
`confirmManualPersona` and does not write `personas.json`.

Disabled (`啟用` = `否`) Personas, Sources, and batch rows are retained in
`ValidatedWorkbook` so the App can show them. Enabled batch rows may reference
only enabled Personas and enabled Sources.

An enabled batch (at least one row with `啟用` = `是`) must contain 1–30
enabled Persona rows. Occupied Persona rows in the whole Workbook must not
exceed 30.

A Workbook with zero occupied rows, or with occupied rows but no enabled batch
row, is still `ok: true` if every occupied row is well-formed. The App decides
whether that empty import is useful. It is not an importer error.

## Parsing rules

Read the file as an OPC zip of SpreadsheetML.

1. Reject before unzip completes if compressed size exceeds the file cap.
2. Reject zip bombs and disallowed parts using the member allow-list below.
3. Require exactly these **visible** sheet names: `使用說明`, `Persona`,
   `問題集`, `材料`, `執行清單`. Extra sheets fail. Hidden or very-hidden
   sheets fail. Sheet order is irrelevant.
4. Require exactly these table names, each on the expected sheet:
   `PersonaInputTable` on `Persona`, `QuestionInputTable` on `問題集`,
   `SourceInputTable` on `材料`, `BatchInputTable` on `執行清單`. Extra
   tables fail. Missing tables fail.
5. Match headers by exact table-column `name`. Required headers must all be
   present; any additional column fails. Do not key off column letters, colors,
   or the `格式檢查` cached values.
6. Support shared strings and inline strings. Concatenate rich-text runs to
   plain text. Drop markup.
7. Occupied row: inside a table data range, a row is occupied when any
   **user-input** cell (not `格式檢查`) is non-empty after trim. Completely
   empty user-input rows are skipped even if `格式檢查` still holds a formula.
8. A partially occupied row (some required user-input cells empty) fails.
9. User-input cells must be literals: inline string, shared string, or a
   non-formula `str` string; `順序` and `樣本數` alone may instead be an integer
   number. A cell with an `<f>` formula in a user-input column fails. Boolean,
   date, and fractional numbers fail. `啟用` accepts only the exact strings
   `是` and `否` after trim.
10. `格式檢查` may contain formulas. Ignore both the formula and any cached
    value. Recompute every check in process.

Allowed zip members (any other part fails closed):

- `[Content_Types].xml`
- `_rels/.rels`
- `xl/workbook.xml`
- `xl/_rels/workbook.xml.rels`
- `xl/worksheets/sheet*.xml`
- `xl/worksheets/_rels/sheet*.xml.rels`
- `xl/tables/table*.xml`
- `xl/sharedStrings.xml`
- `xl/styles.xml`
- `xl/theme/theme*.xml`
- `xl/calcChain.xml` (presence ignored)
- `docProps/core.xml`, `docProps/app.xml`, `docProps/custom.xml` (presence
  ignored; values are not imported)

Reject, without executing anything:

- Macro-enabled content types, `xl/vbaProject.bin`, OLE, ActiveX, embeddings
- `xl/externalLinks/`
- Encrypted packages and non-zip Office binaries (`.xls`, `.xlsb`, compound
  files)
- Pivot caches, charts, drawings, media, comments, printer settings, and any
  member not on the allow-list

Do not follow hyperlinks. A `HYPERLINK` formula in a user-input column is a
formula and fails like any other.

Column names matching `FORBIDDEN_IPC_KEY` in `@opinion-simulator/core` fail
(`TABLE_HEADER_FORBIDDEN`). Cell **text** is not scanned for credential
shapes.

## Resource limits

These caps apply before `ValidatedWorkbook` is returned. They are first-tracer
values, not physical maxima. Changing a cap is a contract bump, not a silent
code change.

Lengths count Unicode scalar values (code points), not UTF-16 code units.

### Shared human content

| Cap | Value | Why |
|---|---|---|
| `名稱`, `標題` | 200 code points | Labels reused across a batch |
| `背景描述` | 20,000 code points | Free-form Persona text |
| `問題內容` | 4,000 code points | One shared question |
| `材料全文` | 100,000 code points | One shared Source |
| `管理備註` | 1,000 code points | Not sent to a provider |
| Sum of imported text | 400,000 code points | Cross-table budget |

### Identifiers

| Cap | Value | Why |
|---|---|---|
| `personaId` / `sourceId` / `questionSetId` / `batchId` | `isId` (1–128 ASCII) | Same identifier rule as Project artifacts |

### Persona and batch occupancy

| Cap | Value | Why |
|---|---|---|
| Occupied Persona rows | 30 | v0.3 people cap |
| Enabled Personas in one enabled batch | 1–30 | Same cap; one person is a batch of one |
| Occupied Source rows | 100 | Template paste area `5:104` |
| Occupied question rows | 100 | Same |
| Occupied batch rows | 100 | Same |
| Table data rows (per table) | 100 | Template range; extra rows beyond the published table fail |
| Questions in one Question Set | 50 | Multiple sets can share the 100 question rows |
| Distinct `batchId` values | 20 | First App batch picker stays small |
| `順序` | integer 1–1000 inclusive, unique per `questionSetId` | Matches the template's Excel validation upper bound |
| `樣本數` | integer 1–10 inclusive | Execution safety cap |

### Parser / zip

| Cap | Value | Why |
|---|---|---|
| Compressed file | 8 MiB | The accepted template is ~36 KiB |
| Zip members | 64 | A five-sheet xlsx uses ~20 members |
| Uncompressed total | 32 MiB | Zip-bomb ceiling |
| Single uncompressed member | 8 MiB | Same |

## Mapping relative to current contracts

Order: shared Source and questions, then Personas, then batch orchestration.

| Workbook | Current desktop / Project | This importer |
|---|---|---|
| `標題` + `材料全文` | `DraftState.sourceText` (one Source) | `sources[]` (one or more; a batch uses one) |
| `問題內容` grouped by `questionSetId` | `DraftState.questions: string[]` (one set) | `questionSets[]` |
| `名稱` + `背景描述` | `DraftState.personaLabel` + `personaRaw` (one Persona) | `personas[]`, 1–30 occupied, unconfirmed |
| `personaId` | App currently mints `slugId("persona", …)` at confirm time | Keep the Workbook id; App confirmation later mints `PersonaVersion.id` |
| Simulation Batch | Not represented; session is single-Persona | `batches[]`: one Source, one Question Set, 1–30 Persona rows |
| `樣本數` 1–10 | `ExecutionPlan.sampleCount` integer 1–10 | Same validated range; no coercion |
| Project directory | `project-store` append-only writer | Untouched |

Today's `DraftState` cannot hold this document. Later session wiring replaces
or wraps that single-Persona object. The importer does not choose a Project
title, directory, provider, or model, and it does not write Runs.

Each enabled Persona in an enabled batch is a future independent Run. The
importer does not merge them into a group quotation.

## Golden mapping of the accepted template

`ok: true`, `formatId: "v0.3-five-sheet-1"`. Shared collections first.

| Collection | Expected content |
|---|---|
| Source `source-001` | title `示範：校務政策草案`; enabled; body is the pasted placeholder sentence in the template |
| Question Set `questions-001` | text `這項計畫可能帶來哪些直接影響？` (order 1); text `執行前最需要補充哪一項資訊？` (order 2) |
| Personas | `示範校長` / enabled / `persona-001`; `示範教師` / enabled / `persona-002` (2 people, within 1–30) |
| Batch `batch-001` | shared `source-001` + `questions-001` + `sampleCount` 1; two enabled rows |
| Warnings | none |

Empty template rows 7–104 are skipped.

## Issue codes

Fail closed (`ok: false`) using these codes. Messages may be localized later;
codes are the test seam.

| Code | When |
|---|---|
| `FILE_EMPTY` | Zero bytes |
| `FILE_TOO_LARGE` | Compressed size over cap |
| `FILE_EXTENSION_INVALID` | `fileName` present and not `.xlsx` |
| `FILE_NOT_ZIP` | Not a zip package |
| `FILE_ENCRYPTED` | Encrypted / compound Office file |
| `FILE_MACRO_ENABLED` | Macro-enabled content type or `vbaProject` |
| `FILE_UNSUPPORTED_TYPE` | `.xls`, `.xlsb`, CSV, or other non-xlsx |
| `ZIP_MALFORMED` | Unreadable zip |
| `ZIP_TOO_MANY_ENTRIES` | Member count over cap |
| `ZIP_MEMBER_TOO_LARGE` | One member over cap |
| `ZIP_BOMB` | Uncompressed total over cap, or an expansion ratio that exceeds the uncompressed caps |
| `PACKAGE_UNEXPECTED_PART` | Zip member outside the allow-list |
| `PACKAGE_MISSING_WORKBOOK` | No `xl/workbook.xml` |
| `EXTERNAL_LINKS_PRESENT` | `xl/externalLinks/` |
| `EMBEDDED_OBJECT_PRESENT` | OLE / embeddings / ActiveX |
| `SHEET_MISSING` | One of the five required names is absent |
| `SHEET_UNEXPECTED` | Extra sheet |
| `SHEET_HIDDEN` | Any sheet is hidden or very hidden |
| `TABLE_MISSING` | Required table name absent or on the wrong sheet |
| `TABLE_UNEXPECTED` | Extra table |
| `TABLE_HEADER_MISSING` | Required column name absent |
| `TABLE_HEADER_UNEXPECTED` | Extra column |
| `TABLE_HEADER_FORBIDDEN` | Column name matches the credential-shaped key regex |
| `TABLE_TOO_MANY_ROWS` | Table data range longer than 100 rows |
| `CELL_FORMULA_IN_INPUT` | Formula in a user-input column |
| `CELL_TYPE_INVALID` | Wrong literal type |
| `CELL_TOO_LONG` | Over a field cap |
| `ROW_PARTIAL` | Occupied row missing a required user-input cell |
| `REQUIRED_MISSING` | Required value empty after trim |
| `ID_INVALID` | Fails `isId` |
| `ID_DUPLICATE` | Duplicate `personaId` or `sourceId`, or duplicate `batchId`+`personaId` |
| `ENABLE_INVALID` | Not `是` / `否` |
| `SAMPLE_COUNT_INVALID` | Not an integer in 1–10 |
| `QUESTION_ORDER_INVALID` | Not an integer in 1–1000 |
| `QUESTION_ORDER_DUPLICATE` | Same `順序` twice in one Question Set |
| `PERSONA_NOT_FOUND` | Batch row names a missing Persona |
| `PERSONA_DISABLED` | Enabled batch row names a disabled Persona |
| `SOURCE_NOT_FOUND` | Batch row names a missing Source |
| `SOURCE_DISABLED` | Enabled batch row names a disabled Source |
| `QUESTION_SET_NOT_FOUND` | Batch row names a missing Question Set |
| `BATCH_INCONSISTENT` | Same `batchId` with differing Source, Question Set, or Sample count |
| `TOO_MANY_PERSONAS` | Occupied Persona rows exceed 30 |
| `BATCH_PERSONA_COUNT_INVALID` | An enabled batch has 0 or more than 30 enabled Persona rows |
| `TEXT_BUDGET_EXCEEDED` | Sum of imported text over cap |
| `TOO_MANY_OCCUPIED_ROWS` | Occupied Source, question, or batch rows over cap |
| `TOO_MANY_BATCHES` | Distinct `batchId` count over cap |
| `TOO_MANY_QUESTIONS_IN_SET` | One Question Set over 50 items |

Warnings (`ok` may still be `true`):

| Code | When |
|---|---|
| `NO_ENABLED_BATCH` | File is well-formed but has no enabled batch row |

Collect every issue in one pass where practical. File/zip failures may stop
early because later XML is unreadable.

## Fixtures

Tests target `validateWorkbook` in `packages/core` using
`src/workbook.test.ts` and the tracked accepted-template fixture in
`fixtures/workbook/`. Do not reuse `examples/` walkthrough Projects as Workbook
fixtures. Do not add a `packages/workbook` workspace unless tests later need
that isolation.

Required cases:

- accepted template → golden `ValidatedWorkbook` (2 Personas, `sampleCount` 1),
  no warnings
- one enabled Persona is a valid batch of one
- 30 enabled Personas in one batch succeed; 31 occupied Personas fail
  `TOO_MANY_PERSONAS`
- empty user-input rows skipped
- `.xlsm` / encrypted / extra sheet / hidden sheet / extra column
- formula in `personaId`
- credential-shaped column name
- zip bomb / oversized member
- `樣本數` 0 and 11
- enabled batch row pointing at a disabled or missing Persona
- two `batchId` rows with different `sourceId` or `樣本數`
- duplicate `personaId` inside one batch
- `validateWorkbook` leaves the working tree and any temp Project directory
  untouched

## Security and validation boundary

- Accept `.xlsx` only. Reject macro-enabled, encrypted, malformed, or
  unsupported spreadsheet formats.
- Do not execute Workbook macros, external links, or embedded objects. Reject
  formulas in published user-input columns; formula-owned `格式檢查` columns
  are allowed only as ignored presentation helpers. Import raw input values and
  independently recompute all checks.
- Reject unexpected sheets/tables, missing required headers, duplicate ids,
  broken references, invalid enable values, inconsistent batch rows,
  out-of-range Sample counts, and Persona counts outside 1–30 for an enabled
  batch.
- Apply the resource limits above before returning `ValidatedWorkbook`.
- Never accept API keys, tokens, passwords, accounts, cookies, or other
  credential material as Workbook **fields** (column names). The OS credential
  store remains the only persistent credential location.
- Treat imported text as untrusted data. It may be displayed or sent only
  through the normal escaped UI and approved Preflight path.

## Out of scope for this specification

- Writing or rewriting a Project
- Expanding `ExecutionPlan.sampleCount` beyond 1–10
- Making `.xlsx` the sole canonical artifact
- A new `@opinion-simulator/workbook` package

## Compatibility and implementation status

Existing open-directory Projects remain valid and must not be rewritten.
`validateWorkbook` in `@opinion-simulator/core`, its deterministic fixtures,
and the Desktop choose/validate/import IPC seams are implemented. A successful
check is not an import; an import is not Persona confirmation; and confirmation
is not Preflight approval. The App preserves Workbook `personaId` values,
mints Persona Version ids only on explicit confirmation, and binds execution
to the complete displayed batch plan hash. Workbook sample counts are validated
as 1–10 and use the same range at executable Preflight; they are never silently
coerced.
