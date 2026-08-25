import { dialog, ipcMain } from "electron";
import { isIpcChannel } from "@opinion-simulator/core";
import {
  confirmDraftPersona,
  createDraft,
  credentialStatus,
  openSnapshot,
  ping,
  renderDraftPreflight,
  runLiveGemini,
  runMocked,
  saveDraft
} from "./session";

const FORBIDDEN = /(api[_-]?key|token|secret|password|authorization|cookie|credential)/i;

function assertSafePayload(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafePayload(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN.test(key)) {
        throw new Error(`${path}.${key} is not allowed over IPC`);
      }
      assertSafePayload(child, `${path}.${key}`);
    }
  }
}

export function registerIpc(): void {
  const handlers: Record<string, (payload: Record<string, unknown>) => unknown | Promise<unknown>> = {
    "desktop.ping": () => ping(),
    "credential.status": () => credentialStatus(),
    "project.create": (payload) => createDraft(String(payload.projectDirectory ?? ""), String(payload.title ?? "")),
    "project.open": (payload) => openSnapshot(String(payload.projectDirectory ?? "")),
    "project.snapshot": (payload) => openSnapshot(String(payload.projectDirectory ?? "")),
    "project.saveDraft": (payload) => saveDraft(payload as never),
    "project.confirmPersona": (payload) => confirmDraftPersona(String(payload.projectDirectory ?? "")),
    "preflight.render": (payload) => renderDraftPreflight(String(payload.projectDirectory ?? "")),
    "run.mocked": (payload) => runMocked(String(payload.projectDirectory ?? ""), Boolean(payload.acknowledgedDisclaimer)),
    "run.liveGemini": (payload) =>
      runLiveGemini(String(payload.projectDirectory ?? ""), Boolean(payload.acknowledgedDisclaimer)),
    "desktop.chooseDirectory": async () => {
      const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    }
  };

  ipcMain.handle("desktop.invoke", async (_event, channel: unknown, payload: unknown) => {
    if (typeof channel !== "string" || !isIpcChannel(channel)) {
      throw new Error("Unknown IPC channel");
    }
    assertSafePayload(payload ?? {});
    const handler = handlers[channel];
    if (!handler) {
      throw new Error("Unknown IPC channel");
    }
    return handler((payload ?? {}) as Record<string, unknown>);
  });
}
