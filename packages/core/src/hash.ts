import { createHash } from "node:crypto";

export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      output[key] = sortKeys(input[key]);
    }
    return output;
  }
  return value;
}

export function compactJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

export function sha256Bytes(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashJson(value: unknown): string {
  return sha256Bytes(compactJson(value));
}
