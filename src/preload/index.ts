import { ipcRenderer } from "electron";
import { parseUnreadCount } from "./unread";
import { IPC } from "../shared/channels";

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
