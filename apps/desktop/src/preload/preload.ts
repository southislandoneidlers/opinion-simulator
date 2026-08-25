import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("opinionSimulator", {
  invoke: (channel: string, payload?: unknown) => ipcRenderer.invoke("desktop.invoke", channel, payload)
});
