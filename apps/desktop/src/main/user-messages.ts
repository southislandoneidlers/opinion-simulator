import type { ProviderId } from "@opinion-simulator/core";

const PROVIDER_LABEL: Record<ProviderId, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI"
};

export function providerLabel(provider: ProviderId): string {
  return PROVIDER_LABEL[provider];
}

export function stalePreflightMessage(kind: "consumed" | "changed", runId?: string): string {
  if (kind === "consumed") {
    const run = runId ? `（${runId}）` : "";
    return `【Preflight】上一筆 Run${run} 已完成，這份計畫預覽已用過。請到「Preflight」頁按「產生目前計畫預覽」，再執行下一筆。`;
  }
  return "【Preflight】材料、Persona、問題或設定已變更，舊的計畫預覽已過期。請到「Preflight」頁重新產生預覽並承認預測聲明。";
}

export function wrapProviderCallError(
  provider: ProviderId,
  error: unknown,
  apiKey?: string | null
): Error {
  let message = error instanceof Error ? error.message : String(error);
  if (apiKey && apiKey.length > 0 && message.includes(apiKey)) {
    message = message.split(apiKey).join("[redacted]");
  }
  if (message.startsWith("【")) {
    return new Error(message);
  }
  const label = providerLabel(provider);
  if (/not available|未偵測到/i.test(message)) {
    return new Error(
      `【設定】未偵測到 ${label} 憑證。請到「總覽」或「執行」的設定區貼上 API key，按「儲存到系統憑證儲存區」，並確認出現「已安全儲存」。`
    );
  }
  if (/not valid|invalid api key|incorrect api key|unauthorized|401|403/i.test(message)) {
    return new Error(
      `【${label}】金鑰未被服務接受。請確認設定區顯示「已安全儲存」的是正確金鑰，以及帳號有此模型權限。儲存成功不代表服務已接受。`
    );
  }
  return new Error(`【${label}】請求失敗：${message}。這發生在對外呼叫，不是專案檔寫入。`);
}

export function toUserFacingMessage(raw: string): string {
  if (raw.startsWith("【")) {
    return raw;
  }
  const rules: Array<[RegExp, string]> = [
    [
      /^Project draft is not open$/,
      "【專案】目前沒有開啟的草稿。請先到「總覽」選擇專案資料夾。"
    ],
    [
      /^尚未確認 Persona Version$/,
      "【Persona】尚未確認 Persona Version。請到「Persona」頁輸入背景後按「確認 Persona Version」。"
    ],
    [
      /^Source 與至少一題問題為必填$/,
      "【材料／問題】Source 與至少一題問題為必填。請到「材料」與「問題」頁補齊，再到「Preflight」產生預覽。"
    ],
    [
      /^Preflight 必須先承認預測聲明$/,
      "【Preflight】尚未承認預測聲明。請到「Preflight」頁勾選「我承認這是 AI 模擬，不是真實引言」。"
    ],
    [
      /Preflight 已過期/,
      stalePreflightMessage("changed")
    ],
    [
      /Preflight 的供應商與執行通道不相符/,
      "【執行】Preflight 的供應商與按下的 Live 按鈕不相符。請到「Preflight」重新產生預覽後，再按對應供應商的 Live Run。"
    ],
    [
      /此資料夾不是有效的專案/,
      "【專案】選到的資料夾不是有效專案。請選空資料夾建立新專案，或選既有專案資料夾。"
    ],
    [
      /^API key 不可為空白$/,
      "【設定】API key 不可為空白。請貼上金鑰後再按儲存。"
    ],
    [
      /^無法寫入系統憑證儲存區$/,
      "【設定】無法寫入系統憑證儲存區。金鑰沒有被儲存。請再試一次，或改以主程序環境變數啟動。"
    ],
    [
      /^無法讀取系統憑證儲存區$/,
      "【設定】無法讀取系統憑證儲存區。請再試一次，或改以主程序環境變數啟動。"
    ],
    [
      /Gemini credential is not available/,
      wrapProviderCallError("gemini", new Error("not available")).message
    ]
  ];
  for (const [pattern, message] of rules) {
    if (pattern.test(raw)) {
      return message;
    }
  }
  return raw;
}

export function toUserFacingError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error);
  const next = toUserFacingMessage(raw);
  return next === raw && error instanceof Error ? error : new Error(next);
}
