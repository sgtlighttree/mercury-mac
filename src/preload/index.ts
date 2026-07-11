import { ipcRenderer, webFrame } from "electron";
import { parseUnreadCount } from "./unread";
import { IPC } from "../shared/channels";
import { NOTIFICATION_INJECT_SOURCE } from "../shared/notification-inject";

// Install the notification shim in the MAIN world NOW — the preload runs before any
// page script, so the override wins the race against Messenger's JS capturing a
// reference to the real Notification constructor at module-init time.
void webFrame.executeJavaScript(NOTIFICATION_INJECT_SOURCE);

function reportUnread(): void {
  ipcRenderer.send(IPC.SET_UNREAD, parseUnreadCount(document.title));
}

window.addEventListener("DOMContentLoaded", () => {
  reportUnread();
  const titleEl = document.querySelector("title");
  if (titleEl) {
    new MutationObserver(reportUnread).observe(titleEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
});

// Notification bridge: the main-world shim (injected by the main process) posts here
// when the page creates a notification; relay it to main to show a native one. The two
// worlds share the DOM, so this isolated-world listener receives the main-world message.
window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window) return;
  const d = e.data as { __mercury?: boolean; type?: string; data?: unknown };
  if (!d || d.__mercury !== true) return;
  if (d.type === "notify") ipcRenderer.send(IPC.NOTIFY, d.data);
  else if (d.type === "notify-close") ipcRenderer.send(IPC.NOTIFY_CLOSE, d.data);
});

// Relay native-notification events (click/close) back to the main-world shim.
ipcRenderer.on(IPC.NOTIFY_CALLBACK, (_e, payload: { id: number; event: string }) => {
  window.postMessage({ __mercuryCallback: true, ...payload }, window.location.origin);
});
