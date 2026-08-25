# Opinion Simulator 意見模擬器

> 2026-08-24 事故後重建版：原 README 於意外大規模刪除中遺失，此為依存活紀錄重寫的版本。

以「模擬特定角色可能如何回應一份材料」為核心的桌面研究工具。輸出是**依 Persona
與材料產生的 AI 預測，不是真實引言**。

## 現況（2026-08-24）

- v0.0 Skill Prototype：`.agents/skills/opinion-simulator/` 的 Python CLI 已於事故後
  以存活的 837 行公開測試與 golden fixtures 重建，23 項測試全數通過；golden 專案
  產物達逐位元組一致。
- 五個真實走查專案 `測`測驗用`、`測驗用-複驗`、`測驗用-專家2`、`測驗用-專家3`、
  `測驗用-綜整` 完整存活且重新驗證為 `valid`。計入的獨立專家走查為 3／3–5 下限。
- v0.1 Electron desktop tracer（`apps/desktop`）原始碼已逐字或依契約重建；
  Persona 階段採單一背景輸入、問題支援多題、UI 統一繁中文案、IPC 錯誤會顯示在狀態列。
- Live Gemini 為 opt-in，憑證只從主程序環境變數 `GEMINI_API_KEY` 讀取。

## 安全設計

- 使用者控制的 Persona：AI 只能整理草稿，無原文支持的欄位保持 not provided，
  推論需逐一確認。
- 可檢視的執行：Preflight 顯示外傳材料、Persona 版本、問題、prompt、模型與取樣計畫；
  計畫雜湊不符即拒絕執行。
- 可追溯的結果：每個不可變 Run 記錄版本與雜湊，含未含憑證的原始回應。
- 寫入防護：任何 Project 寫入目標必須是不存在或空目錄；系統永不刪除既有內容。

## 開發

```sh
npm test          # 各 workspace 測試 + Python Skill 測試套件
npm run build     # 建置 core / project-store / providers-gemini / desktop
npm run start -w @opinion-simulator/desktop   # 啟動桌面 App
python3 -B .agents/skills/opinion-simulator/scripts/opinion_simulator.py validate-project <專案>
```

文件索引見 `docs/README.md`；任務交接紀錄見 `docs/handoffs/README.md`。
