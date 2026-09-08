# 2026-09-08：v0.4 增量 4 本機問題庫

## 任務範圍

先提交增量 3（`d982c2a`），再實作 v0.4 第四個增量：可保存與重用單題／多題
問題集的本機問題庫。

## 已完成

- app-data `question-library.json`：具名稱的單題或問題集，保存文字與順序。
- IPC `question.library.list` / `save` / `remove` / `apply`。
  載入須明確 `append` 或 `replace`。
- 拒絕空白名稱／空白題目、超過 50 題、單題超過 4,000 字。
- 載入寫入草稿副本；改庫或刪除不改已完成 Run 的 Question Set。
- 問題頁可保存、搜尋、追加／取代、編輯、移除，並可調整目前題目順序。
- 同步 format、product、roadmap、UX 與測試策略。

## 驗證

- `npm test`：165 個 JavaScript tests + 24 個 Python tests，共 189 個通過。
- `npm run build`：core、project-store、Gemini/OpenAI adapters、Desktop 通過。
- `git diff --check`：通過。
- 沒有真實 provider 呼叫；沒有人工 GUI walkthrough。
- 沒有讀取、輸出或變更真實憑據。
- 沒有 Git push。增量 3 已依指示提交（`d982c2a`）；增量 4 程式尚未另開 commit。

## 未執行與邊界

- 問題庫沒有雲端同步，也不呼叫模型。
- 增量 5（OpenRouter 遷移）尚未開始。

## 下一步

v0.4 增量 5：新請求以 OpenRouter 取代 OpenAI 直連，保留 Gemini 與舊 OpenAI 讀取。
