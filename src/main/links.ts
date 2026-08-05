import { ALLOWED_HOSTS, POPUP_EXTERNAL_HOSTS } from "./config";

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

/**
 * True if a window-open request for this URL must go to the system browser even though the
 * host is allowlisted for in-window navigation (see POPUP_EXTERNAL_HOSTS in config.ts).
 * Non-http(s) values return false so they fall through to the existing drop/allow logic.
 */
export function isPopupExternalHost(rawUrl: string): boolean {
  let host: string;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  return POPUP_EXTERNAL_HOSTS.some(
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
 *
 * ORDER IS LOAD-BEARING. The about:blank check must stay FIRST: call popups and 1:1 download
 * popups arrive as about:blank and must be allowed before any host rule can see them. The
 * POPUP_EXTERNAL_HOSTS check sits second, so it only ever inspects window-opens that already
 * carry a real http(s) URL — which calls never do.
 */
export function decideWindowOpen(rawUrl: string, frameName: string): WindowOpenDecision {
  if ((rawUrl === "about:blank" || rawUrl === "about:blank#blocked") && frameName !== "about:blank") {
    return "allow"; // voice/video call popup, or a download about to start
  }
  // Facebook content links (posts, reels, /share/r/… redirects) would otherwise open as an
  // in-app popup with no facebook.com session → sign-in prompt. Send them to the browser.
  if (isPopupExternalHost(rawUrl)) return "open-external";
  if (!isExternalUrl(rawUrl)) return "allow";
  return isHttpUrl(rawUrl) ? "open-external" : "drop";
}
