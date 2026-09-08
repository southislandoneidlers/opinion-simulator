import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  KEYCHAIN_SERVICE,
  PROVIDER_ACCOUNTS,
  clearProviderApiKey,
  isProviderId,
  fingerprintKey,
  loadProviderApiKey,
  markProviderVerified,
  resetProviderVerification,
  resolveProviderCredential,
  setCredentialStoreForTests,
  storeProviderApiKey,
  type CredentialStore
} from "./credentials";

const FAKE_KEY = "FAKE-KEY-FOR-TESTS-do-not-use-real-keys";

type RecordedCall = { method: "get" | "set" | "delete"; service: string; account: string };

function makeStore(overrides?: {
  stored?: Map<string, string> | null;
  failFindWithError?: boolean;
  failSetWithError?: string;
}): { store: CredentialStore; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const stored = overrides?.stored === null ? null : (overrides?.stored ?? new Map<string, string>());
  const store: CredentialStore = {
    async getPassword(service, account) {
      calls.push({ method: "get", service, account });
      if (overrides?.failFindWithError) {
        throw new Error("credential store unavailable");
      }
      return stored?.get(account) ?? null;
    },
    async setPassword(service, account, value) {
      calls.push({ method: "set", service, account });
      if (overrides?.failSetWithError) {
        throw new Error(overrides.failSetWithError);
      }
      if (!stored) {
        throw new Error("credential store unavailable");
      }
      stored.set(account, value);
    },
    async deletePassword(service, account) {
      calls.push({ method: "delete", service, account });
      if (!stored) {
        throw new Error("credential store unavailable");
      }
      return stored.delete(account);
    }
  };
  return { store, calls };
}

describe("keychain-backed provider credential storage", () => {
  const previousEnv: Record<string, string | undefined> = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  };

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    resetProviderVerification();
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("stores each provider key through the native store without command arguments", async () => {
    const { store, calls } = makeStore();
    setCredentialStoreForTests(store);
    await storeProviderApiKey("gemini", `  ${FAKE_KEY}  `);
    await storeProviderApiKey("openai", FAKE_KEY);
    expect(calls).toEqual([
      { method: "set", service: KEYCHAIN_SERVICE, account: PROVIDER_ACCOUNTS.gemini },
      { method: "set", service: KEYCHAIN_SERVICE, account: PROVIDER_ACCOUNTS.openai }
    ]);
    expect(JSON.stringify(calls)).not.toContain(FAKE_KEY);
  });

  it("resolves the Keychain entry first and reports its source without exposing the value", async () => {
    const stored = new Map<string, string>([
      [PROVIDER_ACCOUNTS.gemini, FAKE_KEY],
      [PROVIDER_ACCOUNTS.openai, "OTHER-FAKE-KEY"]
    ]);
    setCredentialStoreForTests(makeStore({ stored }).store);
    process.env.GEMINI_API_KEY = "ENV-SHOULD-NOT-WIN";
    const resolved = await resolveProviderCredential("gemini");
    expect(resolved).toEqual({
      available: true,
      source: "keychain",
      fingerprint: fingerprintKey(FAKE_KEY),
      verifiedByUse: false
    });
    expect(resolved.fingerprint).toMatch(/^[a-f0-9]{8}$/);
    expect(resolved.fingerprint).not.toBe(FAKE_KEY);
    expect(JSON.stringify(resolved)).not.toContain(FAKE_KEY);
    // The main-process accessor is the only way to obtain the value itself.
    expect(await loadProviderApiKey("gemini")).toBe(FAKE_KEY);
    expect(await loadProviderApiKey("openai")).toBe("OTHER-FAKE-KEY");
  });

  it("falls back to per-provider environment variables when no Keychain entry exists", async () => {
    setCredentialStoreForTests(makeStore().store);
    process.env.GEMINI_API_KEY = FAKE_KEY;
    expect(await resolveProviderCredential("gemini")).toEqual({
      available: true,
      source: "env",
      fingerprint: fingerprintKey(FAKE_KEY),
      verifiedByUse: false
    });
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = FAKE_KEY;
    expect(await resolveProviderCredential("openai")).toEqual({
      available: true,
      source: "env",
      fingerprint: fingerprintKey(FAKE_KEY),
      verifiedByUse: false
    });
    expect(await resolveProviderCredential("gemini")).toEqual({
      available: false,
      source: null,
      fingerprint: null,
      verifiedByUse: false
    });
  });

  it("tracks verifiedByUse status independently", async () => {
    setCredentialStoreForTests(makeStore().store);
    process.env.GEMINI_API_KEY = FAKE_KEY;
    expect((await resolveProviderCredential("gemini")).verifiedByUse).toBe(false);

    markProviderVerified("gemini", FAKE_KEY);
    expect((await resolveProviderCredential("gemini")).verifiedByUse).toBe(true);

    process.env.GEMINI_API_KEY = "A-DIFFERENT-FAKE-KEY";
    expect((await resolveProviderCredential("gemini")).verifiedByUse).toBe(false);

    resetProviderVerification("gemini");
    expect((await resolveProviderCredential("gemini")).verifiedByUse).toBe(false);
  });

  it("fails safely to the environment fallback when the Keychain interaction breaks", async () => {
    setCredentialStoreForTests(makeStore({ failFindWithError: true }).store);
    process.env.GEMINI_API_KEY = FAKE_KEY;
    expect(await resolveProviderCredential("gemini")).toEqual({
      available: true,
      source: "env",
      fingerprint: fingerprintKey(FAKE_KEY),
      verifiedByUse: false
    });
    delete process.env.GEMINI_API_KEY;
    expect(await resolveProviderCredential("gemini")).toEqual({
      available: false,
      source: null,
      fingerprint: null,
      verifiedByUse: false
    });
    expect(await loadProviderApiKey("gemini")).toBeNull();
  });

  it("rejects blank keys and unknown providers without touching the Keychain", async () => {
    const { store, calls } = makeStore();
    setCredentialStoreForTests(store);
    await expect(storeProviderApiKey("gemini", "   ")).rejects.toThrow("API key");
    expect(isProviderId("claude")).toBe(false);
    expect(isProviderId("openai")).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("deletes the Keychain entry and reports absence cleanly", async () => {
    const stored = new Map<string, string>([[PROVIDER_ACCOUNTS.openai, FAKE_KEY]]);
    const { store } = makeStore({ stored });
    setCredentialStoreForTests(store);
    await expect(clearProviderApiKey("openai")).resolves.toBe(true);
    // Deleting again is not an error.
    await expect(clearProviderApiKey("openai")).resolves.toBe(false);
  });

  it("redacts native-store errors even when their message contains the submitted value", async () => {
    setCredentialStoreForTests(makeStore({ failSetWithError: `native failure: ${FAKE_KEY}` }).store);
    await expect(storeProviderApiKey("gemini", FAKE_KEY)).rejects.toThrow("無法寫入系統憑證儲存區");
    await expect(storeProviderApiKey("gemini", FAKE_KEY)).rejects.not.toThrow(FAKE_KEY);
  });
});
