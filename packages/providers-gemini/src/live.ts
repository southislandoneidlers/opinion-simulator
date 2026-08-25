import type { ExecutionPlan, StructuredResult } from "@opinion-simulator/core";
import { isStructuredResult } from "@opinion-simulator/core";

export function geminiCredentialAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
}

export async function liveGeminiGenerate(plan: ExecutionPlan): Promise<{
  result: StructuredResult;
  rawResponse: unknown;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini credential is not available in the main process");
  }
  const sections = plan.renderedPromptSections;
  const prompt = [
    sections.systemAndTaskRules,
    sections.persona,
    sections.sourceMaterial,
    sections.questions,
    sections.outputSchema,
    sections.modelAndSampling
  ].join("\n\n");
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
