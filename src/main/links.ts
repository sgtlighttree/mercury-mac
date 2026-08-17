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

/**
 * Facebook/Messenger wrap outbound chat links in a tracking "link shim" that carries the real
 * destination in a `u` query param:
 *
 *   https://l.messenger.com/l.php?u=https%3A%2F%2Fdrive.google.com%2F...&h=AT...
 *   https://www.facebook.com/flx/warn/?u=<encoded>&h=AT...      ("Leaving Facebook" interstitial)
 *
 * Shape verified from Caprine's `stripTrackingFromUrl` (source/util.ts) plus a real observed URL
 * in caprine#286. `l.messenger.com` ends with `.messenger.com`, so ALLOWED_HOSTS matches it and
 * the shim would otherwise open as an in-app popup — which is the blank-window bug: the shim page
 * renders nothing, bounces to the real destination, and leaves its window behind.
 *
 * Returns the real destination, or null when this is not a shim (or carries no usable target).
 *
 * SECURITY: the unwrapped value is attacker-influenced (it is a query param on a page we do not
 * control), and it is destined for shell.openExternal. Only http(s) is ever returned, so a
 * `javascript:`/`file:`/custom-scheme payload smuggled through `u` can never reach the shell.
 */
const SHIM_HOSTS = ["l.messenger.com", "l.facebook.com", "lm.facebook.com"];
export function unwrapLinkShim(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  const isShimHost = SHIM_HOSTS.includes(host) && parsed.pathname === "/l.php";
  const isWarnPath = parsed.pathname.startsWith("/flx/warn");
  if (!isShimHost && !isWarnPath) return null;
  const target = parsed.searchParams.get("u");
  if (!target || !isHttpUrl(target)) return null;
  return target;
}

/** True if this URL is a link shim — a redirector whose only job is to bounce elsewhere. */
export function isLinkShim(rawUrl: string): boolean {
  return unwrapLinkShim(rawUrl) !== null;
}

/**
 * The URL to actually hand to the system browser: the real destination when this is a tracking
 * shim, otherwise the URL as-is. Sending the user straight to the destination also skips
 * Facebook's click tracking.
 */
export function externalTarget(rawUrl: string): string {
  return unwrapLinkShim(rawUrl) ?? rawUrl;
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
  // Tracking link shim (`l.messenger.com/l.php?u=…`). Its host is allowlisted, so without this it
  // returns "allow" and opens as a popup that renders nothing, bounces to the real destination,
  // and is left behind as a blank white window. Confirmed from Matt's 2026-08-17 trace:
  //   window-open url=https://l.messenger.com/l.php?u=https%3A%2F%2Fdocs.google.com%2F… decision=allow
  // index.ts unwraps `u` so the browser goes straight to the destination, skipping FB's tracking.
  if (isLinkShim(rawUrl)) return "open-external";
  // Facebook content links (posts, reels, /share/r/… redirects) would otherwise open as an
  // in-app popup with no facebook.com session → sign-in prompt. Send them to the browser.
  if (isPopupExternalHost(rawUrl)) return "open-external";
  if (!isExternalUrl(rawUrl)) return "allow";
  return isHttpUrl(rawUrl) ? "open-external" : "drop";
}
