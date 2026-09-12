# 2026-09-12：模型預設、樣本數、prompt 組裝與規則精簡

## 任務範圍

依使用者確認的四項小型改動更新目前 Desktop 與 v0.0 Skill 契約：模型目錄、
樣本數、prompt 組裝，以及預設送出規則。未改動已完成 Run、報告或其他歷史
Project artifact。

## 已完成

- Gemini 新請求目錄的預設改為 `gemini-3.8-flash`。
- OpenRouter 新請求目錄精簡為唯一的 `openrouter/free`。它是 Free Models Router，
  每次請求會挑選可用免費模型，因此適合實驗與低量用途，非固定模型或可用性保證。
- `sampleCount` 全路徑統一為整數 1–10：core ExecutionPlan、Workbook 驗證、Desktop
  Preflight／Queue、Project schema，以及 v0.0 Python Skill。
- 修正 Project 寫入僅在剛好 3 份 Sample 時才產生 Stability Comparison 的問題；現在
  2–10 份都會建立比較，1 份維持不適用。
- `assemblePrompt` 固定使用目前 canonical section order，只負責 join，不再依
  stored template version 分支。歷史 Project 仍以不可變 artifact 方式可讀。
- 從 TypeScript `DEFAULT_RULES` 與 Python 對應系統規則移除重複的 prediction
  disclaimer；Preflight、報告與 `REAL_PERSON_WARNING` 均保留。
- 更新 canonical product／format／test 文件、schema、Skill 說明與 golden fixtures。

## 驗證

- `npm run build`：core、project-store、Gemini/OpenAI/OpenRouter adapters、Desktop
  Main／Preload／Renderer 全部成功。
- `npm test`：183 個 JavaScript/TypeScript tests + 25 個 Python Skill tests，合計
  208 個通過。
- `git diff --check`：通過。
- 新回歸涵蓋：1、2、10 的 Sample count；0、11、非整數拒絕；Desktop 2-Sample
  persistence 會產生 exact-normalized Stability Comparison；固定 prompt order；
  `DEFAULT_RULES` 不再重複 disclaimer；OpenRouter request 使用 `openrouter/free`。

## 外部與安全邊界

- 以官方文件查核：`gemini-3.8-flash` 為 Gemini API model code，`openrouter/free`
  為 OpenRouter Free Models Router。
- 沒有真實 Gemini 或 OpenRouter provider 呼叫，也沒有讀取、輸出或儲存任何憑證。
- 未進行人工 Desktop GUI walkthrough；本次驗證限於 mocked／automated paths 與 build。
