import { ALLOWED_HOSTS } from "./config";

/** True if the URL should open in the system browser rather than in the app window. */
export function isExternalUrl(rawUrl: string): boolean {
  let host: string;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return true;
    host = parsed.hostname.toLowerCase();
  } catch {
    return true; // unparseable / non-URL scheme → don't navigate the app to it
  }
  return !ALLOWED_HOSTS.some(
    (allowed) => host === allowed || host.endsWith("." + allowed),
  );
}

/** True for http:/https: URLs in any case, the only schemes we hand to shell.openExternal. */
export function isHttpUrl(rawUrl: string): boolean {
  return /^https?:/i.test(rawUrl);
}

export type WindowOpenDecision = "allow" | "open-external" | "drop";

/**
 * Decide how to handle a window.open / new-window request.
 * about:blank popups are ALLOWED: messenger.com opens its voice/video call
 * UI as an about:blank window it then navigates (see Caprine's identical
 * special case) — and uses popups for attachment downloads too (about:blank in
 * 1:1 chats, a real fbcdn/fbsbx URL in group chats; either way the navigation
 * *becomes* the download and never commits). index.ts creates every allowed
 * popup hidden, revealing it on its first committed navigation and destroying
 * it if it turns out to be a download. The popup inherits the parent's hardened
 * webPreferences, and child navigations are guarded separately in index.ts.
 */
export function decideWindowOpen(rawUrl: string, frameName: string): WindowOpenDecision {
  if ((rawUrl === "about:blank" || rawUrl === "about:blank#blocked") && frameName !== "about:blank") {
    return "allow"; // voice/video call popup, or a download about to start
  }
  if (!isExternalUrl(rawUrl)) return "allow";
  return isHttpUrl(rawUrl) ? "open-external" : "drop";
}
