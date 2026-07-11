import { ipcRenderer, webFrame } from "electron";
import { parseUnreadCount } from "./unread";
import { isIncomingCallTitle } from "./incoming-call";
import { IPC } from "../shared/channels";
import { NOTIFICATION_INJECT_SOURCE } from "../shared/notification-inject";

// Install the notification shim in the MAIN world NOW — the preload runs before any
// page script, so the override wins the race against Messenger's JS capturing a
// reference to the real Notification constructor at module-init time.
void webFrame.executeJavaScript(NOTIFICATION_INJECT_SOURCE);

// In dark mode, messenger.com's own boot splash is white until its CSS loads;
// pin the document background to the dark surface early. Best-effort cosmetic
// fix — never let it take the rest of the preload down with it.
try {
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    webFrame.insertCSS("html, body { background-color: #1c1c1d; }");
  }
} catch {
  /* cosmetic only */
}

// Ring detection is edge-triggered so a blinking ring title can't spam focus
// steals: INCOMING_CALL fires once when the title starts saying "is calling",
// and re-arms only after the title has stayed normal for a grace period (so a
// retry call a minute later rings the window again).
const RING_REARM_DELAY_MS = 5000;
let ringArmed = true;
let ringRearmTimer: ReturnType<typeof setTimeout> | null = null;

function reportTitle(): void {
  ipcRenderer.send(IPC.SET_UNREAD, parseUnreadCount(document.title));
  if (isIncomingCallTitle(document.title)) {
    if (ringRearmTimer) {
      clearTimeout(ringRearmTimer);
      ringRearmTimer = null;
    }
    if (ringArmed) {
      ringArmed = false;
      ipcRenderer.send(IPC.INCOMING_CALL);
    }
  } else if (!ringArmed && !ringRearmTimer) {
    ringRearmTimer = setTimeout(() => {
      ringRearmTimer = null;
      ringArmed = true;
    }, RING_REARM_DELAY_MS);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  reportTitle();
  const titleEl = document.querySelector("title");
  if (titleEl) {
    new MutationObserver(reportTitle).observe(titleEl, {
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
