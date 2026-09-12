# v0.4 使用回饋改進規格

狀態：2026-09-07 使用者確認五項改進方向。
2026-09-08：五項增量均已實作完成（送出防重、聲明分離、同頁比較、問題庫、OpenRouter 遷移）。
使用者回報目前實測正常運作，但沒有提供完整測試矩陣；不據此宣告跨平台、
所有 provider 或所有 v0.3 exit criteria 均已驗收。

## 問題與目標

將真實操作中的重複設定、分散閱讀與重複送出問題列為 v0.4 優先工作。
既有 v0.4 Synthesis、CSV/PDF 匯出與警告流程保留在 roadmap，接在本輪改進之後。
以下是使用者確認的產品方向與據此制定的實作／驗收規則。

## 使用者故事

1. 作為使用者，我想以 OpenRouter 選擇模型並執行，減少分別管理模型 API 的負擔。
2. 作為既有使用者，我想繼續讀取 OpenAI 歷史結果，保留原本的實驗紀錄。
3. 作為使用者，我想在同一頁閱讀同次送出、同份材料的所有 Persona 意見，方便比較。
4. 作為使用者，我想看見同批次哪些角色已完成、失敗或等待中，並只重試失敗項目。
5. 作為使用者，我想先勾選預測聲明再產生預覽時保留勾選，避免重複確認同一句話。
6. 作為使用者，我想在送出前看到實際材料、角色、問題與模型，確認本次要送出的內容。
7. 作為使用者，我想保存、搜尋與重用單題或整組問題，減少重新輸入。
8. 作為使用者，我想修改問題庫而不改動過去結果，讓每次模擬仍能追溯當時問題。
9. 作為使用者，我想在送出按鈕附近立即看見處理中、成功或失敗，知道操作是否生效。
10. 作為使用者，我想即使連按送出也只建立一次批次，避免重複請求與費用。

## 1. OpenRouter 取代新請求的 OpenAI 直連入口

官方 [OpenAI SDK 相容指引](https://openrouter.ai/docs/guides/community/openai-sdk)
於 2026-09-07 查核：OpenRouter 可透過 OpenAI SDK 的 Chat Completions 介面使用，
base URL 為 `https://openrouter.ai/api/v1`，使用 OpenRouter 自己的憑證及模型 ID。
目前 `packages/providers-openai/src/live.ts` 使用 OpenAI Chat Completions 與
`response_format: json_object`。相容性足以支持遷移方向，但不代表所有模型均支援
相同參數、JSON 輸出能力或錯誤格式；實作時仍須驗證選用模型的能力。

- 新模擬的 provider 選擇為 Gemini 與 OpenRouter，OpenAI 直連退出新請求介面。
- OpenRouter 是獨立 provider 身分；Settings、模型清單、Preflight、queue、
  ExecutionPlan 與 Run trace 必須一致標示 OpenRouter，不只替換 URL 或顯示文字。
- 保留 Gemini 直連。OpenRouter 須使用其模型 ID；不將既有 OpenAI model 名稱
  無條件照搬。預設模型在實作時依能力查核選定，本規格不指定未驗證型號或價格。
- Main 使用獨立的 OpenRouter 系統憑證帳戶；沿用環境變數 fallback 時使用
  `OPENROUTER_API_KEY`。不得將 OpenAI key 自動轉送給 OpenRouter，也不自動刪除舊 key。
- Preflight 明示 OpenRouter 目的地與所選模型；不能暗示資料只送往 OpenAI。
- 舊 OpenAI Runs 與報告維持原 provider、hash 與內容，繼續可讀。舊的未完成 OpenAI
  Job 不得自動改送 OpenRouter；需使用者選擇新 provider、重新預覽並明確送出新計畫。
- 先擴充適用的 schema／provider contract，再改寫入端；保留歷史讀取相容性。
- 驗收包含目的地、JSON 解析／結構驗證、缺少憑證、不支援能力、HTTP 錯誤、
  timeout、脫敏與舊資料讀取。CI 使用 mocked transport，真實呼叫另行授權。

### 實作狀態（2026-09-08）

- 建立獨立套件 `@opinion-simulator/providers-openrouter`，對接 `https://openrouter.ai/api/v1/chat/completions`，支援 OpenRouter 模型 ID（預設 `openrouter/free`）、結構化驗證、逾時處理與金鑰脫敏；Free Models Router 會在請求時選擇可用免費模型，適合實驗與低量使用，不保證固定底層模型或可用性。
- 新請求 provider 僅提供 Google Gemini 與 OpenRouter，OpenAI 直連退出新請求介面。
- 憑證採用系統憑證區獨立帳號 `openrouter-api-key` 與環境變數 `OPENROUTER_API_KEY`，不讀取、不轉送也不刪除既有 OpenAI key。
- 舊 OpenAI Runs、報告與歷史 batch 保持原 provider 與 hash，繼續可讀；舊的未完成 OpenAI Job 不自動改送 OpenRouter，執行時引導重新預覽新計畫。
- 自動測試覆蓋 OpenRouter adapter、HTTP 錯誤、JSON 解析、timeout、憑證隔離、IPC 與舊資料相容性。尚未做人工 GUI walkthrough 或真實 provider 呼叫。

## 2. 同次批次結果在同一頁比較

- 一次送出形成一個持久的 execution batch 身分。Workbook 的 `batchId` 可重複使用，
  因此不能單憑它或 Source hash 合併歷史結果；同份材料再次送出仍是另一批次。
- 每頁先顯示共享材料、問題集、模型與批次摘要，再列出該批所有 Persona 的反應。
  預設直接顯示各角色的 Direct Reaction，讓使用者能在同頁閱讀／比較；
  不以一次只能看到一人的分頁或切換按鈕作為主要呈現。
- 依共同問題排列不同 Persona 的回答，保留角色名稱與來源；多樣本比較、
  建議、原始回應與 trace 可在同頁展開。窄視窗可採縱向卡片，仍在同頁。
- 持久記錄批次與 Job／Run 的關聯，重開 Project 後仍可還原；每位 Persona
  保留獨立 Run、Sample 與重試能力，不合成一份群體引言。
- 部分失敗時在該批同頁標示各角色狀態；重試回到原批次，只補未完成工作。
- 報告／詳細資料跟隨目前選取的批次或 Run，不得顯示其他批次的最新報告。
- 舊資料缺少可證實的 execution batch 關聯時，明示「舊資料未記錄批次」，
  不依相同材料或相近時間猜測分組、不改寫既有 Runs。
- 驗收：2 位以上 Persona 同頁、多題比較、三樣本、部分失敗／重試、
  相同 Source 的兩次送出分開、重啟後分組保持、歷史資料可讀。

### 實作狀態（2026-09-08）

- 每次送出以 `submissionId` 作為 `executionBatchId` 寫入 `project.json` 的可選
  `executionBatches` 索引。不改寫既有 Run JSON。Workbook `batchId` 不用來合併。
- Snapshot 提供 `executionBatches` 與 `unbatchedRuns`。舊資料沒有批次紀錄時標
  「舊資料未記錄批次」，不依材料或時間猜測。
- 結果頁預設同頁列出該批所有 Persona 的 Direct Reaction，並依共同問題排列回答。
  建議、多樣本、原始回應與報告在同頁展開。多批送出可用批次切換，不再以單人分頁為主。
- 報告跟隨目前選取批次的 Run，不拿其他批次最新報告頂替。
- 自動測試覆蓋兩次送出分開、舊資料不猜測、同頁問題對齊。尚未做人工 GUI walkthrough。

## 3. Preflight 聲明只勾選一次

- 將「理解這是 AI 模擬」的聲明狀態與「已檢視目前計畫」的狀態分離。
- 在本次開啟的 Project 工作階段，先勾聲明再產生預覽，或重複產生預覽、
  切換頁面、完成一批後再預覽，都不要求重勾相同聲明。
- 切換 Project 或重新啟動 App 時重新確認聲明；不新增永久全域接受設定。
- 只有聲明已勾選且目前計畫已成功預覽，才可送出。送出動作明確核准當前
  顯示的計畫；勾選聲明本身不授權外傳，也不自動建立 plan approval。
- 材料、Persona、問題、provider、模型、樣本矩陣改變時，使舊預覽／核准失效，
  要求重新檢視計畫，但保留聲明勾選。Main 仍驗證精確 plan hash／Run id。
- 完成後下一筆新 Run 需新計畫預覽與明確送出；不沿用已消耗的 approval。
- 驗收：先勾後預覽保持勾選、預覽失敗不可送出、變更計畫拒絕舊 hash、
  新 Run 需新預覽、切換 Project／重啟重設聲明。

### 實作狀態（2026-09-08）

- 預測聲明存在 Main 記憶體工作階段，不寫入 Project 或 app-data。
- IPC `preflight.setDisclaimer` 設定勾選；`preflight.render` 與 `project.create`
  回傳 `disclaimerAcknowledged`。產生預覽、改材料／Persona／問題、完成 Run
  都不重設勾選。
- 切換目前開啟的 Project 會重設聲明。重啟 App 也重設，因為沒有持久設定。
- 送出仍要工作階段已勾選、payload `acknowledgedDisclaimer`、以及目前計畫
  hash。勾選本身不建立 Job 或 plan approval。
- 自動測試覆蓋保持勾選、勾選不核准、切換 Project 重設、未勾選拒絕送出。
  尚未做人工 GUI walkthrough。

## 4. 本機問題庫

- 在「問題」頁加入問題庫，支援具名稱的單題及多題問題集，保存題目文字與順序。
- 可新增、搜尋、載入、編輯與移除問題庫項目；跨 App 重啟保留。
- 載入時明確選擇「追加到目前問題」或「取代目前問題」；空白題目拒絕保存。
  追加／取代後沿用 Question Set 的數量與文字限制，保留使用者排序能力。
- Main 管理 app-data 儲存，Renderer 透過允許的 IPC 操作，參考 Persona library
  的公開介面模式。問題庫不包含憑證、不自動呼叫模型。
- 問題載入草稿後是副本；每次 Run 保存實際使用的 Question Set 快照。
  問題庫編輯或刪除不改動既有 Runs。改變草稿問題使舊 Preflight 失效。
- 驗收：單題／整組保存、重啟搜尋載入、追加／取代、順序與空白／超限檢查、
  庫項目變更不影響舊 Run、儲存失敗有明顯且可恢復的提示。

### 實作狀態（2026-09-08）

- Main 以 `question-library.json` 存在 app-data。IPC：`question.library.list`、
  `save`、`remove`、`apply`（`append` 或 `replace`）。
- 空白名稱／題目、超過 50 題或單題 4,000 字會拒絕保存或載入。
- 載入寫入目前草稿副本；改庫不改已寫入 Project 的 Question Set。
- 自動測試覆蓋保存／搜尋／更新／移除、追加／取代、超限、舊 Run 不受影響。
  尚未做人工 GUI walkthrough。

## 5. 送出提示與防止重複送出

- 按下送出立即在按鈕附近或固定可見區顯示「送出中」，同時鎖定重複送出。
  提示不能只放在頁尾；狀態使用文字且可供輔助工具讀取，不只用顏色。
- 區分「已接受／已加入佇列」、「執行中」、「全部完成」、「部分失敗」與
  「送出失敗」。只有 Main 確認接受後才顯示送出成功，不把入列當作模型已完成。
- Main／queue 必須防重：同一送出意圖使用穩定識別，重複 IPC 或回應遺失後重送
  回傳同一批次，不建立第二批 Jobs。只禁用 Renderer 按鈕不足以達成此要求。
- 等待結果時保留可見狀態；若接受狀態不明，先查既有送出識別的狀態，不能
  自動建立新批次。失敗提示說明階段與下一個可採取動作。
- 使用者刻意再次執行相同內容，仍可重新預覽並明確建立新的送出；
  防重以送出意圖識別，不永久禁止相同內容的合法重跑。
- 驗收：快速連點／並行 IPC 只建立一批、慢回應即時顯示、接受失敗、部分失敗、
  重啟／回應遺失後狀態可確認、明確新送出可建立新批次。Gemini、OpenRouter、
  mocked 與 live UI 使用相同行為。

### 實作狀態（2026-09-08）

- IPC `queue.enqueue` 與 `queue.enqueueBatch` 必須帶有效 `submissionId`。
  同一識別的重複請求回傳既有 Jobs，不建立第二批。
- 新增 `queue.submissionStatus`：查詢既有送出；找不到時不建立 Jobs。
- `run-queue.json` 可選 `submissions` 陣列；舊檔沒有此欄仍可讀、不改寫。
- Renderer 在執行按鈕旁顯示文字狀態（`role="status"`），送出中鎖定按鈕；
  新 Preflight 才開始新的送出識別。回應遺失時先查 `queue.submissionStatus`。
- 自動測試覆蓋並行／重送防重、缺識別拒絕、接受失敗重放、新預覽後新批次、
  以及 Renderer 狀態文案。尚未做人工 GUI walkthrough 或真實 provider 呼叫。
  mocked、Gemini live 與 OpenRouter live enqueue 共用同一套 submission IPC。

## 實作順序與驗證入口

建議順序：送出防重與明顯狀態 → Preflight 聲明分離 → 批次同頁比較 → 問題庫
→ OpenRouter 遷移。五項增量均已完成。

沿用公開 IPC／session／queue、provider adapter 及 Project 讀寫 seam；
互動需求須增加 Renderer 行為驗證與人工 walkthrough，不能僅靠 Main 測試宣告完成。
所有格式變更在同次實作更新 canonical format、安全及相容性契約並驗證舊 fixtures。
每個增量跑必要回歸，任務結束跑完整 `npm test`；有程式變更時跑完整 build。

## 範圍外

2026-09-07 記錄規格時未實作功能。五項增量已於 2026-09-08 實作完成。
問題庫不包含雲端同步；同頁比較不自動生成跨 Persona Synthesis；
OpenRouter 遷移不包含任意自訂 API gateway。既有 v0.4 匯出等項目不因本文件被取消。
