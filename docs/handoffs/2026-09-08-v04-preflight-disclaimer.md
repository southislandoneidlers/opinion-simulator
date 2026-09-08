# 2026-09-08：v0.4 增量 2 Preflight 聲明與計畫核准分離

## 任務範圍

先提交增量 1（`b97fb86`），再實作 v0.4 第二個增量：預測聲明勾選與目前計畫預覽／
核准分離。

## 已完成

- 聲明存在 Main 記憶體工作階段，不寫入 Project 或 app-data。
- 新增 IPC `preflight.setDisclaimer`。`preflight.render` 與 `project.create`
  回傳 `disclaimerAcknowledged`。
- 產生預覽、改草稿、完成 Run 都不重設勾選。切換目前開啟的 Project 會重設。
- 送出需要工作階段已勾選、enqueue payload 承認、以及目前 plan hash。
  勾選本身不建立 Job 或 approval。
- Renderer 勾選走 Main；預覽與完成不再把核取方塊清掉。
- 同步 product、roadmap、UX、security、test-strategy 與文件入口。

## 驗證

- `npm test`：154 個 JavaScript tests + 24 個 Python tests，共 178 個通過。
- `npm run build`：core、project-store、Gemini/OpenAI adapters、Desktop Main、
  Preload、Renderer production build 通過。
- `git diff --check`：通過。
- 沒有真實 provider 呼叫；沒有人工 GUI walkthrough。
- 沒有讀取、輸出或變更真實憑據。
- 沒有 Git push。增量 1 已依指示提交（`b97fb86`）；增量 2 程式尚未另開 commit。

## 未執行與邊界

- 重啟 App 會重設聲明，因為沒有持久全域設定，這是規格要求。
- 增量 3–5（同頁比較、問題庫、OpenRouter）尚未開始。

## 下一步

v0.4 增量 3：同次送出、同份材料的 Persona 意見同頁比較。
