import { app, BrowserWindow, session, shell } from "electron";
import { join } from "node:path";
import { registerIpc } from "./ipc";
import { configureLastProjectDirectory } from "./last-project";
import { configureLibraryDirectory } from "./persona-library";
import { configureQueueDirectory } from "./run-queue";

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  const renderer = join(__dirname, "../renderer/index.html");
  void window.loadFile(renderer);
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"
        ]
      }
    });
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  // v0.2 increment 4–6 & v0.3 increment 1: Persona library, Run queue, and last project live in Electron userData.
  configureLibraryDirectory(app.getPath("userData"));
  configureQueueDirectory(app.getPath("userData"));
  configureLastProjectDirectory(app.getPath("userData"));
  registerIpc();
  createWindow();
});

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => {
    event.preventDefault();
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
  });
});
