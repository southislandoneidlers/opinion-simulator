import { dispatchIpc, type IpcHandler } from "@opinion-simulator/core";
import { toUserFacingError } from "./user-messages";
import { PROVIDER_METADATA } from "@opinion-simulator/core";
import { readSnapshot } from "@opinion-simulator/project-store";
import { clearProviderApiKey, isProviderId, storeProviderApiKey } from "./credentials";
import {
  addPersona,
  listPersonas,
  removePersona,
  setAutoSave
} from "./persona-library";
import {
  cancelJob,
  confirmDraftPersona,
  credentialStatus,
  enqueueAndProcess,
  listQueuedJobs,
  openOrCreateDraft,
  openSnapshot,
  ping,
  renderDraftPreflight,
  resumeAndProcess,
  retryAndProcess,
  runLive,
  runMocked,
  saveDraft
} from "./session";
import { validateWorkbookAtPath } from "./workbook-file";

export type IpcDependencies = {
  chooseDirectory: () => Promise<string | null>;
  chooseWorkbook: () => Promise<string | null>;
};

export function createIpcHandlers(deps: IpcDependencies): Record<string, IpcHandler> {
  return {
    "desktop.ping": () => ping(),
    "provider.catalog": () => PROVIDER_METADATA,
    "credential.status": () => credentialStatus(),
    "credential.set": async (payload) => {
      const provider = payload.provider;
      if (!isProviderId(provider)) {
        throw new Error("不支援的供應商");
      }
      await storeProviderApiKey(provider, String(payload.value ?? ""));
      return credentialStatus();
    },
    "credential.clear": async (payload) => {
      const provider = payload.provider;
      if (!isProviderId(provider)) {
        throw new Error("不支援的供應商");
      }
      await clearProviderApiKey(provider);
      return credentialStatus();
    },
    "project.create": (payload) =>
      openOrCreateDraft(String(payload.projectDirectory ?? ""), String(payload.title ?? "")),
    "project.open": (payload) => {
      const projectDirectory = String(payload.projectDirectory ?? "");
      const opened = openOrCreateDraft(projectDirectory, "");
      if (!opened.openedExisting) {
        throw new Error("此資料夾不是有效的專案");
      }
      return openSnapshot(projectDirectory);
    },
    "project.snapshot": (payload) => openSnapshot(String(payload.projectDirectory ?? "")),
    "project.saveDraft": (payload) => saveDraft(payload as never),
    "project.confirmPersona": (payload) => confirmDraftPersona(String(payload.projectDirectory ?? "")),
    "preflight.render": (payload) => renderDraftPreflight(String(payload.projectDirectory ?? "")),
    "run.mocked": (payload) =>
      runMocked(
        String(payload.projectDirectory ?? ""),
        String(payload.planHash ?? ""),
        Boolean(payload.acknowledgedDisclaimer)
      ),
    "run.liveGemini": (payload) =>
      runLive(
        String(payload.projectDirectory ?? ""),
        String(payload.planHash ?? ""),
        Boolean(payload.acknowledgedDisclaimer),
        "gemini"
      ),
    "run.liveOpenai": (payload) =>
      runLive(
        String(payload.projectDirectory ?? ""),
        String(payload.planHash ?? ""),
        Boolean(payload.acknowledgedDisclaimer),
        "openai"
      ),
    "queue.enqueue": (payload) => {
      if (payload.mode !== "live" && payload.mode !== "mocked") {
        throw new Error("不支援的執行模式");
      }
      return enqueueAndProcess(
        String(payload.projectDirectory ?? ""),
        String(payload.planHash ?? ""),
        Boolean(payload.acknowledgedDisclaimer),
        payload.mode
      );
    },
    "queue.list": (payload) => ({
      jobs: listQueuedJobs(
        payload.projectDirectory ? String(payload.projectDirectory) : undefined
      )
    }),
    "queue.cancel": (payload) => cancelJob(String(payload.jobId ?? "")),
    "queue.retry": (payload) => retryAndProcess(String(payload.jobId ?? "")),
    "queue.resumeMissing": (payload) =>
      resumeAndProcess(payload.projectDirectory ? String(payload.projectDirectory) : undefined),
    "persona.library.list": () => listPersonas(),
    "persona.library.setAutosave": (payload) => setAutoSave(Boolean(payload.enabled)),
    "persona.library.remove": (payload) => removePersona(String(payload.personaVersionId ?? "")),
    "persona.library.importFromProject": (payload) => {
      const projectDirectory = String(payload.projectDirectory ?? "");
      const snapshot = readSnapshot(projectDirectory);
      if (!snapshot.persona || snapshot.persona.status !== "confirmed") {
        throw new Error("此專案內沒有已確認的 Persona Version 可匯入");
      }
      return addPersona(snapshot.persona, {
        projectId: snapshot.projectId,
        projectDirectory
      });
    },
    "desktop.chooseDirectory": () => deps.chooseDirectory(),
    "desktop.chooseWorkbook": () => deps.chooseWorkbook(),
    "workbook.validate": async (payload) => {
      if (Object.prototype.hasOwnProperty.call(payload, "bytes")) {
        throw new Error("Workbook 內容必須由主程序讀取");
      }
      if (typeof payload.path !== "string") {
        throw new Error("請選擇 Workbook 檔案");
      }
      return validateWorkbookAtPath(payload.path);
    }
  };
}

export async function dispatchDesktopIpc(
  handlers: Record<string, IpcHandler>,
  channel: unknown,
  payload: unknown
): Promise<unknown> {
  try {
    return await dispatchIpc(handlers, channel, payload);
  } catch (error) {
    throw toUserFacingError(error);
  }
}
