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
