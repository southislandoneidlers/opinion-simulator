export const IPC_CHANNELS = [
  "desktop.ping",
  "project.create",
  "project.open",
  "project.snapshot",
  "project.saveDraft",
  "project.confirmPersona",
  "preflight.render",
  "run.mocked",
  "run.liveGemini",
  "credential.status",
  "desktop.chooseDirectory"
] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[number];

export function isIpcChannel(value: string): value is IpcChannel {
  return (IPC_CHANNELS as readonly string[]).includes(value);
}
