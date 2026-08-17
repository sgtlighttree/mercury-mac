import { isHttpUrl } from "./links";

/**
 * Popup lifecycle policy, kept pure so it can be unit-tested without Electron.
 * index.ts maps these decisions onto real BrowserWindows.
 *
 * Background: every allowed popup is created HIDDEN (see decideWindowOpen in links.ts) and is
 * revealed only once it commits a real http(s) navigation. A popup that never commits one has
 * nothing to show — revealing it produces the blank white window Matt reported.
 */

/**
 * True when a popup has no real page committed — its URL is still the `about:blank` (or empty)
 * placeholder it was opened with. Such a window can only ever render blank.
 */
export function isUncommittedPopup(currentUrl: string): boolean {
  return !isHttpUrl(currentUrl);
}

export type PopupFallback = "reveal" | "destroy" | "wait";

export interface PopupFallbackState {
  /** webContents.getURL() — "" or "about:blank" until a real navigation commits. */
  currentUrl: string;
  /** webContents.isLoading() — a navigation is still in flight. */
  isLoading: boolean;
  /** Milliseconds elapsed since the popup was created. */
  waitedMs: number;
  /** Past this, stop waiting on a loading popup and reclaim it. */
  maxWaitMs: number;
}

/**
 * Decide what to do with a popup that is still hidden when the reveal fallback fires.
 *
 * - Committed a real page but was never revealed → `reveal` (never leak a usable window hidden).
 * - Nothing committed, but a navigation is still in flight → `wait`. THIS IS THE CALLS GATE:
 *   a voice/video call popup opens as `about:blank` and commits its `messenger.com/groupcall/…`
 *   URL afterwards, so on a slow network it is indistinguishable from a dead popup by URL alone.
 *   `isLoading` is what separates them — never destroy a popup that is still loading.
 * - Nothing committed and nothing in flight → `destroy`. This is the orphan left behind when
 *   `will-navigate` hands the popup's only navigation to the system browser.
 * - Still loading past `maxWaitMs` → `destroy`, so a wedged popup cannot leak forever.
 */
export function decidePopupFallback(state: PopupFallbackState): PopupFallback {
  if (!isUncommittedPopup(state.currentUrl)) return "reveal";
  if (state.isLoading && state.waitedMs < state.maxWaitMs) return "wait";
  return "destroy";
}
