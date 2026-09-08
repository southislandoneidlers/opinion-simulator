# 2026-09-03 v0.3 code-review remediation

## 任務範圍

針對前一輪 v0.3 實作做 test-first 修整。這份 handoff 是追加紀錄，不改寫前一份
implementation handoff；若兩者有差異，以本文件描述的較新狀態為準。

## 已修正

- Desktop Run 只送出使用者實際看過的 single/batch Preflight hash。Run 完成後清除
  當次預覽與聲明；下一次執行必須重新產生並檢視 Preflight。Main 仍會重算計畫並
  拒絕 stale hash。
- `sampleCount: 3` 會執行並逐一保存三個獨立 Sample；中斷重試只補缺少的 Sample。
  Run artifact 會寫入三份 Sample 與 deterministic exact-text Stability Comparison。
- Workbook 匯入不再自動確認 Persona 或寫入 Persona library。匯入保留原本的
  `personaId`，使用者在 App 明確確認時才建立 `PersonaVersion.id`。未確認前不能
  產生 Preflight。
- Persona library 加入 1–30 位已確認 Persona Version 多選，批次 Preflight 與 Queue
  維持每位 Persona 一個獨立 Job/Run。
- Workbook 樣本數仍可保存 1–100；目前 ExecutionPlan 只支援 1 或 3，因此其他值
  會在 executable Preflight fail closed，不會默默改成 1。
- PDF Flate stream 解壓加入 8 MiB `maxOutputLength`；超限會明確拒絕，不再無界限
  解壓或靜默當作空文字。
- `credential.status` 現在公開非敏感的 `verifiedByUse`。狀態綁定成功使用過的憑證
  fingerprint；憑證更換後不會沿用舊的已驗證標記。
- 單一 Job 執行錯誤會在 Queue 記錄後回傳給 Renderer；批次處理仍會繼續後續 Job。
- 批次 token estimate 改為加總每個 Persona plan，不再用第一位 Persona 的估算乘
  上整個矩陣。
- canonical product、roadmap、UX、architecture/security、Workbook 與 test-strategy
  文件已同步為實際行為。

## 驗證

- `npm test`：137 個 JavaScript tests + 24 個 Python tests，共 161 個通過。
- `npm run build`：core、project-store、Gemini/OpenAI adapters、Desktop Main、Preload、
  Renderer production build 全部通過。
- `git diff --check`：通過。
- 三樣本 Desktop regression 另以 Python `validate-project` 驗證產出的 Project 為
  `valid`。

## 未執行與邊界

- 沒有呼叫 Gemini 或 OpenAI 真實服務；`verifiedByUse` 的測試使用假憑證與測試 seam。
- 沒有讀取或輸出任何真實 token、密碼、密鑰或 cookie。
- 沒有進行打包後 GUI 人工 walkthrough；目前確認的是自動測試與 production build。
- 沒有執行 Git stage、commit、branch 或 push。

## 下一步

v0.3 的本機實作與 review remediation 已完成。進入 v0.4 前，建議由使用者做一次
實際桌面 GUI walkthrough（Workbook 匯入 → Persona 確認 → batch Preflight → mocked
三樣本 → grouped Results），並另外明確授權後才進行真實 provider smoke test。
