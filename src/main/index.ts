import { app, BrowserWindow, shell, session, ipcMain, desktopCapturer, systemPreferences } from "electron";
import * as path from "path";
import { TARGET_URL } from "./config";
import { isExternalUrl, isHttpUrl, decideWindowOpen } from "./links";
import { IPC } from "../shared/channels";

let mainWindow: BrowserWindow | null = null;

/** Attach the window-open + navigation guards to a webContents, recursively
 *  covering any child windows it opens (e.g. the call popup). */
function wireNavigationGuards(wc: Electron.WebContents): void {
  wc.setWindowOpenHandler(({ url, frameName }) => {
    const decision = decideWindowOpen(url, frameName);
    if (decision === "allow") return { action: "allow" };
    if (decision === "open-external") void shell.openExternal(url);
    else if (process.env.NODE_ENV !== "production") {
      console.log("[window-open] dropped:", url);
    }
    return { action: "deny" };
  });
  wc.on("will-navigate", (event, url) => {
    // For popups, about:blank -> messenger call URL is the expected legit transition.
    if (isExternalUrl(url)) {
      event.preventDefault();
      if (isHttpUrl(url)) void shell.openExternal(url);
      // non-http(s) schemes are dropped entirely
    }
  });
  wc.on("did-create-window", (child) => {
    wireNavigationGuards(child.webContents);
  });
}

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
  wireNavigationGuards(mainWindow.webContents);
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
  // For media, first ensure macOS-level (TCC) access: Electron does not reliably
  // trigger the OS prompt on its own, and a web-layer grant is useless without it.
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (permission === "media") {
      const wanted: Array<"microphone" | "camera"> = [];
      const mediaTypes = "mediaTypes" in details ? details.mediaTypes ?? [] : [];
      if (mediaTypes.includes("audio")) wanted.push("microphone");
      if (mediaTypes.includes("video")) wanted.push("camera");
      void Promise.all(
        wanted.map(async (device) => {
          // 'not-determined' -> shows the macOS prompt; 'denied' cannot re-prompt.
          if (systemPreferences.getMediaAccessStatus(device) === "not-determined") {
            return systemPreferences.askForMediaAccess(device);
          }
          return systemPreferences.getMediaAccessStatus(device) === "granted";
        }),
      ).then((results) => {
        const ok = results.every(Boolean);
        if (!ok) {
          console.error(
            "[media] macOS denies capture (grant in System Settings → Privacy):",
            wanted.map((d) => `${d}=${systemPreferences.getMediaAccessStatus(d)}`).join(" "),
          );
        }
        callback(ok);
      });
      return;
    }
    callback(permission === "display-capture");
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
  ipcMain.on(IPC.SET_UNREAD, (event, count: number) => {
    // Only the main window's title carries the unread count; popup windows
    // (e.g. the call window) inherit the preload and must not clobber the badge.
    if (event.sender !== mainWindow?.webContents) return;
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
