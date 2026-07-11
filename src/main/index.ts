import { app, BrowserWindow, shell, session, ipcMain, desktopCapturer } from "electron";
import * as path from "path";
import { TARGET_URL } from "./config";
import { isExternalUrl, isHttpUrl } from "./links";
import { IPC } from "../shared/channels";

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
  // Grant only media (camera/mic) and screen capture; deny all other permissions.
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media" || permission === "display-capture");
  });
  // Synchronous permission checks (navigator.permissions.query) must agree
  // with the request handler above, or the call UI may silently skip prompting.
  ses.setPermissionCheckHandler(
    // `permission: string`: Electron's check-handler type union omits "display-capture"
    // even though such checks occur at runtime; widening the param is type-safe.
    (_wc, permission: string) => permission === "media" || permission === "display-capture",
  );
  // Screen share: grant the primary screen. A source-picker UI is a later enhancement.
  // Requires the macOS Screen Recording permission (System Settings → Privacy).
  ses.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer.getSources({ types: ["screen"] })
      .then((sources) => {
        if (sources.length > 0) {
          callback({ video: sources[0] });
        } else {
          callback({});
        }
      })
      .catch((err) => {
        console.error("display-media getSources failed:", err);
        callback({});
      });
  });
}

app.whenReady().then(() => {
  ipcMain.on(IPC.SET_UNREAD, (_event, count: number) => {
    if (typeof count === "number" && count >= 0) app.setBadgeCount(count);
  });
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
