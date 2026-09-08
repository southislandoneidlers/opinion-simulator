# 2026-09-07：v0.4 使用回饋與下一版改進計畫

## 使用者確認

使用者回報已實測、正常運作，並要求將五項改進加入下一版：
OpenRouter 支援且在 OpenAI 相容條件成立時取代 OpenAI 直連、同批意見同頁比較、
Preflight 不重複勾選聲明、本機問題庫、送出後明顯的成功／失敗提示避免重複送出。
沒有提供完整測試矩陣；不能宣告全部 v0.3 exit criteria 或跨平台驗收完成。

## 本輪成果

- 新增 canonical [v0.4 使用回饋改進規格](../product/v04-usability-improvements.md)，
  依 to-spec 工作法記錄使用者故事、行為、實作邊界與公開 seam 驗收條件。
- 查核 OpenRouter 官方 OpenAI SDK 文件，相容介面符合目前 Chat Completions 遷移方向。
  記錄獨立憑證、目的地、模型能力驗證及舊 OpenAI 資料／待辦不靜默改送的要求。
- 更新 product、roadmap、UX、安全、測試策略與文件入口；舊 handoff 未改寫。
- 建議順序：送出防重／狀態 → Preflight → 批次同頁 → 問題庫 → OpenRouter。
  原 v0.4 Synthesis／匯出工作保留於這五項之後。

## 驗證與邊界

- 本次只改文件；程式功能尚未實作。
- `npm test`：137 個 JavaScript + 24 個 Python tests，共 161 個通過。
- `git diff --check`：通過。本次僅改文件，未重新執行 build 或 GUI walkthrough。
- 沒有真實 provider 呼叫；只讀取公開 OpenRouter 文件。
- 沒有讀取、輸出或變更真實憑據；沒有清理任何 Project 資料夾。
- 沒有 Git stage、commit、branch 或 push。

## 下一步

按新規格進入第一個增量：檢查送出與 queue 公開介面，先驗證並行重複送出的
失敗案例，再實作可見狀態與持久的送出防重。這份規格記錄不代表已執行此增量。
