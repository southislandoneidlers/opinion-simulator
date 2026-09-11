# 2026-09-11：OpenRouter 遷移除錯

## 任務範圍

對工作樹內未提交的 v0.4 增量 5（OpenRouter 遷移）做除錯。沒有使用者指定的單一症狀；以 `npm test` 為起始迴圈，再對公開 seam 補上會紅的回歸測試。

## 已確認缺陷

| 症狀 | 原因 | 預測（已驗證） |
|---|---|---|
| `run.liveOpenrouter` 經 `dispatchIpc` 回 `Unknown IPC channel` | 處理函式已註冊，但 `packages/core/src/ipc.ts` 的 `IPC_CHANNELS` 漏列該通道 | 列入 allow-list 後，空 payload 改走 session 錯誤（尚未確認 Persona），不再是未知通道 |
| 重開舊 OpenAI Project 後，新草稿 model 仍是 `gpt-5.6-luna` | `openOrCreateDraft` 把 provider 改成 `openrouter`，卻原樣複製舊 OpenAI model id | 改為使用 OpenRouter 預設 `openai/gpt-4o-mini`；歷史 snapshot 仍讀 `openai` / `gpt-5.6-luna` |
| `run.mocked` 在 OpenRouter 計畫下寫入 Gemini mock envelope | 直接 `run.mocked` 路徑固定呼叫 `mockGeminiResult`；佇列路徑已分流 | 改依 `approved.plan.provider` 選擇 mock；`rawResponse.provider` 為 `openrouter` |

主 GUI 送出走 `queue.enqueue` / `queue.enqueueBatch`，因此第一項不會擋日常 Live 按鈕；第二項會讓重開舊 OpenAI 專案後的新 Live 請求帶無效 OpenRouter model id。

## 已完成

- `IPC_CHANNELS` 新增 `run.liveOpenrouter`（保留 `run.liveOpenai` 作為遷移導引錯誤通道）。
- 重開歷史 OpenAI Project 時，新請求草稿改用 OpenRouter 預設模型；不改寫既有 Run。
- `run.mocked` 對 OpenRouter 計畫使用 `mockOpenrouterResult`。
- 移除 `session.ts` 未使用的 `liveOpenaiGenerate` 匯入。
- 修正 `docs/product/v04-usability-improvements.md` 增量 5 殘留「OpenRouter 路徑尚未存在」句。

## 驗證

- 先寫失敗測試再修：core `isIpcChannel("run.liveOpenrouter")`、desktop 派遣 `run.liveOpenrouter`、OpenRouter mocked envelope、重開 OpenAI Project 不照搬 model。修補前皆紅。
- `npm test`：183 個 JavaScript/TypeScript tests + 24 個 Python tests，共 207 個通過。
- `npm run build`：core、project-store、Gemini/OpenAI/OpenRouter adapters、Desktop（Main / Preload / Renderer）全數建置成功。
- `git diff --check`：通過。
- 沒有真實 provider 呼叫；全面使用 mocked transport。
- 沒有讀取、輸出或洩漏真實金鑰。
- 沒有未授權的 Git push 或 commit。
- 未做人工 GUI walkthrough 或 Electron 視窗操作。

## 未執行與邊界

- 佇列路徑的 OpenRouter mock / 舊 OpenAI Job 拒絕在修補前已通過，未再改行為。
- Renderer 在 `providerMetadata` 尚未載入時，仍可能把合法 catalog 模型暫時標成自訂；本次未改 UI。
- 尚未執行真實 OpenRouter 網路呼叫。

## 下一步

接續 v0.4 原訂規格：Preflight Review 評估、結果選取與 Synthesis、CSV/PDF 匯出。人工 GUI walkthrough 與真實 OpenRouter 呼叫仍待授權。
