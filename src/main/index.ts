import {
  app,
  BrowserWindow,
  Notification,
  shell,
  session,
  ipcMain,
  desktopCapturer,
  systemPreferences,
  nativeTheme,
} from "electron";
import * as path from "path";
import { TARGET_URL } from "./config";
import { isExternalUrl, isHttpUrl, decideWindowOpen } from "./links";
import { loadWindowBounds, saveWindowBounds } from "./window-state";
import { createSplashWindow } from "./splash";
import { IPC } from "../shared/channels";

// Use the product name for userData so dev (`npm start`) and the packaged app
// share one storage dir: login session AND window geometry persist across both.
app.setName("Messenger");

let mainWindow: BrowserWindow | null = null;

/** Window background before the page paints — match the OS theme so pre-load
 *  frames never flash white in dark mode. #1c1c1d ≈ Messenger's dark surface. */
function themeBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? "#1c1c1d" : "#ffffff";
}

/** Attach the window-open + navigation guards to a webContents, recursively
 *  covering any child windows it opens (e.g. the call popup). */
function wireNavigationGuards(wc: Electron.WebContents): void {
  wc.setWindowOpenHandler(({ url, frameName }) => {
    const decision = decideWindowOpen(url, frameName);
    if (decision === "allow") {
      // EVERY allowed popup is created HIDDEN — download popups (about:blank in
      // 1:1 chats, real fbcdn/fbsbx URLs in group chats) never commit a
      // navigation and are destroyed by will-download without ever flashing;
      // real windows (the call popup) are revealed by watchPopup on their first
      // committed navigation.
      return {
        action: "allow",
        overrideBrowserWindowOptions: { show: false, backgroundColor: themeBackgroundColor() },
      };
    }
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
    watchPopup(child);
  });
}

// A hidden popup resolves one of three ways: it commits a real URL (the
// voice/video call window — reveal it and bring the app forward), its navigation
// becomes a download (will-download destroys it, unseen), or neither — then the
// fallback shows it anyway so an unanticipated popup type is never leaked hidden.
const POPUP_REVEAL_FALLBACK_MS = 5000;
function watchPopup(child: BrowserWindow): void {
  const onNavigate = (_event: unknown, url: string): void => {
    if (!isHttpUrl(url) || child.isDestroyed()) return;
    child.webContents.off("did-navigate", onNavigate);
    if (!child.isVisible()) child.show();
    // An incoming ring must grab attention (Matt's note: calls should steal
    // focus) — bring the app forward even if another app is frontmost.
    app.focus({ steal: true });
    child.focus();
  };
  child.webContents.on("did-navigate", onNavigate);
  const fallback = setTimeout(() => {
    if (!child.isDestroyed() && !child.isVisible()) child.show();
  }, POPUP_REVEAL_FALLBACK_MS);
  child.on("closed", () => clearTimeout(fallback));
}

// Cap on how long the splash may cover a hidden main window if neither
// did-finish-load nor did-fail-load ever fires (belt and braces).
const SPLASH_MAX_MS = 15000;

function createWindow(): void {
  const stateFile = path.join(app.getPath("userData"), "window-state.json");
  mainWindow = new BrowserWindow({
    ...loadWindowBounds(stateFile),
    title: "Messenger",
    // Hidden until messenger.com finishes loading; a native theme-aware splash
    // window covers the load so dark mode never sees the white boot flash.
    show: false,
    backgroundColor: themeBackgroundColor(),
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

  const win = mainWindow;
  const splash = createSplashWindow(themeBackgroundColor());
  let revealTimer: NodeJS.Timeout | null = null;
  let revealed = false;
  const reveal = (): void => {
    if (revealed) return;
    revealed = true;
    if (revealTimer) clearTimeout(revealTimer);
    if (!win.isDestroyed()) win.show();
    if (!splash.isDestroyed()) splash.destroy();
  };
  // Reveal on success or failure (offline must show the window, not a stuck splash).
  win.webContents.once("did-finish-load", reveal);
  win.webContents.once("did-fail-load", reveal);
  // Splash killed early (Cmd+W) must not strand a hidden main window.
  splash.on("closed", reveal);
  revealTimer = setTimeout(reveal, SPLASH_MAX_MS);

  mainWindow.loadURL(TARGET_URL);
  mainWindow.on("close", () => {
    if (mainWindow) saveWindowBounds(stateFile, mainWindow.getBounds());
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function configureSession(): void {
  const ses = session.defaultSession;
  ses.on("will-download", (_event, item, webContents) => {
    item.setSavePath(path.join(app.getPath("downloads"), path.basename(item.getFilename())));
    // Bounce the Downloads dock stack on completion, like a real browser does.
    item.once("done", (_e, state) => {
      if (state === "completed") app.dock?.downloadFinished(item.getSavePath());
    });
    // Attachment downloads arrive via a popup whose navigation *became* the
    // download (so it never commits a URL); destroy it (it was created hidden —
    // see watchPopup) instead of leaving a blank white window behind.
    const win = BrowserWindow.fromWebContents(webContents);
    if (win && win !== mainWindow && !isHttpUrl(webContents.getURL())) {
      win.destroy();
    }
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
    // "notifications" is required for messenger.com's web notifications to surface
    // as native macOS notifications (M2 requirement) — without it the site sees
    // "denied" and never posts. Everything else stays denied.
    callback(permission === "display-capture" || permission === "notifications");
  });
  // Synchronous permission checks (navigator.permissions.query) must agree
  // with the request handler above, or the call UI may silently skip prompting.
  ses.setPermissionCheckHandler(
    // `permission: string`: Electron's check-handler type union omits "display-capture"
    // even though such checks occur at runtime; widening the param is type-safe.
    (_wc, permission: string) =>
      permission === "media" || permission === "display-capture" || permission === "notifications",
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
  // Badge stabilizer: messenger.com "blinks" the title ((1) Messenger <-> Messenger)
  // to grab attention, which would blink the dock badge too. Rises apply instantly;
  // a drop to zero only clears after the title stays zero for a grace period, so a
  // quick dock-peek during a blink never shows an empty badge over unread messages.
  const BADGE_CLEAR_DELAY_MS = 2500;
  let badgeClearTimer: NodeJS.Timeout | null = null;
  ipcMain.on(IPC.SET_UNREAD, (event, count: number) => {
    // Only the main window's title carries the unread count; popup windows
    // (e.g. the call window) inherit the preload and must not clobber the badge.
    if (event.sender !== mainWindow?.webContents) return;
    if (typeof count !== "number" || count < 0) return;
    if (count > 0) {
      if (badgeClearTimer) {
        clearTimeout(badgeClearTimer);
        badgeClearTimer = null;
      }
      app.setBadgeCount(count);
    } else if (!badgeClearTimer) {
      badgeClearTimer = setTimeout(() => {
        badgeClearTimer = null;
        app.setBadgeCount(0);
      }, BADGE_CLEAR_DELAY_MS);
    }
  });

  // Incoming call ringing (detected from the page title by the preload): bring
  // the app to the foreground even if another app is frontmost — the ring UI is
  // an in-page dialog, so without this the ring is easy to miss entirely.
  ipcMain.on(IPC.INCOMING_CALL, (event) => {
    if (event.sender !== mainWindow?.webContents) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    app.focus({ steal: true });
  });

  // Show a native notification for a page-created web notification (see notification-inject).
  // Retained in a Map until closed: Electron Notification objects are otherwise prone to
  // premature GC, which silently kills their click/close callbacks (electron#16922).
  const liveNotifications = new Map<number, Notification>();
  ipcMain.on(IPC.NOTIFY, (event, data: { id: number; title?: string; body?: string }) => {
    if (event.sender !== mainWindow?.webContents) return;
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: data.title || "Messenger",
      body: data.body || "",
    });
    liveNotifications.set(data.id, n);
    n.on("click", () => {
      mainWindow?.show();
      mainWindow?.focus();
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC.NOTIFY_CALLBACK, { id: data.id, event: "click" });
      }
    });
    n.on("close", () => {
      liveNotifications.delete(data.id);
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC.NOTIFY_CALLBACK, { id: data.id, event: "close" });
      }
    });
    n.show();
  });
  ipcMain.on(IPC.NOTIFY_CLOSE, (event, data: { id: number }) => {
    if (event.sender !== mainWindow?.webContents) return;
    liveNotifications.get(data.id)?.close();
    liveNotifications.delete(data.id);
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
