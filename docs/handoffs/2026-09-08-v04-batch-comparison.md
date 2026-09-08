# 2026-09-08：v0.4 增量 3 同次送出結果同頁比較

## 任務範圍

先提交增量 2（`8dfba1a`），再實作 v0.4 第三個增量：一次送出的所有 Persona
結果在同頁比較，並持久保存 execution batch。

## 已完成

- `project.json` 增加可選 `executionBatches`。身分使用送出的 `submissionId`，
  不用 Workbook `batchId` 或 Source hash 合併。既有 Run JSON 不改寫。
- 舊 Project 沒有此欄仍可讀。沒有批次紀錄的 Run 標示「舊資料未記錄批次」，
  不依材料或時間猜測分組。
- Snapshot 回傳 `executionBatches` 與 `unbatchedRuns`。相同材料再送出是新批次。
- 結果頁先顯示共享材料／問題／模型，再同頁列出各 Persona Direct Reaction，
  並依共同問題排列回答。建議、多樣本、原始回應與該批報告在同頁展開。
- 同步 schema、project format、product、roadmap、UX 與測試策略。

## 驗證

- `npm test`：158 個 JavaScript tests + 24 個 Python tests，共 182 個通過。
- `npm run build`：core、project-store、Gemini/OpenAI adapters、Desktop 通過。
- `git diff --check`：通過。
- 沒有真實 provider 呼叫；沒有人工 GUI walkthrough。
- 沒有讀取、輸出或變更真實憑據。
- 沒有 Git push。增量 2 已依指示提交；增量 3 程式尚未另開 commit。

## 未執行與邊界

- 未合成跨 Persona 群體引言。重試仍走既有 per-Job retry。
- 增量 4–5（問題庫、OpenRouter）尚未開始。

## 下一步

v0.4 增量 4：本機問題庫。
