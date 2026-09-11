import type { ExecutionPlan, StructuredResult } from "@opinion-simulator/core";
import { assemblePrompt, isStructuredResult } from "@opinion-simulator/core";

/**
 * v0.4 increment 5: OpenRouter provider adapter.
 *
 * Directs new requests through OpenRouter's OpenAI-compatible Chat Completions
 * endpoint (https://openrouter.ai/api/v1/chat/completions).
 *
 * Security & boundary rules:
 * - The API key is passed in explicitly by the desktop main process.
 * - This module never reads process.env or logs secrets.
 * - Only a redacted envelope is returned in rawResponse; key material is never persisted.
 */

export const OPENROUTER_CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_OPENROUTER_TIMEOUT_MS = 60000;

export function openrouterCredentialAvailable(apiKey?: string | null): boolean {
  return Boolean(apiKey && apiKey.trim());
}

export type LiveOpenrouterOptions = {
  apiKey?: string | null;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
};

export async function liveOpenrouterGenerate(
  plan: ExecutionPlan,
  options?: LiveOpenrouterOptions
): Promise<{
  result: StructuredResult;
  rawResponse: unknown;
}> {
  const apiKey = options?.apiKey?.trim();
  if (!apiKey) {
    throw new Error("OpenRouter credential is not available in the main process");
  }
  if (plan.provider !== "openrouter") {
    throw new Error(`ExecutionPlan provider is ${plan.provider}, not openrouter`);
  }

  // Static/repeated sections first, per-Run content last — canonical v2 ordering contract.
  const prompt = assemblePrompt(plan);

  const timeoutMs = options?.timeoutMs ?? DEFAULT_OPENROUTER_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const fetchImpl = options?.fetchFn ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/earendil-works/opinion-simulator",
        "X-Title": "Opinion Simulator"
      },
      body: JSON.stringify({
        model: plan.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: plan.settings.temperature ?? undefined,
        max_tokens: plan.settings.maxOutputTokens ?? undefined
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`OpenRouter 請求逾時（超過 ${timeoutMs}ms）`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`OpenRouter 連線失敗：${message}`);
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: unknown };
    choices?: Array<{ message?: { content?: string } }>;
  } | null;

  if (!response.ok) {
    const errorDetail = payload?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`OpenRouter 請求失敗：${errorDetail}`);
  }

  const text = payload?.choices?.[0]?.message?.content ?? "";
  if (!text) {
    throw new Error("OpenRouter 回應內容為空");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OpenRouter response was not valid JSON");
  }

  if (!isStructuredResult(parsed)) {
    throw new Error("OpenRouter JSON did not match the structured Result contract");
  }

  // Redacted envelope: text and model name only; no credentials or headers persisted.
  const redacted = { text, model: plan.model, provider: "openrouter" };
  return { result: parsed, rawResponse: redacted };
}
