export const IPC = {
  SET_UNREAD: "set-unread",
  // Renderer (via preload) -> main: post/close a native notification for a page Notification.
  NOTIFY: "notify",
  NOTIFY_CLOSE: "notify-close",
  // Main -> renderer (via preload): a native notification fired an event (click/close).
  NOTIFY_CALLBACK: "notify-callback",
} as const;
