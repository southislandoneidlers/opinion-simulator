# 2026-09-08：v0.4 增量 1 送出狀態與防止重複送出

## 任務範圍

在提交既有 v0.3 工作區（`e251564`）之後，實作 v0.4 第一個增量：可見送出狀態
與 Main／queue 以 `submissionId` 防止重複建立 Jobs。

## 已完成

- `queue.enqueue` 與 `queue.enqueueBatch` 必須帶有效 `submissionId`。同一識別
  的並行或後續 IPC 回傳既有 Jobs，不建立第二批。
- 新增 `queue.submissionStatus`。找不到該識別時不建立 Jobs。
- 接受失敗會持久化；相同識別重送回傳同一錯誤，不補建 Jobs。
- 新 Preflight 後的新 `submissionId` 可以建立新批次。
- `run-queue.json` 增加可選 `submissions`；舊檔沒有此欄仍可讀、載入時不改寫。
- Renderer 在執行按鈕旁顯示文字狀態，送出中鎖定按鈕；enqueue 回應遺失時先查
  既有送出。狀態文案有單元測試。
- 同步 product、roadmap、UX、architecture、test-strategy 與文件入口。

## 驗證

- `npm test`：149 個 JavaScript tests + 24 個 Python tests，共 173 個通過。
- `npm run build`：core、project-store、Gemini/OpenAI adapters、Desktop Main、
  Preload、Renderer production build 通過。
- `git diff --check`：通過。
- 沒有真實 provider 呼叫；沒有人工 GUI walkthrough。
- 沒有讀取、輸出或變更真實憑據。
- 沒有 Git push。本任務前已依使用者指示提交 v0.3／規格（`e251564`）。
  增量 1 程式尚未另開 commit。

## 未執行與邊界

- 未宣告 v0.3 跨平台或全部 exit criteria 完成。
- OpenRouter 尚未存在；此增量只讓現有 mocked 與 Gemini／OpenAI live enqueue
  走同一套 submission IPC。
- 增量 2–5（Preflight 聲明分離、同頁比較、問題庫、OpenRouter）尚未開始。

## 下一步

v0.4 增量 2：Preflight 聲明勾選與精確計畫預覽／核准分離。
