import { dialog, ipcMain } from "electron";
import { createIpcHandlers, dispatchDesktopIpc } from "./ipc-handlers";

export function registerIpc(): void {
  const handlers = createIpcHandlers({
    chooseDirectory: async () => {
      const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    },
    chooseWorkbook: async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }]
      });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    },
    chooseMaterialFile: async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "文件與純文字", extensions: ["txt", "md", "markdown", "docx", "pdf"] }]
      });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    }
  });

  ipcMain.handle("desktop.invoke", async (_event, channel: unknown, payload: unknown) => {
    return dispatchDesktopIpc(handlers, channel, payload);
  });
}
