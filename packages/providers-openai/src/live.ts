import type { ExecutionPlan, StructuredResult } from "@opinion-simulator/core";
import { assemblePrompt, isStructuredResult } from "@opinion-simulator/core";

/**
 * v0.2 increment 2: OpenAI provider. The API key is passed in explicitly by
 * the desktop main process; this module never reads process.env or logs
 * secrets itself.
 */
export function openaiCredentialAvailable(apiKey?: string | null): boolean {
  return Boolean(apiKey && apiKey.trim());
}

export async function liveOpenaiGenerate(
  plan: ExecutionPlan,
  options?: { apiKey?: string | null }
): Promise<{
  result: StructuredResult;
  rawResponse: unknown;
}> {
  const apiKey = options?.apiKey?.trim();
  if (!apiKey) {
    throw new Error("OpenAI credential is not available in the main process");
  }
  if (plan.provider !== "openai") {
    throw new Error(`ExecutionPlan provider is ${plan.provider}, not openai`);
  }
  // Static/repeated sections first, per-Run content last — one canonical
  // ordering contract shared with the Gemini path and the Python Skill.
  const prompt = assemblePrompt(plan);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: plan.model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: plan.settings.temperature ?? undefined,
      max_tokens: plan.settings.maxOutputTokens ?? undefined
    })
  });
  const payload = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "OpenAI request failed");
  }
  const text = payload.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OpenAI response was not valid JSON");
  }
  if (!isStructuredResult(parsed)) {
    throw new Error("OpenAI JSON did not match the structured Result contract");
  }
  // Only a redacted envelope is returned; the raw provider payload is never
  // persisted verbatim.
  const redacted = { text, model: plan.model };
  return { result: parsed, rawResponse: redacted };
}
