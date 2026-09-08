# Test strategy (reconstructed summary)

Public seams only: the Python CLI commands are invoked as subprocesses against
golden fixtures (byte-exact tree comparisons), and desktop behavior is tested
through session functions whose artifacts are validated by the Python CLI.
Negative cases cover stale approvals, pending inferences, sample-count limits,
non-exact Source mappings, credential-shaped request and response keys,
overwrite refusal, tampering detection, schema violations, legacy
compatibility, and dotfile ignores. Renderer secret-access tests invoke the
IPC dispatcher without Electron and must fail closed (unknown channel,
forbidden keys, no raw-key channel), while allowing the published non-secret
Preflight token-count estimate. Queue tests cover cancel, retry, and "resume
only missing Jobs". Live provider calls never run inside CI tests.

v0.3 Workbook tests call `validateWorkbook` in `@opinion-simulator/core`
against the tracked accepted-template fixture and hostile in-memory variants.
They cover 1-Persona and 30-Persona batches, 31-Persona rejection, literal
cell types, duplicate sheets, unlinked table parts, supplementary Unicode
character references, and zero filesystem mutation. Desktop IPC tests cover
`desktop.chooseWorkbook`, `workbook.validate`, and `workbook.importDraft`:
golden-template mapping,
renderer-supplied bytes rejection, empty/wrong-extension/oversized files,
missing paths, zero Project/Workbook mutation, preserved Workbook Persona ids,
and explicit confirmation before Persona-library or Preflight use. Credential
status includes a one-way fingerprint and fingerprint-bound `verifiedByUse`,
never the key. Queue tests cover stale Preflight rejection, surfaced single-Job
failures while batch processing continues, three-Sample resume/persistence,
and exact-text Stability Comparison. Material IPC rejects PDF streams whose
decompressed size exceeds the bounded limit. v0.4 increment 1 tests cover
`queue.enqueue` / `queue.enqueueBatch` `submissionId` dedup (parallel and
replay), missing-id rejection, `queue.submissionStatus` lookup without creating
jobs, failed-accept replay, a new Preflight creating a new batch, legacy queue
files without `submissions`, and Renderer submission-status copy. Disclaimer
tests cover `preflight.setDisclaimer` persistence across preview, refusal to
treat the checkbox as approval, reset on Project switch, and enqueue rejection
when the session flag is unset. Execution-batch tests cover grouping two
Persona Runs from one submit, keeping a second submit of the same Source
separate, leaving legacy Runs unbatched, Python schema acceptance of the
optional `executionBatches` field, and Renderer question-alignment copy. Question-library tests cover named
single/set save, search, update/remove, append/replace into a draft, blank and
cap rejection, corrupt-file refusal, and library edits leaving completed Run
question snapshots unchanged.

## 中文閱讀摘要

下一版新增驗收範圍見 [v0.4 使用回饋改進規格](../product/v04-usability-improvements.md)。
送出防重、可見狀態、工作階段聲明、同頁批次比較與問題庫已有自動測試；
OpenRouter 尚未實作。涉及畫面的需求仍須人工 GUI walkthrough；2026-09-07
使用者「正常運作」回報不等於尚未實作項目已通過。

這些測試不是在測「Excel 能不能打開」，而是在測系統會不會把不安全或格式錯誤的
Workbook 誤當成可匯入資料。測試會確認合法的範本能讀出兩位 Persona，也會刻意
放入重複工作表、藏在 ZIP 內但未連結的表格、錯誤 cell 型別、巨集或公式等案例，
確認 validator 會拒絕它們。另有測試比對工作區與暫存 Project 的檔案快照，確保
單純驗證 Excel 不會偷偷寫入或覆蓋任何資料。桌面 IPC 測試另確認：選檔與檢查
都走主程序、Renderer 不能直接送檔案 bytes，且檢查過程不會建立或改寫 Project。
