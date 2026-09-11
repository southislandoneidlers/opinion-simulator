# Opinion Simulator 意見模擬器

[English](README.md)

給研究者用的本機桌面工具：你提供一份材料與**已確認的 Persona**，它預測這個角色
可能怎麼回應。

## 為什麼做這個

許多意見模擬做法很重：雲端平台、額外帳號，或要跑很長一段才看得到什麼資料會送出
本機。

這個專案把**研究路徑**做小：

- 本機桌面 App、本機 Project 檔
- 你自己帶模型金鑰
- 送出前的 Preflight 會顯示這次實際外傳的材料、Persona、問題與模型
- 每個 Persona 的結果可分開追溯

**安裝路徑**並不小。你仍需要 Node.js 開發環境、本機建置 Electron，以及自己的
Gemini 與／或 OpenRouter API 金鑰。目前沒有簽章安裝檔。

## 現況（2026-09）

桌面 tracer 已做到 v0.4 使用回饋的五項增量：

- 匯入一份 Workbook（`.xlsx`），含 1–30 個 Persona、問題與一份材料
- 執行前需確認 Persona；本機問題庫可重用
- Preflight 預覽；預測聲明與精確計畫核准分開
- 看得到送出狀態，並防止重複送出
- 同一次送出的結果可在同一頁比較
- 新請求走 Gemini 直連或 OpenRouter；歷史 OpenAI 結果仍可讀
- 憑證存在 macOS Keychain 或 Windows Credential Manager，並保留環境變數後備

這個工作樹還沒有：簽章／公證安裝檔、CSV/PDF 匯出、桌面版的選取結果綜整，或
受支援的 v1.0 發行。

Python Skill CLI 仍可用來驗證 Project 目錄。它是原型，不是主要介面。

## 安全設計

- 無原文支持的 Persona 欄位保持未提供；推論欄位需逐一確認。
- Preflight 計畫雜湊過期即拒絕執行。
- 每個不可變 Run 記錄版本、雜湊與未含憑證的原始模型回應。
- 寫入端永不刪除既有 Project 內容。非空且不是有效 Project 的目錄會被拒絕。

## 本機執行

開發環境為 macOS 上的 Node.js 22。複製倉庫、安裝套件，再啟動桌面 App：

```sh
git clone https://github.com/southislandoneidlers/opinion-simulator.git
cd opinion-simulator
npm install
npm test
npm run build
npm run start -w @opinion-simulator/desktop
```

在 App 的設定頁寫入金鑰，或在啟動 Electron 的 shell 匯出 `GEMINI_API_KEY` /
`OPENROUTER_API_KEY`。不要把金鑰放進 Project 檔。`.env` 已被 gitignore；
`.env.example` 只是 Gemini 後備範本。

用 Skill CLI 驗證 Project 目錄：

```sh
python3 -B .agents/skills/opinion-simulator/scripts/opinion_simulator.py \
  validate-project <專案目錄>
```

## 文件

- [文件索引](docs/README.md)
- [產品規格](docs/product/spec.md)
- [範例](examples/README.md)
- [貢獻](CONTRIBUTING.md)
- [安全](SECURITY.md)

## 授權

Apache License 2.0。見 [`LICENSE`](LICENSE) 與 [`NOTICE`](NOTICE)。

## 說明

輸出是依 Persona 與材料產生的 AI 模擬，不是真實引言，也不得當成受訪者原話。
