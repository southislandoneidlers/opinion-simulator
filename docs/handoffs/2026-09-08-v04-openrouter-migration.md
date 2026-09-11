# 2026-09-08：v0.4 增量 5 OpenRouter 遷移

## 任務範圍

實作 v0.4 第五個增量：新請求以 OpenRouter 取代 OpenAI 直連，保留 Google Gemini 直連與舊 OpenAI 歷史紀錄讀取相容性。

## 已完成

- 建立獨立套件 `@opinion-simulator/providers-openrouter`：
  - 對接 `https://openrouter.ai/api/v1/chat/completions`，支援 OpenRouter 模型 ID（預設 `openai/gpt-4o-mini`）。
  - 送出 `HTTP-Referer` 與 `X-Title`，沿用 canonical v2 prompt 順序（系統規則與結構在前、角色／題目／材料在後）。
  - 支援逾時處理（預設 60 秒）、HTTP 錯誤剖析、非 JSON 回應阻擋、結構化契約驗證與金鑰脫敏保護。
- 憑證完全隔離：
  - 系統憑證儲存區獨立帳號 `openrouter-api-key` 與環境變數 fallback `OPENROUTER_API_KEY`。
  - 不讀取、不轉送也不刪除既有 OpenAI key。
- 主程序與執行隊列：
  - 新增 IPC 通道 `run.liveOpenrouter`，並在舊通道 `run.liveOpenai` 提供明確的遷移導引錯誤。
  - 執行隊列中若存在未完成的舊 OpenAI Job，拒絕自動改送 OpenRouter，明確提示改選 OpenRouter/Gemini 並重新預覽。
- 介面（Renderer）：
  - 供應商選單新請求僅提供 Google Gemini 與 OpenRouter，OpenAI 直連退出新請求介面。
  - Preflight 明示目的地為 `openrouter` 及所選 OpenRouter 模型。
  - 設定頁提供 OpenRouter 金鑰儲存、清除與安全憑證識別碼；若本機有舊 OpenAI 金鑰則唯讀提示保留狀態。
  - 歷史 Run 與報告保持原 provider / hash / 內容，完全可讀。
- 同步更新契約與文件：
  - `schemas/v0.0/run-record.schema.json`、`plan.ts`、`run-record.md`、`overview.md`、`security.md`、`workspace.md`、`spec.md`、`roadmap.md`、`test-strategy.md`。

## 驗證

- `npm test`：180 個 JavaScript/TypeScript tests + 24 個 Python tests，共 204 個通過。
- `npm run build`：core、project-store、Gemini/OpenAI/OpenRouter adapters、Desktop（Main / Preload / Renderer）全數建置成功。
- `git diff --check`：通過，無格式或空白錯誤。
- 沒有真實 provider 呼叫；全面使用 mocked transport。
- 沒有讀取、輸出或洩漏真實金鑰。
- 沒有未授權的 Git push 或 commit。

## 未執行與邊界

- OpenRouter 遷移不包含任意自訂 API gateway。
- 尚未執行真實 OpenRouter 網路呼叫或人工 GUI walkthrough。
- 既有 v0.4 後續項目（Synthesis、CSV/PDF 匯出、警示流程）尚未開始。

## 下一步

接續 v0.4 原訂規格：Preflight Review 評估、結果選取與 Synthesis 串接、CSV/PDF 匯出與相關警示流程。
