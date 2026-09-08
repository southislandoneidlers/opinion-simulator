import { createHash } from "node:crypto";
import keytar from "keytar";
import type { ProviderId } from "@opinion-simulator/core";

/**
 * Provider API keys live in the operating system credential store: macOS
 * Keychain and Windows Credential Manager through Keytar.
 *
 * Contract rules enforced here:
 * - Key material never becomes a command-line argument, Project file, log, or
 *   Renderer state. Callers receive only a boolean or source label.
 * - The v0.1 opt-in exception (a main-process environment variable) remains
 *   the fallback when no Keychain entry exists or the interaction fails.
 * - The native bridge supports macOS and Windows. Other platforms use only
 *   the documented main-process environment-variable fallback.
 */

export const KEYCHAIN_SERVICE = "opinion-simulator";

export const PROVIDER_ACCOUNTS: Record<ProviderId, string> = {
  gemini: "gemini-api-key",
  openai: "openai-api-key"
};

export const PROVIDER_ENV_KEYS: Record<ProviderId, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY"
};

export type CredentialSource = "keychain" | "env" | null;

const verifiedCredentialFingerprints = new Map<ProviderId, string>();

export function markProviderVerified(provider: ProviderId, credentialValue: string): void {
  verifiedCredentialFingerprints.set(provider, fingerprintKey(credentialValue));
}

export function resetProviderVerification(provider?: ProviderId): void {
  if (provider) {
    verifiedCredentialFingerprints.delete(provider);
  } else {
    verifiedCredentialFingerprints.clear();
  }
}

/** Short one-way identity for Renderer display. Never a key suffix. */
export function fingerprintKey(value: string): string {
  return createHash("sha256").update(value.trim(), "utf8").digest("hex").slice(0, 8);
}

export type CredentialStore = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

let credentialStore: CredentialStore = keytar;

/** Test seam: replace the native bridge without touching the OS credential store. */
export function setCredentialStoreForTests(next: CredentialStore): void {
  credentialStore = next;
}

export function supportsCredentialStore(): boolean {
  return process.platform === "darwin" || process.platform === "win32";
}

async function findPassword(account: string): Promise<string | null> {
  try {
    return await credentialStore.getPassword(KEYCHAIN_SERVICE, account);
  } catch {
    throw new Error("無法讀取系統憑證儲存區");
  }
}

async function upsertPassword(account: string, value: string): Promise<void> {
  try {
    await credentialStore.setPassword(KEYCHAIN_SERVICE, account, value);
  } catch {
    // Native errors can include implementation details. Never propagate them
    // through IPC because a submitted key must not appear in UI state.
    throw new Error("無法寫入系統憑證儲存區");
  }
}

async function deletePassword(account: string): Promise<boolean> {
  try {
    return await credentialStore.deletePassword(KEYCHAIN_SERVICE, account);
  } catch {
    throw new Error("無法從系統憑證儲存區刪除憑證");
  }
}

/**
 * Resolve a provider credential without exposing it. Returns only whether one
 * is usable plus where it came from; the value itself stays inside this module
 * and is handed solely to the provider call in the main process.
 */
export async function resolveProviderCredential(
  provider: ProviderId
): Promise<{ available: boolean; source: CredentialSource; fingerprint: string | null; verifiedByUse: boolean }> {
  if (supportsCredentialStore()) {
    try {
      const storedKey = await findPassword(PROVIDER_ACCOUNTS[provider]);
      if (storedKey) {
        return {
          available: true,
          source: "keychain",
          fingerprint: fingerprintKey(storedKey),
          verifiedByUse:
            verifiedCredentialFingerprints.get(provider) === fingerprintKey(storedKey)
        };
      }
    } catch {
      // A broken credential-store interaction falls through to the documented
      // main-process environment-variable fallback.
    }
  }
  const envKey = readEnvKey(provider);
  return envKey
    ? {
        available: true,
        source: "env",
        fingerprint: fingerprintKey(envKey),
        verifiedByUse: verifiedCredentialFingerprints.get(provider) === fingerprintKey(envKey)
      }
    : { available: false, source: null, fingerprint: null, verifiedByUse: false };
}

/** Main-process-only accessor for a resolved key. Never crosses IPC. */
export async function loadProviderApiKey(provider: ProviderId): Promise<string | null> {
  if (supportsCredentialStore()) {
    try {
      const storedKey = await findPassword(PROVIDER_ACCOUNTS[provider]);
      if (storedKey) {
        return storedKey;
      }
    } catch {
      // Fall through to environment variable below.
    }
  }
  return readEnvKey(provider);
}

function readEnvKey(provider: ProviderId): string | null {
  const value = process.env[PROVIDER_ENV_KEYS[provider]];
  return value && value.trim() ? value : null;
}

export function isProviderId(value: unknown): value is ProviderId {
  return value === "gemini" || value === "openai";
}

export async function storeProviderApiKey(provider: ProviderId, value: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("API key 不可為空白");
  }
  if (!supportsCredentialStore()) {
    throw new Error("此平台尚未支援系統憑證儲存；請以主程序環境變數啟動");
  }
  await upsertPassword(PROVIDER_ACCOUNTS[provider], trimmed);
  resetProviderVerification(provider);
}

export async function clearProviderApiKey(provider: ProviderId): Promise<boolean> {
  if (!supportsCredentialStore()) {
    return false;
  }
  resetProviderVerification(provider);
  return deletePassword(PROVIDER_ACCOUNTS[provider]);
}
