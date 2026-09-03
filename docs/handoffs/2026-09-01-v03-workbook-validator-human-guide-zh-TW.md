# 交接：Workbook 驗證器中文閱讀導覽

- 日期：2026-09-01
- 狀態：完成；本文件只補充人類可讀說明，不改變程式行為
- 下一步：在 Desktop Main/IPC 讓使用者選擇 `.xlsx`，讀取 bytes 後呼叫 `validateWorkbook`

## 先用白話理解目前成果

這個專案要讓使用者用固定格式的 Excel Workbook，一次準備材料、問題、1–30 位
Persona，以及要執行的組合。現在完成的是「進門前的檢查員」：它讀取 Excel 的內容，
判斷格式與安全條件是否合格，回傳結構化資料或明確錯誤；它**不會**幫使用者呼叫
模型、不會建立 Run，也不會修改原始 Excel 或 Project 資料夾。

因此，現在的狀態是「核心可以安全理解 Workbook」，不是「桌面 App 已完成匯入與執行」。
人類操作介面、Preflight 確認與 queue 執行仍是下一步。

## 這次相關交接在說什麼

| 文件 | 給人類的意思 |
|---|---|
| [核心實作交接](2026-09-01-v03-validate-workbook-core.md) | 建立 `validateWorkbook`：不碰檔案系統，只檢查固定格式 Excel 並轉為程式資料。 |
| [審查修正交接](2026-09-01-v03-workbook-validator-review-fixes.md) | Code review 找到幾個「看似通過、其實不該通過」的邊界；已加上修正與測試。 |
| [Workbook 格式契約](../formats/workbook-input.md) | 什麼樣的 Excel 才能被接受；這是需求與錯誤碼的主要依據。 |
| [v0.3 roadmap](../roadmap.md) | validator 只是 v0.3 的第一段，Desktop 匯入、恢復與多人執行尚未完成。 |

## 已保護的事情

- 只接受固定的五張工作表與四張資料表，避免夾帶不屬於格式的內容。
- 拒絕巨集、外部連結、嵌入物件、使用者輸入欄位中的公式，以及疑似憑證欄位名稱。
- 拒絕重複工作表、未連結卻藏在 ZIP 內的資料表、錯誤的文字／數字 cell 型別，避免
  「檔案表面看起來正常」卻讓解析結果不一致。
- 驗證時只處理記憶體中的 bytes；測試也確認工作區與暫存 Project 不會被寫入。

## 已驗證與尚未驗證的邊界

已驗證：核心 Workbook 測試 51 項、全專案 JavaScript 測試 103 項、Python Skill
測試 24 項與完整 build 都通過；沒有 live provider call，也沒有讀取、寫入或輸出
任何憑證。

尚未驗證：尚未透過 Desktop UI 選取真實使用者檔案，也沒有實作將 Workbook 資料接到
Preflight、Provider 或 queue。因此「核心 validator 正確」不等於「完整 v0.3 工作流程
已可使用」。

## 下一位 agent 的最小工作範圍

1. 在 Desktop Main 新增選取 `.xlsx` 檔案的公開 IPC seam；Renderer 不直接讀檔。
2. Main 讀取 bytes 後呼叫 `validateWorkbook`，把成功結果或穩定的 `Issue` 回傳 UI。
3. 不建立 Project、不呼叫 Provider、不把 Workbook 內容當作已核准的 ExecutionPlan。
4. 加入 Main/IPC 的公開行為測試，並在完成後更新本資料夾的新交接，而非改寫本文件。

## 維護提醒

Workbook 是可修改的輸入，不是不可變的 Run ledger。任何真正對外模型呼叫前，仍必須
由 App 產生目前的 plan、要求使用者確認 Preflight，並保留既有的憑證與 append-only
Project 安全規則。
