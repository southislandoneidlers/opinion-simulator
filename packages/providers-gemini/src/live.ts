import type { ExecutionPlan, StructuredResult } from "@opinion-simulator/core";
import { assemblePrompt, isStructuredResult } from "@opinion-simulator/core";

/**
 * v0.2 increment 1: the API key is passed in explicitly by the desktop main
 * process. This package has no credential fallback and never reads process.env.
 */
export function geminiCredentialAvailable(apiKey?: string | null): boolean {
  return Boolean(apiKey && apiKey.trim());
}

export async function liveGeminiGenerate(
  plan: ExecutionPlan,
  options?: { apiKey?: string | null }
): Promise<{
  result: StructuredResult;
  rawResponse: unknown;
}> {
  const apiKey = options?.apiKey?.trim();
  if (!apiKey) {
    throw new Error("Gemini credential is not available in the main process");
  }
  if (plan.provider !== "gemini") {
    throw new Error(`ExecutionPlan provider is ${plan.provider}, not gemini`);
  }
  // Static/repeated sections first, per-Run content last — one canonical
  // ordering contract shared with the OpenAI path and the Python Skill.
  const prompt = assemblePrompt(plan);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(plan.model)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: plan.settings.temperature ?? undefined,
        maxOutputTokens: plan.settings.maxOutputTokens ?? undefined
      }
    })
  });
  const payload = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Gemini request failed");
  }
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini response was not valid JSON");
  }
  if (!isStructuredResult(parsed)) {
    throw new Error("Gemini JSON did not match the structured Result contract");
  }
  const redacted = { text, model: plan.model };
  return { result: parsed, rawResponse: redacted };
}
