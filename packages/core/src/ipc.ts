export const IPC_CHANNELS = [
  "desktop.ping",
  "provider.catalog",
  "project.create",
  "project.open",
  "project.snapshot",
  "project.saveDraft",
  "project.confirmPersona",
  "project.selectPersonas",
  "preflight.render",
  "run.mocked",
  "run.liveGemini",
  "run.liveOpenai",
  "queue.enqueue",
  "queue.enqueueBatch",
  "queue.list",
  "queue.cancel",
  "queue.retry",
  "queue.resumeMissing",
  "credential.status",
  "credential.set",
  "credential.clear",
  "persona.library.list",
  "persona.library.setAutosave",
  "persona.library.remove",
  "persona.library.importFromProject",
  "desktop.chooseDirectory",
  "desktop.chooseWorkbook",
  "workbook.validate",
  "project.getLastProject",
  "workbook.importDraft",
  "desktop.chooseMaterialFile",
  "material.extractFile"
] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[number];

export const FORBIDDEN_IPC_KEY =
  /(api[_-]?key|token|secret|password|authorization|cookie|credential)/i;

// Published measurement metadata may mention tokens without carrying a credential.
// Keep this exact-name allow-list narrow so unknown credential-shaped keys still fail closed.
const PUBLISHED_NON_CREDENTIAL_IPC_KEYS = new Set([
  "approximateInputTokensPerRequest",
  "approximateTotalInputTokens"
]);

export function isIpcChannel(value: string): value is IpcChannel {
  return (IPC_CHANNELS as readonly string[]).includes(value);
}

/**
 * v0.2 increment 7: walk an IPC value and refuse credential-shaped *keys*.
 * String contents are not scanned, so Source text may mention "apiKey".
 */
export function assertSafeIpcValue(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeIpcValue(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (
        FORBIDDEN_IPC_KEY.test(key) &&
        !PUBLISHED_NON_CREDENTIAL_IPC_KEYS.has(key)
      ) {
        throw new Error(`${path}.${key} is not allowed over IPC`);
      }
      assertSafeIpcValue(child, `${path}.${key}`);
    }
  }
}

export type IpcHandler = (payload: Record<string, unknown>) => unknown | Promise<unknown>;

/**
 * Testable dispatcher used by the desktop main process. Unknown channels,
 * non-object payloads, credential-shaped request keys, and credential-shaped
 * response keys all fail closed.
 */
export async function dispatchIpc(
  handlers: Record<string, IpcHandler>,
  channel: unknown,
  payload: unknown
): Promise<unknown> {
  if (typeof channel !== "string" || !isIpcChannel(channel)) {
    throw new Error("Unknown IPC channel");
  }
  if (payload !== undefined && payload !== null) {
    if (typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("IPC payload must be an object");
    }
  }
  assertSafeIpcValue(payload ?? {});
  const handler = handlers[channel];
  if (!handler) {
    throw new Error("Unknown IPC channel");
  }
  const result = await handler((payload ?? {}) as Record<string, unknown>);
  assertSafeIpcValue(result ?? null);
  return result;
}
