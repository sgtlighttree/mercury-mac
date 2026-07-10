import { app, BrowserWindow, shell, session } from "electron";
import * as path from "path";
import { TARGET_URL } from "./config";
import { isExternalUrl, isHttpUrl } from "./links";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    title: "Messenger",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // The page is REMOTE, UNTRUSTED content: keep the OS sandbox on.
      // The preload is esbuild-bundled to a single file so it works sandboxed.
      sandbox: true,
    },
  });
  const wc = mainWindow.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      if (isHttpUrl(url)) void shell.openExternal(url);
      // non-http(s) schemes are dropped entirely
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  wc.on("will-navigate", (event, url) => {
    if (isExternalUrl(url)) {
      event.preventDefault();
      if (isHttpUrl(url)) void shell.openExternal(url);
      // non-http(s) schemes are dropped entirely
    }
  });
  mainWindow.loadURL(TARGET_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function configureSession(): void {
  const ses = session.defaultSession;
  ses.on("will-download", (_event, item) => {
    item.setSavePath(path.join(app.getPath("downloads"), path.basename(item.getFilename())));
  });
}

app.whenReady().then(() => {
  configureSession();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // MVP: quit when the window closes. Close-to-tray is a later polish task.
  if (process.platform !== "darwin") app.quit();
});
